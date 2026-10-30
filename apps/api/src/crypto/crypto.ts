import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** SHA-256 hex. Used to store one-time tokens so a database leak does not leak usable tokens. */
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sixDigitCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * AES-256-GCM with a key id, so keys can rotate: the active key encrypts, every key in the ring decrypts.
 * Format: `v1.<kid>.<iv b64url>.<tag b64url>.<ciphertext b64url>`.
 */
export class Keyring {
  constructor(
    private readonly keys: Map<string, Buffer>,
    private readonly activeKid: string,
  ) {
    if (!keys.has(activeKid)) throw new Error('The active key is not in the keyring');
    for (const key of keys.values()) if (key.length !== 32) throw new Error('Keys must be 32 bytes');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.activeKid)!, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      'v1',
      this.activeKid,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      data.toString('base64url'),
    ].join('.');
  }

  decrypt(sealed: string): string {
    const [version, kid, iv, tag, data] = sealed.split('.');
    if (version !== 'v1' || !kid || !iv || !tag || data === undefined) throw new Error('Unrecognised ciphertext');
    const key = this.keys.get(kid);
    if (!key) throw new Error(`No key ${kid} in the keyring`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }
}
