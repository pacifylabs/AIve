'use server';

import type { LoginResponse, TokenPair } from '@ai-staff/contracts';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { field, type FormState, fromProblem } from '@/lib/form-state';
import { clearSession, readSession, rememberMfaStep, storeTokens, takeMfaStep } from '@/lib/session';

const safeNext = (value: string) => (value.startsWith('/') && !value.startsWith('//') ? value : '/app');

export async function signupAction(_state: FormState, data: FormData): Promise<FormState> {
  const email = field(data, 'email');
  const result = await api('/auth/signup', {
    method: 'POST',
    body: { name: field(data, 'name'), email, password: field(data, 'password') },
  });
  if (!result.ok) return fromProblem(result.problem);
  redirect(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`);
}

export async function verifyAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api<TokenPair>('/auth/verify-email', {
    method: 'POST',
    body: { email: field(data, 'email'), code: field(data, 'code') },
  });
  if (!result.ok) return fromProblem(result.problem);
  await storeTokens(result.data);
  redirect('/app');
}

export async function resendCodeAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api('/auth/verify-email/resend', { method: 'POST', body: { email: field(data, 'email') } });
  if (!result.ok) return fromProblem(result.problem);
  return { notice: 'If that address is waiting for verification, a new code is on its way.' };
}

export async function loginAction(_state: FormState, data: FormData): Promise<FormState> {
  const email = field(data, 'email');
  const result = await api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password: field(data, 'password') },
  });
  if (!result.ok) {
    if (result.problem.code === 'email_not_verified')
      redirect(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    return fromProblem(result.problem);
  }
  const next = safeNext(field(data, 'next'));
  if (result.data.mfaRequired) {
    // Kept in a short-lived httpOnly cookie, not the URL, so it never lands in history or logs.
    await rememberMfaStep(result.data.mfaToken);
    redirect(`/login/mfa?next=${encodeURIComponent(next)}`);
  }
  await storeTokens(result.data);
  redirect(next);
}

export async function loginMfaAction(_state: FormState, data: FormData): Promise<FormState> {
  const mfaToken = await takeMfaStep(false);
  if (!mfaToken) redirect('/login');
  const result = await api<TokenPair>('/auth/login/mfa', {
    method: 'POST',
    body: { mfaToken, code: field(data, 'code') },
  });
  if (!result.ok) return fromProblem(result.problem);
  await takeMfaStep(true);
  await storeTokens(result.data);
  redirect(safeNext(field(data, 'next')));
}

export async function forgotPasswordAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api('/auth/password/forgot', { method: 'POST', body: { email: field(data, 'email') } });
  if (!result.ok) return fromProblem(result.problem);
  return { notice: 'If an account uses that address, we have emailed a link to reset the password.' };
}

export async function resetPasswordAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api('/auth/password/reset', {
    method: 'POST',
    body: { token: field(data, 'token'), password: field(data, 'password') },
  });
  if (!result.ok) return fromProblem(result.problem);
  await clearSession();
  redirect('/login?reset=1');
}

export async function logoutAction(): Promise<void> {
  const { refreshToken } = await readSession();
  if (refreshToken) await api('/auth/logout', { method: 'POST', body: { refreshToken } });
  await clearSession();
  redirect('/login');
}
