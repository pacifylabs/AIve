import {
  ConnectedAccount,
  type DataSource,
  In,
  PostSchedule,
  StaffMember,
  withTenant,
  Workspace,
  asSystem,
} from '@ai-staff/db';
import { localDate, zonedTimeToUtc } from '../time.js';
import { occurrences, type Recurrence } from './recurrence.js';
import { createPublishIntent } from './social-effects.js';

/** How far ahead recurring posts are made, so a person can see and cancel them on the calendar. */
export const HORIZON_DAYS = 28;

/**
 * Turns each active rule into ordinary scheduled posts for the next four weeks. Every post has the key
 * `recur:<rule>:<date>:<account>`, so running this again (the worker does, daily, and the API does once on creating a
 * rule) never makes a second copy, and a post a person cancelled is not made again. A rule is skipped while the workspace
 * has no active Social Media Staff member, and a broken account is skipped until it is reconnected.
 */
export class RecurringPosts {
  constructor(
    private readonly db: DataSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Makes the posts for one rule, or for every active rule when none is named. Returns how many posts were made. */
  async generate(only?: { workspaceId: string; scheduleId: string }): Promise<number> {
    const rules = only
      ? [{ id: only.scheduleId, workspaceId: only.workspaceId }]
      : await asSystem(this.db, 'recurring: list active rules', async (m) => {
          const rows = (await m.query(`SELECT id, workspace_id FROM post_schedules WHERE state = 'active'`)) as {
            id: string;
            workspace_id: string;
          }[];
          return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id }));
        });
    let made = 0;
    for (const { id, workspaceId } of rules) {
      made += await withTenant(this.db, { workspaceId, userId: null }, (m) => this.forRule(m, workspaceId, id));
    }
    return made;
  }

  private async forRule(
    m: Parameters<Parameters<typeof withTenant>[2]>[0],
    workspaceId: string,
    id: string,
  ): Promise<number> {
    const rule = await m.findOneBy(PostSchedule, { workspaceId, id });
    if (!rule || rule.state !== 'active') return 0;
    const [workspace, staff, accounts] = await Promise.all([
      m.findOneByOrFail(Workspace, { id: workspaceId }),
      m.findOne(StaffMember, {
        where: { workspaceId, roleKey: 'social_media', state: 'active' },
        order: { createdAt: 'ASC' },
      }),
      m.find(ConnectedAccount, { where: { workspaceId, id: In(rule.accountIds) } }),
    ]);
    if (!staff) return 0;
    const now = this.now();
    const today = localDate(now, workspace.timezone);
    const horizon = localDate(new Date(now.getTime() + HORIZON_DAYS * 86_400_000), workspace.timezone);
    const dates = occurrences(rule.rule as unknown as Recurrence, rule.startsOn, rule.endsOn, today, horizon);
    let made = 0;
    for (const date of dates) {
      const when = zonedTimeToUtc(date, rule.atTime, workspace.timezone);
      if (when.getTime() < now.getTime()) continue;
      for (const account of accounts) {
        if (account.health === 'broken') continue;
        const result = await createPublishIntent(
          m,
          workspaceId,
          staff.id,
          {
            type: 'createPublishIntent',
            accountId: account.id,
            body: rule.body,
            linkUrl: rule.linkUrl,
            firstComment: rule.firstComment,
            media: rule.media,
            scheduledFor: when.toISOString(),
            idempotencyKey: `recur:${rule.id}:${date}:${account.id}`,
          },
          { createdBy: rule.createdBy, tagId: rule.tagId, followUps: rule.followUps },
        );
        if (result.created) made += 1;
      }
    }
    return made;
  }
}
