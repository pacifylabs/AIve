import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Meta sends deauthorize and data-deletion calls as `signed_request`: a signature and a payload, each base64url, joined by
 * a dot. The signature is HMAC-SHA256 of the payload text, keyed with the app secret. Returns the payload only when the
 * signature is right, so nobody can disconnect an account by guessing an id.
 */
export function readSignedRequest(signed: string, appSecret: string): { userId: string } | null {
  if (!appSecret) return null;
  const [signature, payload, extra] = signed.split('.');
  if (!signature || !payload || extra !== undefined) return null;
  const expected = createHmac('sha256', appSecret).update(payload).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      algorithm?: string;
      user_id?: string | number;
    };
    if (data.algorithm?.toUpperCase() !== 'HMAC-SHA256' || data.user_id === undefined) return null;
    return { userId: String(data.user_id) };
  } catch {
    return null;
  }
}
