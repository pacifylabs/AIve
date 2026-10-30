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
