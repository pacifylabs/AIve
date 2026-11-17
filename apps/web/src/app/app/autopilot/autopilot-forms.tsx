'use client';

import { useActionState, useEffect, useState } from 'react';
import { enableAutopilotAction, saveAutopilotAction } from '@/app/actions/platform';
import { FormMessages, SubmitButton, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export interface AutopilotRules {
  approvals: number;
  maxMedianEditRatio: number;
  windowDays: number;
  maxPerDay: number;
}

const MODES = [
  {
    value: 'ask',
    label: 'Tell me when it is ready',
    help: 'It stays on approval. I decide when the record looks good.',
  },
  {
    value: 'auto',
    label: 'Switch on by itself',
    help: 'Autopilot starts as soon as the rules below are met. Three rejections in a row stop it again.',
  },
  { value: 'off', label: 'Always ask me', help: 'Every draft waits for my approval. Do not offer autopilot.' },
] as const;

/** What the closed rules panel says, so the choice is visible without opening it. */
export function modeLabel(mode: 'off' | 'ask' | 'auto'): string {
  return MODES.find((option) => option.value === mode)?.label ?? mode;
}

/**
 * The rules behind a summary that shows the current choice. Closed by default, and it closes again after a save so
 * the person sees that it took.
 */
export function RulesPanel(props: {
  staffId: string;
  taskType: string;
  mode: 'off' | 'ask' | 'auto';
  rules: AutopilotRules;
  defaults: AutopilotRules;
}) {
  const [open, setOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  return (
    <details
      className="card-flat px-4 py-3"
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">Rules</span>
        <span className="text-muted"> · {modeLabel(props.mode)}</span>
        {savedAt && !open ? (
          <span className="text-ok" role="status">
            {' '}
            · Saved
          </span>
        ) : null}
      </summary>
      <div className="pt-4">
        <RulesForm
          {...props}
          onSaved={() => {
            setSavedAt(Date.now());
            setOpen(false);
          }}
        />
      </div>
    </details>
  );
}

/** The mode and the rules that must be met. Blank boxes keep the role's own numbers. */
export function RulesForm({
  staffId,
  taskType,
  mode,
  rules,
  defaults,
  onSaved,
}: {
  staffId: string;
  taskType: string;
  mode: 'off' | 'ask' | 'auto';
  rules: AutopilotRules;
  defaults: AutopilotRules;
  onSaved?: () => void;
}) {
  const [state, action] = useActionState(saveAutopilotAction, initialFormState);
  useEffect(() => {
    if (state.notice && !state.error && !state.fields) onSaved?.();
    // Keyed on the result alone: only a new answer from the action should close the panel.
  }, [state]);
  const value = (name: string, fallback: number) => state.values?.[name] ?? String(fallback);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="taskType" value={taskType} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">When should it stop asking?</legend>
        {MODES.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              value={option.value}
              defaultChecked={(state.values?.mode ?? mode) === option.value}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{option.label}</span>
              <span className="block text-muted">{option.help}</span>
            </span>
          </label>
        ))}
        {state.fields?.mode ? <p className="text-xs text-danger">{state.fields.mode}</p> : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Approvals needed"
          name="approvals"
          type="number"
          inputMode="numeric"
          min={5}
          max={200}
          defaultValue={value('approvals', rules.approvals)}
          error={state.fields?.['rules.approvals']}
          hint={`At least 5. Standard: ${defaults.approvals}.`}
        />
        <TextField
          label="Within the last (days)"
          name="windowDays"
          type="number"
          inputMode="numeric"
          min={7}
          max={90}
          defaultValue={value('windowDays', rules.windowDays)}
          error={state.fields?.['rules.windowDays']}
          hint={`7 to 90. Standard: ${defaults.windowDays}.`}
        />
        <TextField
          label="Most text I may change (%)"
          name="editPercent"
          type="number"
          inputMode="numeric"
          min={0}
          max={30}
          defaultValue={value('editPercent', Math.round(rules.maxMedianEditRatio * 100))}
          error={state.fields?.['rules.maxMedianEditRatio']}
          hint={`The typical edit, 0 to 30. Standard: ${Math.round(defaults.maxMedianEditRatio * 100)}.`}
        />
        <TextField
          label="Most per day without review"
          name="maxPerDay"
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          defaultValue={value('maxPerDay', rules.maxPerDay)}
          error={state.fields?.['rules.maxPerDay']}
          hint="Past this, drafts wait for you again until tomorrow."
        />
      </div>
      <p className="text-xs text-muted">
        Any rejection inside the window also holds autopilot back, whatever these numbers are.
      </p>
      <div className="max-w-xs">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}

/** Skips the record. Needs the person to say they understand, and the API only lets an owner do it. */
export function EnableNowForm({
  staffId,
  taskType,
  staffName,
}: {
  staffId: string;
  taskType: string;
  staffName: string;
}) {
  const [state, action] = useActionState(enableAutopilotAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="taskType" value={taskType} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" value="yes" className="mt-1" />
        <span>
          I understand that {staffName}&rsquo;s posts will go out without my approval. Anything that breaks a guardrail
          still comes to my inbox.
        </span>
      </label>
      {state.fields?.confirm ? <p className="text-xs text-danger">{state.fields.confirm}</p> : null}
      <div className="max-w-xs">
        <SubmitButton pendingLabel="Turning on…">Turn on now</SubmitButton>
      </div>
    </form>
  );
}
