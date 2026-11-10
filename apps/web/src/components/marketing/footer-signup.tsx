'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { joinUpdatesAction, type UpdatesState } from '@/app/actions/early-access';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-dark" disabled={pending}>
      {pending ? 'Adding you…' : 'Join early access'}
    </button>
  );
}

/** The footer's email box: joins the early-access list with nothing but an address. */
export function FooterSignup() {
  const [state, action] = useActionState<UpdatesState, FormData>(joinUpdatesAction, {});
  const error = state.fields?.email ?? state.error;

  if (state.done) {
    return (
      <div role="status" className="footer-signup glass">
        <span style={{ fontSize: 16, fontWeight: 600 }}>You&apos;re on the list.</span>
        <span className="small">We&apos;ll email you when your invite is ready.</span>
      </div>
    );
  }

  return (
    <form action={action} className="footer-signup glass" noValidate>
      <label htmlFor="footer-email" style={{ fontSize: 16, fontWeight: 600 }}>
        Get your invite and launch news
      </label>
      <div className="footer-signup-row">
        <input
          id="footer-email"
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@company.com"
          defaultValue={state.email}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'footer-email-error' : 'footer-email-hint'}
        />
        <Submit />
      </div>
      {error ? (
        <span id="footer-email-error" role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>
          {error}
        </span>
      ) : (
        <span id="footer-email-hint" className="small">
          Adds you to the early-access list. No card needed.
        </span>
      )}
    </form>
  );
}
