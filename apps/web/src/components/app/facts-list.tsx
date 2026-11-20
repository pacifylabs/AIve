import { confirmFactAction, removeFactAction } from '@/app/actions/platform';
import { EditFactForm } from '@/app/app/company/company-forms';
import { FACT_KINDS } from '@/app/app/company/fact-kinds';

export interface Fact {
  id: string;
  kind: (typeof FACT_KINDS)[number][0];
  text: string;
  source: 'owner' | 'website';
  sourceUrl: string | null;
  confirmedAt: string | null;
}

/**
 * The company facts by kind, each marked confirmed or "from your website", with Confirm, Edit and Remove for anyone
 * who may change them. Staff only ever use confirmed facts, so the unconfirmed ones say so.
 */
export function FactsList({ facts, canEdit }: { facts: Fact[]; canEdit: boolean }) {
  return (
    <div className="space-y-5">
      {FACT_KINDS.map(([kind, heading]) => {
        const ofKind = facts.filter((fact) => fact.kind === kind);
        if (!ofKind.length) return null;
        return (
          <div key={kind} className="space-y-2">
            <h3 className="text-sm font-medium text-muted">{heading}</h3>
            <ul className="card divide-y divide-line-soft">
              {ofKind.map((fact) => (
                <li key={fact.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p>{fact.text}</p>
                    {fact.confirmedAt ? (
                      <p className="text-xs text-ok">Confirmed. Staff may use it.</p>
                    ) : (
                      <p className="text-xs text-amber">
                        From your website{fact.sourceUrl ? ` (${new URL(fact.sourceUrl).pathname})` : ''}. Not used
                        until you confirm it.
                      </p>
                    )}
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap items-center gap-3">
                      {!fact.confirmedAt ? (
                        <form action={confirmFactAction}>
                          <input type="hidden" name="id" value={fact.id} />
                          <button type="submit" className="btn btn-sm btn-primary">
                            Confirm
                          </button>
                        </form>
                      ) : null}
                      <EditFactForm id={fact.id} text={fact.text} />
                      <form action={removeFactAction}>
                        <input type="hidden" name="id" value={fact.id} />
                        <button type="submit" className="text-sm text-danger hover:underline">
                          Remove
                        </button>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
