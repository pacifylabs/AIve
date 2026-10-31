'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type EarlyAccessState, joinEarlyAccessAction } from '@/app/actions/early-access';
import { Arrow } from './primitives';

const ROLES = [
  ['social', 'Social Media'],
  ['sales', 'Sales Manager'],
  ['both', 'Both'],
] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-dark btn-xl" style={{ width: '100%' }} disabled={pending}>
      {pending ? 'Adding you to the list…' : 'Join early access'} {pending ? null : <Arrow />}
    </button>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <span id={id} style={{ fontSize: 13, color: '#B42318' }}>
      {message}
    </span>
  ) : null;
}

export function EarlyAccessForm({ role }: { role: 'social' | 'sales' | 'both' }) {
  const [state, action] = useActionState<EarlyAccessState, FormData>(joinEarlyAccessAction, {});
  const errors = state.fields ?? {};
  const values = state.values;

  if (state.done) {
    return (
      <div role="status" className="stack" style={{ gap: 16, alignItems: 'flex-start' }}>
        <span className="tile tile-sm tile-lg" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1E7A52"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h2 className="h3" style={{ fontSize: 26 }}>
          You&apos;re on the list.
        </h2>
        <p className="body">We&apos;ll email you when your invite is ready. Meanwhile, see how the staff work.</p>
        <Link href="/how-it-works" className="btn btn-light">
          See how it works <Arrow />
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="stack" style={{ gap: 20 }} noValidate>
      <h2 className="h3" style={{ fontSize: 24 }}>
        Join early access
      </h2>
      {state.error ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 14,
            color: '#B42318',
            background: '#FEF3F2',
            borderRadius: 12,
            padding: '12px 14px',
          }}
        >
          {state.error}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="ea-email">Work email</label>
        <input
          id="ea-email"
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@company.com"
          defaultValue={values?.email}
          required
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'ea-email-error' : undefined}
        />
        <FieldError id="ea-email-error" message={errors.email} />
      </div>
      <div className="field">
        <label htmlFor="ea-site">Company website</label>
        <input
          id="ea-site"
          className="input"
          type="text"
          inputMode="url"
          name="website"
          autoComplete="url"
          placeholder="company.com"
          defaultValue={values?.website}
          aria-invalid={errors.website ? true : undefined}
          aria-describedby={errors.website ? 'ea-site-error' : undefined}
        />
        <FieldError id="ea-site-error" message={errors.website} />
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ marginBottom: 10 }}>Which staff do you want?</legend>
        <div className="choice">
          {ROLES.map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="role" value={value} defaultChecked={value === (values?.role ?? role)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="ea-next">
          What would you hand over first? <span style={{ fontWeight: 400, color: '#5E5E5B' }}>(optional)</span>
        </label>
        <input
          id="ea-next"
          className="input"
          type="text"
          name="firstTask"
          maxLength={200}
          placeholder="e.g. following up webinar leads"
          defaultValue={values?.firstTask}
          aria-invalid={errors.firstTask ? true : undefined}
          aria-describedby={errors.firstTask ? 'ea-next-error' : undefined}
        />
        <FieldError id="ea-next-error" message={errors.firstTask} />
      </div>
      <Submit />
      <p className="small" style={{ margin: 0 }}>
        No card needed. By joining you agree to our <Link href="/privacy">privacy policy</Link>.
      </p>
    </form>
  );
}
