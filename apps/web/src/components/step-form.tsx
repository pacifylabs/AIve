'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/app/icons';
import { FormMessages } from '@/components/form';
import { useDraftHandle } from '@/components/form-draft';
import {
  collectValues,
  type DraftValues,
  type FieldLike,
  readDraft,
  removeDraft,
  sessionStore,
  writeDraft,
} from '@/lib/form-draft';
import type { FormState } from '@/lib/form-state';

export interface StepDef {
  title: string;
  content: ReactNode;
  /** A rule the browser cannot check on its own, such as "pick at least one account". Returns the message, or null. */
  check?: (form: HTMLFormElement) => string | null;
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isControl = (el: Element): el is Control =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

const controlsOf = (root: HTMLFormElement | HTMLFieldSetElement) => Array.from(root.elements).filter(isControl);

const fieldsOf = (form: HTMLFormElement): FieldLike[] =>
  controlsOf(form).map((el) => ({
    name: el.name,
    type: el.type,
    value: el.value,
    checked: el instanceof HTMLInputElement ? el.checked : undefined,
    disabled: el.disabled,
  }));

const stepOf = (form: HTMLFormElement, index: number) =>
  form.querySelector<HTMLFieldSetElement>(`fieldset[data-step="${index}"]`);

const labelOf = (el: Control) => el.labels?.[0]?.textContent?.trim() || el.getAttribute('aria-label') || el.name;

interface Section {
  index: number;
  title: string;
  rows: { label: string; values: string[] }[];
}

/** What each step holds, as a person would read it back: label and answer, ticked boxes under their group's name. */
function summarize(form: HTMLFormElement, steps: StepDef[]): Section[] {
  return steps.map((step, index) => {
    const rows = new Map<string, string[]>();
    const add = (label: string, value: string) => rows.set(label, [...(rows.get(label) ?? []), value]);
    const fieldset = stepOf(form, index);
    for (const el of fieldset ? controlsOf(fieldset) : []) {
      if (!el.name || el.disabled || ['hidden', 'submit', 'button', 'file'].includes(el.type)) continue;
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        if (!el.checked) continue;
        const group = el.closest('fieldset:not([data-step])')?.querySelector('legend')?.textContent?.trim();
        add(group ?? labelOf(el), labelOf(el));
      } else if (el instanceof HTMLSelectElement) {
        if (el.value) add(labelOf(el), el.selectedOptions[0]?.textContent?.trim() ?? el.value);
      } else if (el.type === 'password') {
        if (el.value) add(labelOf(el), 'Entered');
      } else if (el.value.trim()) {
        add(labelOf(el), el.value.trim());
      }
    }
    return { index, title: step.title, rows: [...rows].map(([label, values]) => ({ label, values })) };
  });
}

/** The first step, before `upTo`, that is not ready: a field the browser finds invalid, or a failed `check`. */
function firstBlocked(form: HTMLFormElement, steps: StepDef[], upTo: number) {
  for (let index = 0; index < Math.min(upTo, steps.length); index += 1) {
    const fieldset = stepOf(form, index);
    if (fieldset && controlsOf(fieldset).some((el) => el.willValidate && !el.checkValidity()))
      return { index, message: null };
    const message = steps[index]!.check?.(form) ?? null;
    if (message) return { index, message };
  }
  return null;
}

/** Puts ticked boxes back after a refused send: React resets the form, and the echoed values keep one value per name. */
function restoreChecks(form: HTMLFormElement, values: DraftValues) {
  for (const el of controlsOf(form)) {
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') && el.name)
      el.checked = values[el.name]?.includes(el.value) ?? false;
  }
}

/**
 * A long form in steps. Every step stays in the page and only the current one shows, so the form sends exactly what
 * it sent as one page and its server action is unchanged. Next checks the step first; the last step reads everything
 * back before sending. Typing is saved for this tab (see components/form-draft.tsx) and brought back on return.
 */
export function StepForm({
  action,
  state,
  steps,
  submit,
  hidden,
}: {
  action: (data: FormData) => void;
  state: FormState;
  steps: StepDef[];
  /** The send button, shown on the review step. */
  submit: ReactNode;
  /** Hidden inputs the page fills in, such as a request id. */
  hidden?: ReactNode;
}) {
  const handle = useDraftHandle();
  const titles = [...steps.map((step) => step.title), 'Review'];
  const review = steps.length;
  const [current, setCurrent] = useState(() => Math.min(Math.max(handle?.draft?.step ?? 0, 0), review));
  const [reached, setReached] = useState(current);
  const [stepError, setStepError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Section[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const currentRef = useRef(current);
  const moved = useRef(false);
  const report = useRef(false);
  const sentValues = useRef<DraftValues | null>(null);
  const lastState = useRef(state);
  // The steps are a new array each render; the review reads the latest without re-running on every render.
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  });
  /** A field to focus once its step shows, after a refused send. */
  const focusAfter = useRef<HTMLElement | null>(null);

  const save = useCallback(
    (sent = false) => {
      window.clearTimeout(timer.current);
      if (!handle?.key || !form.current) return;
      writeDraft(sessionStore(), handle.key, {
        values: collectValues(fieldsOf(form.current)),
        step: currentRef.current,
        savedAt: Date.now(),
        ...(sent ? { sent: true } : {}),
      });
    },
    [handle?.key],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // After a step change: keep the step in the draft, then move focus to what needs it.
  useEffect(() => {
    currentRef.current = current;
    if (focusAfter.current) {
      focusAfter.current.focus();
      focusAfter.current = null;
      return;
    }
    if (!moved.current) return;
    save();
    const fieldset = form.current ? stepOf(form.current, current) : null;
    const invalid = report.current ? fieldset && controlsOf(fieldset).find((el) => !el.checkValidity()) : null;
    report.current = false;
    if (invalid) invalid.reportValidity();
    else heading.current?.focus();
  }, [current, save]);

  // The review reads the form each time it opens, including when a saved draft reopens on it.
  useEffect(() => {
    if (current === review && form.current) setSummary(summarize(form.current, stepsRef.current));
  }, [current, review]);

  // A refused send: the draft is not sent after all, and the step holding the first error opens.
  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (!state.error && !Object.keys(state.fields ?? {}).length) {
      // Sent and accepted on the same page (the form stays, React has emptied it): start again from the first step.
      if (handle?.key) removeDraft(sessionStore(), handle.key);
      moved.current = false;
      setCurrent(0);
      setReached(0);
      return;
    }
    const root = form.current;
    if (!root) return;
    if (sentValues.current) restoreChecks(root, sentValues.current);
    const bad = root.querySelector<HTMLElement>(
      'fieldset[data-step] [aria-invalid="true"], fieldset[data-step] p.text-danger',
    );
    const index = bad?.closest('fieldset[data-step]')?.getAttribute('data-step');
    if (handle?.key) {
      // Not sent after all, and it reopens on the step to fix rather than on the review.
      const stored = readDraft(sessionStore(), handle.key);
      if (stored)
        writeDraft(sessionStore(), handle.key, {
          ...stored,
          sent: false,
          step: index != null ? Number(index) : stored.step,
        });
    }
    if (index != null) {
      moved.current = false;
      const target = bad?.matches('[aria-invalid="true"]') ? bad : heading.current;
      if (Number(index) === currentRef.current) target?.focus();
      else {
        focusAfter.current = target;
        setCurrent(Number(index));
      }
    }
  }, [state, handle?.key]);

  const go = (index: number) => {
    setStepError(null);
    moved.current = true;
    setCurrent(index);
    setReached((value) => Math.max(value, index));
  };

  /** Move to `target`, unless a step before it is not ready: then open that step and say why. */
  const attempt = (target: number, checkAll = false) => {
    const root = form.current;
    if (!root) return false;
    const blocked = target > current || checkAll ? firstBlocked(root, steps, target) : null;
    if (blocked) {
      moved.current = true;
      report.current = !blocked.message;
      setCurrent(blocked.index);
      setStepError(blocked.message);
      if (blocked.index === current && !blocked.message) {
        // Same step, so no step-change effect runs: show the browser's message now.
        stepOf(root, current)?.querySelector<Control>(':invalid')?.reportValidity();
      }
      return false;
    }
    go(target);
    return true;
  };

  return (
    <form
      ref={form}
      action={action}
      noValidate
      className="space-y-6"
      onChange={() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => save(), 400);
      }}
      onSubmit={(event) => {
        // Enter in a text box sends the form from any step: before the last one it means Next.
        if (current !== review) {
          event.preventDefault();
          attempt(current + 1);
          return;
        }
        // Every step again: an earlier one may have been changed through the Edit links.
        if (!attempt(review, true)) {
          event.preventDefault();
          return;
        }
        sentValues.current = form.current ? collectValues(fieldsOf(form.current)) : null;
        save(true);
      }}
    >
      {hidden}
      <FormMessages state={state} />
      {handle?.draft ? (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-soft bg-subtle px-3 py-2 text-sm">
          <span>We kept what you typed here earlier.</span>
          <button type="button" className="font-medium text-accent hover:underline" onClick={handle.discard}>
            Start over
          </button>
        </p>
      ) : null}

      <nav aria-label="Steps">
        <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${titles.length}, minmax(0, 1fr))` }}>
          {titles.map((title, index) => {
            const done = index !== current && index <= reached && index < review;
            return (
              <li key={title} className="min-w-0">
                <button
                  type="button"
                  onClick={() => attempt(index)}
                  disabled={index > reached}
                  aria-current={index === current ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${title}`}
                  className={`flex w-full min-w-0 flex-col items-start gap-2 border-t-2 pt-2 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    index === current
                      ? 'border-accent text-foreground'
                      : done
                        ? 'border-accent/50 text-text-2 hover:text-foreground'
                        : 'border-line-soft text-muted'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`grid size-5 flex-none place-items-center rounded-full text-[0.6875rem] tabular-nums ${
                        index === current
                          ? 'bg-accent text-accent-foreground'
                          : done
                            ? 'bg-accent-soft text-accent'
                            : 'bg-subtle text-muted'
                      }`}
                    >
                      {done ? <Icon name="check" size={12} /> : index + 1}
                    </span>
                    <span className="hidden truncate sm:inline">{title}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="space-y-0.5">
        <p className="eyebrow">
          Step {current + 1} of {titles.length}
        </p>
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          {titles[current]}
        </h2>
      </div>

      {steps.map((step, index) => (
        <fieldset key={step.title} data-step={index} hidden={index !== current} className="min-w-0 space-y-5">
          {step.content}
        </fieldset>
      ))}

      {current === review ? (
        <div className="space-y-4">
          {summary.map((section) => (
            <section key={section.index} className="rounded-xl border border-line-soft p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <button
                  type="button"
                  className="text-sm font-medium text-accent hover:underline"
                  onClick={() => go(section.index)}
                >
                  Edit<span className="sr-only"> {section.title}</span>
                </button>
              </div>
              {section.rows.length ? (
                <dl className="mt-2 space-y-2 text-sm">
                  {section.rows.map((row) => (
                    <div key={row.label}>
                      <dt className="text-xs text-muted">{row.label}</dt>
                      <dd className="line-clamp-3 break-words whitespace-pre-line">{row.values.join(', ')}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-muted">Nothing filled in.</p>
              )}
            </section>
          ))}
        </div>
      ) : null}

      {stepError ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {stepError}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-5">
        {current > 0 ? (
          <button type="button" className="btn" onClick={() => go(current - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {current < review ? (
          <button type="button" className="btn btn-primary" onClick={() => attempt(current + 1)}>
            Next: {titles[current + 1]}
          </button>
        ) : (
          <div className="min-w-40">{submit}</div>
        )}
      </div>
    </form>
  );
}
