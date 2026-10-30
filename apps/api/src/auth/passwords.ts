import { hash, verify } from '@node-rs/argon2';

// OWASP's argon2id baseline: 19 MiB memory, 2 iterations, 1 lane.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string): Promise<string> => hash(plain, OPTIONS);

export const verifyPassword = (stored: string, plain: string): Promise<boolean> =>
  verify(stored, plain).catch(() => false);

let dummy: Promise<string> | undefined;

/** Spends the same time as a real check when the account does not exist, so response time doesn't reveal it. */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummy ??= hashPassword('not-a-real-password-just-for-timing');
  await verifyPassword(await dummy, plain);
}
