import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * AES-256-GCM with a key id, so keys can rotate: the active key encrypts, every key in the ring decrypts.
 * Format: `v1.<kid>.<iv b64url>.<tag b64url>.<ciphertext b64url>`.
 *
 * `binding` is authenticated but not stored (GCM additional data). Pass the row a secret belongs to, such as
 * `<workspaceId>:<mailboxId>`: ciphertext copied onto another row, or into another workspace, then fails to decrypt.
 */
export class Keyring {
  constructor(
    private readonly keys: Map<string, Buffer>,
    private readonly activeKid: string,
  ) {
    if (!keys.has(activeKid)) throw new Error('The active key is not in the keyring');
    for (const key of keys.values()) if (key.length !== 32) throw new Error('Keys must be 32 bytes');
  }

  encrypt(plaintext: string, binding?: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.activeKid)!, iv);
    if (binding !== undefined) cipher.setAAD(Buffer.from(binding, 'utf8'));
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      'v1',
      this.activeKid,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      data.toString('base64url'),
    ].join('.');
  }

  decrypt(sealed: string, binding?: string): string {
    const [version, kid, iv, tag, data] = sealed.split('.');
    if (version !== 'v1' || !kid || !iv || !tag || data === undefined) throw new Error('Unrecognised ciphertext');
    const key = this.keys.get(kid);
    if (!key) throw new Error(`No key ${kid} in the keyring`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    if (binding !== undefined) decipher.setAAD(Buffer.from(binding, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  /**
   * A signed, tamper-evident token for `data` (not encrypted: the data is readable). Each purpose gets its own derived
   * key, so a token minted for one use never verifies for another. Format: `<kid>.<data b64url>.<mac b64url>`.
   */
  sign(purpose: string, data: string): string {
    const body = Buffer.from(data, 'utf8').toString('base64url');
    return `${this.activeKid}.${body}.${this.mac(this.activeKid, purpose, body)}`;
  }

  /** The signed data, or null if the token is malformed, forged, or signed by a key no longer in the ring. */
  verify(purpose: string, token: string): string | null {
    const [kid, body, mac] = token.split('.');
    if (!kid || !body || !mac || !this.keys.has(kid)) return null;
    const expected = Buffer.from(this.mac(kid, purpose, body), 'base64url');
    const given = Buffer.from(mac, 'base64url');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return Buffer.from(body, 'base64url').toString('utf8');
  }

  private mac(kid: string, purpose: string, body: string): string {
    const key = Buffer.from(hkdfSync('sha256', this.keys.get(kid)!, Buffer.alloc(0), `sign:${purpose}`, 32));
    return createHmac('sha256', key).update(body).digest('base64url');
  }
}
