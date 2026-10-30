/** Stable machine-readable error codes. Clients branch on these, never on message text. */
export const ERROR_CODES = [
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'invalid_credentials',
  'email_not_verified',
  'invalid_code',
  'code_expired',
  'mfa_required',
  'mfa_already_enabled',
  'mfa_not_enabled',
  'refresh_token_invalid',
  'refresh_token_reused',
  'invitation_invalid',
  'invitation_email_mismatch',
  'last_owner',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** RFC 9457 problem details, with our stable code and optional field errors. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  errors?: { path: string; message: string }[];
}
