import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Keyring, safeEqualHex, sha256, sixDigitCode } from './crypto.js';

describe('Keyring', () => {
  const k1 = randomBytes(32);
  const k2 = randomBytes(32);

  it('round-trips with the active key', () => {
    const ring = new Keyring(new Map([['k1', k1]]), 'k1');
    expect(ring.decrypt(ring.encrypt('secret value'))).toBe('secret value');
  });

  it('uses a fresh IV every time', () => {
    const ring = new Keyring(new Map([['k1', k1]]), 'k1');
    expect(ring.encrypt('same')).not.toBe(ring.encrypt('same'));
  });

  it('still decrypts old values after the active key rotates', () => {
    const before = new Keyring(new Map([['k1', k1]]), 'k1');
    const sealed = before.encrypt('kept');
    const after = new Keyring(
      new Map([
        ['k1', k1],
        ['k2', k2],
      ]),
      'k2',
    );
    expect(after.decrypt(sealed)).toBe('kept');
    expect(after.encrypt('new').split('.')[1]).toBe('k2');
  });

  it('rejects tampered ciphertext', () => {
    const ring = new Keyring(new Map([['k1', k1]]), 'k1');
    const parts = ring.encrypt('value').split('.');
    parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => ring.decrypt(parts.join('.'))).toThrow();
  });

  it('refuses a ring whose active key is missing or the wrong size', () => {
    expect(() => new Keyring(new Map([['k1', k1]]), 'k9')).toThrow();
    expect(() => new Keyring(new Map([['k1', randomBytes(16)]]), 'k1')).toThrow();
  });
});

describe('helpers', () => {
  it('makes six-digit codes', () => {
    for (let i = 0; i < 50; i += 1) expect(sixDigitCode()).toMatch(/^\d{6}$/);
  });

  it('compares hashes in constant time and handles length mismatch', () => {
    expect(safeEqualHex(sha256('a'), sha256('a'))).toBe(true);
    expect(safeEqualHex(sha256('a'), sha256('b'))).toBe(false);
    expect(safeEqualHex(sha256('a'), 'abcd')).toBe(false);
  });
});
