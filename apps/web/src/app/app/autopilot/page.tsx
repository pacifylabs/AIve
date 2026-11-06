import { decideOfferAction, stopAutopilotAction } from '@/app/actions/platform';
import { apiOrRedirect } from '@/lib/api';
import { type AutopilotRules, EnableNowForm, RulesForm } from './autopilot-forms';

export const metadata = { title: 'Autopilot' };

interface TaskView {
  staffId: string;
  staffName: string;
  taskType: string;
  taskName: string;
  autonomy: 'off' | 'draft' | 'act';
  mode: 'off' | 'ask' | 'auto';
  rules: AutopilotRules;
  defaults: AutopilotRules;
  progress: { approvals: number; rejections: number; medianEditRatio: number; met: boolean; missing: string[] };
  autoActionsToday: number;
  demotedAt: string | null;
  demotedReason: string | null;
  offerId: string | null;
}

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

function Status({ task }: { task: TaskView }) {
  if (task.autonomy === 'act') {
    return <span className="pill pill-ok">Autopilot on</span>;
  }
  if (task.autonomy === 'off') {
    return <span className="pill">Turned off</span>;
  }
  return <span className="pill pill-warn">Waiting for your approval</span>;
}

function Record({ task }: { task: TaskView }) {
  const { progress, rules } = task;
  const share = Math.min(100, Math.round((progress.approvals / rules.approvals) * 100));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {progress.approvals} of {rules.approvals} approvals
        </span>
        <span className="text-muted">
          last {rules.windowDays} days · {progress.rejections} rejected · typical edit{' '}
          {percent(progress.medianEditRatio)} (limit {percent(rules.maxMedianEditRatio)})
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Approvals toward the rules"
        aria-valuemin={0}
        aria-valuemax={rules.approvals}
        aria-valuenow={Math.min(progress.approvals, rules.approvals)}
        className="h-2 overflow-hidden rounded-full bg-subtle"
      >
        <div className="h-full bg-accent" style={{ width: `${share}%` }} />
      </div>
      {progress.met ? (
        <p className="text-sm">The record meets your rules.</p>
      ) : (
        <p className="text-sm text-muted">Still needed: {progress.missing.join('; ')}.</p>
      )}
    </div>
  );
}

export default async function AutopilotPage() {
  const tasks = await apiOrRedirect<TaskView[]>('/autopilot', '/app/autopilot', { workspace: true });

  return (
    <section className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="page-title">Autopilot</h1>
        <p className="text-muted">
          Tired of approving every post? Choose the record a staff member must earn, and it will stop asking. You can
          take it back at any time.
        </p>
      </div>

      <div className="space-y-2 card p-5 text-sm">
        <h2 className="font-medium">What never changes, even on autopilot</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>
            The guardrails still check every draft: only facts from your company profile, your banned words, allowed
            links and each network&rsquo;s length rules. A draft that fails one comes to your inbox instead of going
            out.
          </li>
          <li>Complaints and sensitive topics always come to you.</li>
          <li>Replies to comments and messages are never sent without you.</li>
          <li>Past the daily limit, drafts wait for your approval until the next day.</li>
          <li>Three rejections in a row, or a reconnected account, put the task back on approval.</li>
        </ul>
      </div>

      {!tasks.ok ? (
        <p className="text-danger">{tasks.problem.title}</p>
      ) : tasks.data.length === 0 ? (
        <div className="empty">
          <h2 className="font-medium">Nobody to set up yet</h2>
          <p className="mt-1 text-sm text-muted">Hire a staff member, and the tasks that post or send appear here.</p>
        </div>
      ) : (
        <ul className="space-y-6">
          {tasks.data.map((task) => (
            <li key={`${task.staffId}:${task.taskType}`} className="space-y-5 card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{task.staffName}</h2>
                  <p className="text-sm text-muted">{task.taskName}</p>
                </div>
                <Status task={task} />
              </div>

              {task.autonomy === 'act' ? (
                <div className="space-y-3">
                  <p className="text-sm">
                    {task.staffName} now acts without review: {task.autoActionsToday} of {task.rules.maxPerDay} today.
                  </p>
                  <form action={stopAutopilotAction}>
                    <input type="hidden" name="staffId" value={task.staffId} />
                    <input type="hidden" name="taskType" value={task.taskType} />
                    <button type="submit" className="btn">
                      Go back to approving everything
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <Record task={task} />
                  {task.demotedReason ? (
                    <p className="card-flat px-3 py-2 text-sm text-muted">
                      Pulled back to approval: {task.demotedReason}
                    </p>
                  ) : null}
                  {task.offerId ? (
                    <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
                      <p>{task.staffName} has earned autopilot under your rules. Turn it on?</p>
                      <div className="flex gap-3">
                        <form action={decideOfferAction}>
                          <input type="hidden" name="offerId" value={task.offerId} />
                          <input type="hidden" name="accept" value="yes" />
                          <button type="submit" className="btn btn-primary">
                            Turn on autopilot
                          </button>
                        </form>
                        <form action={decideOfferAction}>
                          <input type="hidden" name="offerId" value={task.offerId} />
                          <input type="hidden" name="accept" value="no" />
                          <button type="submit" className="btn">
                            Not yet
                          </button>
                        </form>
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              <details className="card-flat px-4 py-3" open={task.autonomy !== 'act'}>
                <summary className="cursor-pointer text-sm font-medium">Rules</summary>
                <div className="pt-4">
                  <RulesForm
                    staffId={task.staffId}
                    taskType={task.taskType}
                    mode={task.mode}
                    rules={task.rules}
                    defaults={task.defaults}
                  />
                </div>
              </details>

              {task.autonomy === 'draft' ? (
                <details className="card-flat px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium">Skip the record and turn it on now</summary>
                  <div className="space-y-3 pt-4">
                    <p className="text-sm text-muted">
                      For when you already trust this staff member. Only the owner can do this.
                    </p>
                    <EnableNowForm staffId={task.staffId} taskType={task.taskType} staffName={task.staffName} />
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
