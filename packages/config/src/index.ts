import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const hexKey = /^[a-z0-9_-]{1,32}:[0-9a-f]{64}$/i;

/**
 * Every setting the API and worker read, validated once at start-up. Nothing else in the codebase reads process.env,
 * so a missing or malformed value stops the process with a clear message instead of failing later at runtime.
 */
export const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    API_PORT: port.default(3100),
    /** Proxies in front of the API (load balancer = 1). The client IP used for rate limits comes from X-Forwarded-For only when set. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    APP_URL: z.url(),
    WEB_ORIGIN: z.url(),

    DB_HOST: z.string().min(1),
    DB_PORT: port.default(5432),
    DB_NAME: z.string().min(1),
    DB_APP_USER: z.string().min(1),
    DB_APP_PASSWORD: z.string().min(1),

    REDIS_URL: z.url(),
    /** Namespaces rate-limit counters; tests set a unique prefix per run. */
    RATE_LIMIT_PREFIX: z.string().min(1).default('rl'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

    ENCRYPTION_KEYS: z
      .string()
      .min(1)
      .refine((value) => value.split(',').every((entry) => hexKey.test(entry.trim())), {
        message: 'ENCRYPTION_KEYS must be comma-separated "kid:<64 hex chars>" entries',
      }),
    ENCRYPTION_ACTIVE_KID: z.string().min(1),

    SMTP_URL: z.url(),
    MAIL_FROM: z.string().min(3),
  })
  .refine(
    (config) =>
      config.ENCRYPTION_KEYS.split(',').some((entry) => entry.trim().split(':')[0] === config.ENCRYPTION_ACTIVE_KID),
    { message: 'ENCRYPTION_ACTIVE_KID must name one of the keys in ENCRYPTION_KEYS', path: ['ENCRYPTION_ACTIVE_KID'] },
  );

export type AppConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`));
  }
  return result.data;
}

/** Parses the keyring into raw keys. Kept here so every consumer reads the same format. */
export function parseKeyring(config: Pick<AppConfig, 'ENCRYPTION_KEYS'>): Map<string, Buffer> {
  return new Map(
    config.ENCRYPTION_KEYS.split(',').map((entry) => {
      const [kid, hex] = entry.trim().split(':') as [string, string];
      return [kid, Buffer.from(hex, 'hex')];
    }),
  );
}
