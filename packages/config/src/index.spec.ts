import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseKeyring } from './index.js';

const key = 'a'.repeat(64);
const valid = {
  APP_URL: 'http://localhost:3101',
  WEB_ORIGIN: 'http://localhost:3101',
  DB_HOST: 'localhost',
  DB_NAME: 'ai_staff',
  DB_APP_USER: 'app',
  DB_APP_PASSWORD: 'secret',
  REDIS_URL: 'redis://localhost:6390',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  ENCRYPTION_KEYS: `k1:${key}`,
  ENCRYPTION_ACTIVE_KID: 'k1',
  SMTP_URL: 'smtp://localhost:1030',
  MAIL_FROM: 'AI Staff <no-reply@localhost>',
};

describe('email provider', () => {
  it('defaults to smtp, which needs SMTP_URL', () => {
    expect(loadConfig(valid).EMAIL_PROVIDER).toBe('smtp');
    expect(() => loadConfig({ ...valid, SMTP_URL: undefined })).toThrow(
      /SMTP_URL is required when EMAIL_PROVIDER=smtp/,
    );
  });

  it('resend needs RESEND_API_KEY but not SMTP_URL', () => {
    const resend = { ...valid, EMAIL_PROVIDER: 'resend', SMTP_URL: undefined };
    expect(() => loadConfig(resend)).toThrow(/RESEND_API_KEY is required when EMAIL_PROVIDER=resend/);
    const config = loadConfig({ ...resend, RESEND_API_KEY: 're_test_123' });
    expect(config.EMAIL_PROVIDER).toBe('resend');
    expect(config.RESEND_API_KEY).toBe('re_test_123');
  });

  it('rejects any other provider', () => {
    expect(() => loadConfig({ ...valid, EMAIL_PROVIDER: 'sendgrid' })).toThrow(/EMAIL_PROVIDER/);
  });

  it('does not demand the key of the provider that is not selected', () => {
    expect(() => loadConfig({ ...valid, EMAIL_PROVIDER: 'smtp', RESEND_API_KEY: undefined })).not.toThrow();
    expect(() =>
      loadConfig({ ...valid, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x', SMTP_URL: undefined }),
    ).not.toThrow();
  });
});

describe('database SSL and queue prefix', () => {
  it('turns SSL off by default and reads true and false strings', () => {
    expect(loadConfig(valid).DB_SSL).toBe(false);
    expect(loadConfig({ ...valid, DB_SSL: 'true' }).DB_SSL).toBe(true);
    expect(loadConfig({ ...valid, DB_SSL: 'false' }).DB_SSL).toBe(false);
  });

  it('rejects a DB_SSL value that is not a boolean', () => {
    expect(() => loadConfig({ ...valid, DB_SSL: 'sometimes' })).toThrow(/DB_SSL/);
  });

  it('defaults the queue prefix to bull and accepts another so a shared Redis stays separate', () => {
    expect(loadConfig(valid).BULL_PREFIX).toBe('bull');
    expect(loadConfig({ ...valid, BULL_PREFIX: 'ai-staff' }).BULL_PREFIX).toBe('ai-staff');
  });
});

describe('loadConfig', () => {
  it('applies defaults to a valid environment', () => {
    const config = loadConfig(valid);
    expect(config.API_PORT).toBe(3100);
    expect(config.ACCESS_TOKEN_TTL_SEC).toBe(900);
    expect(config.NODE_ENV).toBe('development');
  });

  it('lists every problem at once', () => {
    try {
      loadConfig({ ...valid, JWT_ACCESS_SECRET: 'short', DB_HOST: undefined });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const issues = (error as ConfigError).issues.join('\n');
      expect(issues).toContain('JWT_ACCESS_SECRET');
      expect(issues).toContain('DB_HOST');
    }
  });

  it('rejects a malformed keyring', () => {
    expect(() => loadConfig({ ...valid, ENCRYPTION_KEYS: 'k1:not-hex' })).toThrow(ConfigError);
  });

  it('rejects an active key id that is not in the keyring', () => {
    expect(() => loadConfig({ ...valid, ENCRYPTION_ACTIVE_KID: 'k2' })).toThrow(/ENCRYPTION_ACTIVE_KID/);
  });

  it('parses several keys', () => {
    const keys = parseKeyring({ ENCRYPTION_KEYS: `k1:${key}, k2:${'b'.repeat(64)}` });
    expect([...keys.keys()]).toEqual(['k1', 'k2']);
    expect(keys.get('k2')).toHaveLength(32);
  });
});
