'use client';

import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
  useState,
} from 'react';
import { useFormStatus } from 'react-dom';
import type { FormState } from '@/lib/form-state';

const inputClass = 'field';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  name: string;
  error?: string | undefined;
  hint?: ReactNode;
}

export function TextField({ label, error, hint, ...input }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A drop-down with the same label, hint and error wiring as TextField. */
export function SelectField({
  label,
  error,
  hint,
  children,
  ...select
}: { label: string; name: string; error?: string; hint?: string; children: ReactNode } & Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'id'
>) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...select}
      >
        {children}
      </select>
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Multi-line text, for drafts and longer answers. Same label, hint and error wiring as TextField. */
export function TextAreaField({
  label,
  error,
  hint,
  ...textarea
}: { label: string; error?: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...textarea}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The one password field used everywhere, with a show/hide toggle. */
export function PasswordField({ label, error, hint, ...input }: FieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className={`${inputClass} pr-10`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-foreground"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
}: {
  children: ReactNode;
  pendingLabel?: string;
  /** `secondary` for the lesser of two buttons side by side, such as Reject beside Approve. */
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`btn w-full ${variant === 'primary' ? 'btn-primary' : ''}`}>
      {pending ? (pendingLabel ?? 'Working…') : children}
    </button>
  );
}

export function FormMessages({ state }: { state: FormState }) {
  return (
    <div aria-live="polite">
      {state.error ? (
        <p className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.notice ? (
        <p className="rounded-xl border border-ok/30 bg-ok-soft px-3 py-2 text-sm text-ok">{state.notice}</p>
      ) : null}
    </div>
  );
}

function Eye() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.3M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a10.6 10.6 0 0 0 5.4-1.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
