import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseKeyring, socialConfig } from './index.js';

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

describe('social network settings', () => {
  it('are optional, and an unset network is passed on as empty credentials', () => {
    const config = loadConfig(valid);
    expect(config.META_GRAPH_VERSION).toBe('v21.0');
    expect(config.META_MESSAGING).toBe(false);
    expect(socialConfig(config)).toEqual({
      meta: { appId: '', appSecret: '', graphVersion: 'v21.0', messaging: false },
      x: { clientId: '', clientSecret: '' },
      linkedin: { clientId: '', clientSecret: '', pages: false, version: '202610' },
      threads: { appId: '', appSecret: '' },
      tiktok: { clientKey: '', clientSecret: '' },
    });
  });

  it('reads the values when they are set, and rejects a malformed Graph version', () => {
    const config = loadConfig({
      ...valid,
      META_APP_ID: 'id',
      META_APP_SECRET: 's',
      META_MESSAGING: 'true',
      X_CLIENT_ID: 'x',
      X_CLIENT_SECRET: 'y',
      LINKEDIN_CLIENT_ID: 'li',
      LINKEDIN_CLIENT_SECRET: 'ls',
      LINKEDIN_PAGES: 'true',
      LINKEDIN_VERSION: '202611',
      THREADS_APP_ID: 't',
      THREADS_APP_SECRET: 'u',
      TIKTOK_CLIENT_KEY: 'k',
      TIKTOK_CLIENT_SECRET: 'v',
    });
    expect(socialConfig(config).meta).toMatchObject({ appId: 'id', messaging: true });
    expect(socialConfig(config).linkedin).toEqual({
      clientId: 'li',
      clientSecret: 'ls',
      pages: true,
      version: '202611',
    });
    expect(() => loadConfig({ ...valid, LINKEDIN_VERSION: '2026-11' })).toThrow(ConfigError);
    expect(socialConfig(config).threads).toEqual({ appId: 't', appSecret: 'u' });
    expect(socialConfig(config).tiktok).toEqual({ clientKey: 'k', clientSecret: 'v' });
    expect(() => loadConfig({ ...valid, META_GRAPH_VERSION: '21' })).toThrow(ConfigError);
  });
});

describe('model provider', () => {
  const openai = {
    ...valid,
    LLM_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-x',
    LLM_INPUT_USD_PER_MTOK: '0',
    LLM_OUTPUT_USD_PER_MTOK: '0.6',
  };

  it('defaults to Claude and needs no other model settings for it', () => {
    const config = loadConfig(valid);
    expect(config.LLM_PROVIDER).toBe('anthropic');
    expect(config.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
    expect(config.OLLAMA_BASE_URL).toBe('http://localhost:11434/v1');
  });

  it('reads OpenAI with its prices as numbers', () => {
    expect(loadConfig(openai)).toMatchObject({
      LLM_PROVIDER: 'openai',
      LLM_INPUT_USD_PER_MTOK: 0,
      LLM_OUTPUT_USD_PER_MTOK: 0.6,
    });
  });

  it('needs only the key for a free service, and keeps every service key at once', () => {
    const keys = { GROQ_API_KEY: 'g', GEMINI_API_KEY: 'm', OPENROUTER_API_KEY: 'r' };
    for (const provider of ['groq', 'gemini', 'openrouter'] as const) {
      expect(loadConfig({ ...valid, ...keys, LLM_PROVIDER: provider })).toMatchObject({
        LLM_PROVIDER: provider,
        ...keys,
      });
    }
    expect(loadConfig({ ...valid, LLM_PROVIDER: 'ollama', OLLAMA_MODEL: 'llama3.2' }).OLLAMA_MODEL).toBe('llama3.2');
  });

  it('names the setting each service is missing', () => {
    expect(() =>
      loadConfig({ ...openai, OPENAI_API_KEY: undefined, OPENAI_MODEL: undefined, LLM_INPUT_USD_PER_MTOK: undefined }),
    ).toThrow(
      /OPENAI_API_KEY is required when LLM_PROVIDER=openai[\s\S]*OPENAI_MODEL is required[\s\S]*LLM_INPUT_USD_PER_MTOK is required/,
    );
    expect(() => loadConfig({ ...valid, LLM_PROVIDER: 'groq' })).toThrow(
      /GROQ_API_KEY is required when LLM_PROVIDER=groq/,
    );
    expect(() => loadConfig({ ...valid, LLM_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY is required/);
    expect(() => loadConfig({ ...valid, LLM_PROVIDER: 'openrouter' })).toThrow(/OPENROUTER_API_KEY is required/);
    expect(() => loadConfig({ ...valid, LLM_PROVIDER: 'ollama' })).toThrow(/OLLAMA_MODEL is required/);
  });

  it('rejects an unknown provider, a negative price and a base URL that is not a URL', () => {
    expect(() => loadConfig({ ...valid, LLM_PROVIDER: 'mistral' })).toThrow(/LLM_PROVIDER/);
    expect(() => loadConfig({ ...openai, LLM_OUTPUT_USD_PER_MTOK: '-1' })).toThrow(/LLM_OUTPUT_USD_PER_MTOK/);
    expect(() => loadConfig({ ...openai, OPENAI_BASE_URL: 'groq' })).toThrow(/OPENAI_BASE_URL/);
  });
});
