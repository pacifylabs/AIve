import { ActivityEvent, type EntityManager, SpendCap, UsageReservation } from '@ai-staff/db';

/** A reservation stops counting after this long, so a worker that died mid-call cannot hold money forever. */
const RESERVATION_TTL_MS = 10 * 60_000;

export interface ReserveRequest {
  workspaceId: string;
  staffId: string | null;
  taskRunId: string | null;
  kind: UsageReservation['kind'];
  model: string | null;
  usd: number;
  /** The staff member's own daily cap, if it has one. */
  staffDailyCapUsd: number | null;
}

export type ReserveOutcome =
  { ok: true; reservation: UsageReservation } | { ok: false; limit: 'workspace_month' | 'staff_day'; retryAt: Date };

const startOfMonthUtc = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const startOfDayUtc = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const periodKey = (now: Date) => now.toISOString().slice(0, 7);

/**
 * Money set aside before a paid call and settled after it, ported from KudiBooks `SalesAgentService.reserve/settle/
 * release` and widened from one persona to a workspace and its staff. Spend counts settled amounts plus live
 * reservations; expired reservations stop counting.
 *
 * Every method takes the caller's tenant-scoped EntityManager, so it runs inside withTenant.
 */
export class BudgetService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Spend so far this month and today, in USD. */
  async spent(m: EntityManager, workspaceId: string, staffId: string | null) {
    const now = this.now();
    const [row] = (await m.query(
      `SELECT
         COALESCE(SUM(CASE WHEN state = 'settled' THEN actual_usd
                           WHEN state = 'reserved' AND expires_at > $2 THEN reserved_usd ELSE 0 END), 0)::float AS month,
         COALESCE(SUM(CASE WHEN created_at >= $3 AND ($4::uuid IS NULL OR staff_id = $4) THEN
                        CASE WHEN state = 'settled' THEN actual_usd
                             WHEN state = 'reserved' AND expires_at > $2 THEN reserved_usd ELSE 0 END
                      ELSE 0 END), 0)::float AS staff_day
       FROM usage_reservations
       WHERE workspace_id = $1 AND created_at >= $5`,
      [workspaceId, now, startOfDayUtc(now), staffId, startOfMonthUtc(now)],
    )) as { month: number; staff_day: number }[];
    return { month: row?.month ?? 0, staffDay: row?.staff_day ?? 0 };
  }

  async reserve(m: EntityManager, request: ReserveRequest): Promise<ReserveOutcome> {
    const now = this.now();
    // One lock per workspace: two runs cannot both squeeze under the cap with the last dollar.
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`budget:${request.workspaceId}`]);

    const cap = await m.findOneBy(SpendCap, { workspaceId: request.workspaceId });
    const spent = await this.spent(m, request.workspaceId, request.staffId);

    if (cap && spent.month + request.usd > cap.monthlyCapUsd) {
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return { ok: false, limit: 'workspace_month', retryAt: nextMonth };
    }
    if (request.staffDailyCapUsd !== null && spent.staffDay + request.usd > request.staffDailyCapUsd) {
      const tomorrow = new Date(startOfDayUtc(now).getTime() + 24 * 60 * 60_000);
      return { ok: false, limit: 'staff_day', retryAt: tomorrow };
    }

    const reservation = m.create(UsageReservation, {
      workspaceId: request.workspaceId,
      staffId: request.staffId,
      taskRunId: request.taskRunId,
      kind: request.kind,
      model: request.model,
      reservedUsd: request.usd,
      actualUsd: 0,
      state: 'reserved',
      expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
    });
    return { ok: true, reservation: await m.save(reservation) };
  }

  /** Records what the call really cost, then alerts once a month when spend crosses the owner's alert threshold. */
  async settle(
    m: EntityManager,
    workspaceId: string,
    reservationId: string,
    usage: { usd: number; inputTokens: number; outputTokens: number; model: string },
  ): Promise<void> {
    await m.update(
      UsageReservation,
      { id: reservationId, workspaceId },
      {
        state: 'settled',
        actualUsd: usage.usd,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        model: usage.model,
      },
    );
    await this.alertIfNearCap(m, workspaceId);
  }

  /** Gives the money back: the call failed or never happened. */
  async release(m: EntityManager, workspaceId: string, reservationId: string): Promise<void> {
    await m.update(UsageReservation, { id: reservationId, workspaceId, state: 'reserved' }, { state: 'released' });
  }

  private async alertIfNearCap(m: EntityManager, workspaceId: string): Promise<void> {
    const cap = await m.findOneBy(SpendCap, { workspaceId });
    if (!cap) return;
    const period = periodKey(this.now());
    if (cap.alertedPeriod === period) return;
    const { month } = await this.spent(m, workspaceId, null);
    if (month < (cap.monthlyCapUsd * cap.alertAtPct) / 100) return;
    await m.update(SpendCap, { id: cap.id, workspaceId }, { alertedPeriod: period });
    await m.save(
      m.create(ActivityEvent, {
        workspaceId,
        staffId: null,
        actor: 'system',
        type: 'budget.alert',
        summary: `You have used ${Math.round((month / cap.monthlyCapUsd) * 100)}% of this month's $${cap.monthlyCapUsd} spending cap.`,
        detail: { spentUsd: month, capUsd: cap.monthlyCapUsd },
        costUsd: null,
      }),
    );
  }
}
