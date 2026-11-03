import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Keyring } from './keyring.js';

describe('Keyring binding', () => {
  const ring = new Keyring(new Map([['k1', randomBytes(32)]]), 'k1');

  it('decrypts with the same binding', () => {
    expect(ring.decrypt(ring.encrypt('login', 'ws-1:mb-1'), 'ws-1:mb-1')).toBe('login');
  });

  it('refuses ciphertext moved to another row', () => {
    const sealed = ring.encrypt('login', 'ws-1:mb-1');
    expect(() => ring.decrypt(sealed, 'ws-2:mb-1')).toThrow();
    expect(() => ring.decrypt(sealed)).toThrow();
  });
});

describe('Keyring signing', () => {
  const ring = new Keyring(new Map([['k1', randomBytes(32)]]), 'k1');

  it('verifies its own token for the same purpose only', () => {
    const token = ring.sign('unsubscribe', 'ws-1:lead@buyer.test');
    expect(ring.verify('unsubscribe', token)).toBe('ws-1:lead@buyer.test');
    expect(ring.verify('other', token)).toBeNull();
  });

  it('rejects tampered or foreign tokens', () => {
    const token = ring.sign('unsubscribe', 'ws-1:lead@buyer.test');
    const [kid, , mac] = token.split('.');
    const forged = `${kid}.${Buffer.from('ws-2:lead@buyer.test').toString('base64url')}.${mac}`;
    expect(ring.verify('unsubscribe', forged)).toBeNull();
    expect(ring.verify('unsubscribe', 'nonsense')).toBeNull();
    const other = new Keyring(new Map([['k1', randomBytes(32)]]), 'k1');
    expect(other.verify('unsubscribe', token)).toBeNull();
  });
});
