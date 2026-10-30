'use client';

import { useActionState } from 'react';
import {
  forgotPasswordAction,
  loginAction,
  loginMfaAction,
  resendCodeAction,
  resetPasswordAction,
  signupAction,
  verifyAction,
} from '@/app/actions/auth';
import { FormMessages, PasswordField, SubmitButton, TextField } from '@/components/form';
import { initialFormState } from '@/lib/form-state';

export function SignupForm() {
  const [state, action] = useActionState(signupAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <TextField label="Your name" name="name" autoComplete="name" required error={state.fields?.name} />
      <TextField
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fields?.email}
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters."
        error={state.fields?.password}
      />
      <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
    </form>
  );
}

export function VerifyForm({ email }: { email: string }) {
  const [state, action] = useActionState(verifyAction, initialFormState);
  const [resendState, resend] = useActionState(resendCodeAction, initialFormState);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4" noValidate>
        <FormMessages state={state} />
        <input type="hidden" name="email" value={email} />
        <TextField
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          error={state.fields?.code}
        />
        <SubmitButton pendingLabel="Checking…">Verify and continue</SubmitButton>
      </form>
      <form action={resend} className="space-y-2">
        <input type="hidden" name="email" value={email} />
        <FormMessages state={resendState} />
        <button type="submit" className="text-sm text-accent hover:underline">
          Send a new code
        </button>
      </form>
    </div>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="next" value={next} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required error={state.fields?.email} />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        error={state.fields?.password}
      />
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

export function MfaForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginMfaAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="next" value={next} />
      <TextField
        label="Code from your authenticator app"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        error={state.fields?.code}
      />
      <SubmitButton pendingLabel="Checking…">Continue</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required error={state.fields?.email} />
      <SubmitButton pendingLabel="Sending…">Email me a reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessages state={state} />
      <input type="hidden" name="token" value={token} />
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters."
        error={state.fields?.password}
      />
      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
    </form>
  );
}
