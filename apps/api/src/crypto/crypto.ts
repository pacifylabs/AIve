import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** SHA-256 hex. Used to store one-time tokens so a database leak does not leak usable tokens. */
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sixDigitCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Lives in @ai-staff/core so the worker decrypts with the same code; re-exported for existing imports. */
export { Keyring } from '@ai-staff/core';
