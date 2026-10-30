import { z } from 'zod';

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const password = z.string().min(10, 'Use at least 10 characters').max(128, 'Use at most 128 characters');

const sixDigits = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const signupRequest = z.object({
  name: z.string().trim().min(1).max(120),
  email,
  password,
});
export type SignupRequest = z.infer<typeof signupRequest>;

export const verifyEmailRequest = z.object({ email, code: sixDigits });
export const resendVerificationRequest = z.object({ email });

export const loginRequest = z.object({ email, password: z.string().min(1).max(128) });
export const loginMfaRequest = z.object({ mfaToken: z.string().min(1), code: sixDigits });

export const refreshRequest = z.object({ refreshToken: z.string().min(1).max(200) });
export const logoutRequest = refreshRequest;

export const forgotPasswordRequest = z.object({ email });
export const resetPasswordRequest = z.object({ token: z.string().min(1).max(200), password });

export const mfaVerifyRequest = z.object({ code: sixDigits });
export const mfaDisableRequest = z.object({ code: sixDigits, password: z.string().min(1).max(128) });

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export type LoginResponse = ({ mfaRequired: false } & TokenPair) | { mfaRequired: true; mfaToken: string };

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  workspaces: { id: string; name: string; slug: string; role: 'owner' | 'admin' | 'member' }[];
}
