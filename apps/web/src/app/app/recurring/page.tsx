import Link from 'next/link';
import { pauseScheduleAction, removeScheduleAction } from '@/app/actions/social';
import { apiOrRedirect } from '@/lib/api';

export const metadata = { title: 'Recurring posts' };

interface Rule {
  id: string;
  body: string;
  state: 'active' | 'paused';
  rule: {
    kind: 'weekly' | 'monthly_day' | 'monthly_weekday';
    weekdays?: number[];
    everyWeeks?: number;
    dayOfMonth?: number;
    nth?: number;
    weekday?: number;
  };
  atTime: string;
  endsOn: string | null;
  accountIds: string[];
  next: string[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'last'];

/** The rule in the words a person would use. */
function describe(rule: Rule): string {
  const r = rule.rule;
  const at = `at ${rule.atTime}`;
  if (r.kind === 'weekly') {
    const days = (r.weekdays ?? []).map((day) => DAYS[day]).join(', ');
    return `${r.everyWeeks && r.everyWeeks > 1 ? `Every ${r.everyWeeks} weeks` : 'Every week'} on ${days} ${at}`;
  }
  if (r.kind === 'monthly_day') return `Every month on day ${r.dayOfMonth} ${at}`;
  return `On the ${ORDINAL[r.nth ?? 1]} ${DAYS[r.weekday ?? 1]} of every month ${at}`;
}

export default async function RecurringPage() {
  const [rules, accounts] = await Promise.all([
    apiOrRedirect<Rule[]>('/social/schedules', '/app/recurring', { workspace: true }),
    apiOrRedirect<{ id: string; name: string }[]>('/social/accounts', '/app/recurring', { workspace: true }),
  ]);
  if (!rules.ok) return <p className="text-danger">{rules.problem.title}</p>;
  const nameOf = new Map((accounts.ok ? accounts.data : []).map((account) => [account.id, account.name]));

  return (
    <section className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="page-title">Recurring posts</h1>
          <p className="text-muted">
            Posts that repeat. They are made four weeks ahead and appear on the Calendar, where you can cancel any one.
            Removing a rule keeps the posts already made.
          </p>
        </div>
        <Link href="/app/compose" className="btn btn-primary">
          New post
        </Link>
      </div>
      {rules.data.length === 0 ? (
        <p className="empty text-sm text-muted">
          Nothing repeats yet. Choose a repeat when you write a post on the New post page.
        </p>
      ) : (
        <ul className="space-y-3">
          {rules.data.map((rule) => (
            <li key={rule.id} className="card space-y-2 p-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{describe(rule)}</span>
                <span className={rule.state === 'active' ? 'pill pill-ok' : 'pill'}>
                  {rule.state === 'active' ? 'Repeating' : 'Paused'}
                </span>
              </div>
              <p className="line-clamp-2 whitespace-pre-wrap text-muted">{rule.body}</p>
              <p className="text-xs text-muted">
                To {rule.accountIds.map((id) => nameOf.get(id) ?? 'a removed account').join(', ')}
                {rule.endsOn ? ` · until ${rule.endsOn}` : ''}
                {rule.next.length && rule.state === 'active' ? ` · next ${rule.next.join(', ')}` : ''}
              </p>
              <div className="flex gap-4">
                <form action={pauseScheduleAction}>
                  <input type="hidden" name="id" value={rule.id} />
                  <input type="hidden" name="paused" value={rule.state === 'active' ? 'true' : 'false'} />
                  <button type="submit" className="font-medium text-accent hover:underline">
                    {rule.state === 'active' ? 'Pause' : 'Resume'}
                  </button>
                </form>
                <form action={removeScheduleAction}>
                  <input type="hidden" name="id" value={rule.id} />
                  <button type="submit" className="text-danger hover:underline">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
