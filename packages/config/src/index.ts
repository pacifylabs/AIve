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
    /** The API's own public origin, shown in mailbox forwarding URLs. Defaults to localhost on API_PORT for development. */
    API_PUBLIC_URL: z.url().optional(),
    WEB_ORIGIN: z.url(),

    DB_HOST: z.string().min(1),
    DB_PORT: port.default(5432),
    DB_NAME: z.string().min(1),
    DB_APP_USER: z.string().min(1),
    DB_APP_PASSWORD: z.string().min(1),
    /** Managed databases such as Neon require TLS; local Postgres does not. Certificates are verified when on. */
    DB_SSL: z.stringbool().default(false),

    REDIS_URL: z.url(),
    /** Namespaces rate-limit counters; tests set a unique prefix per run. */
    RATE_LIMIT_PREFIX: z.string().min(1).default('rl'),
    /** Namespaces BullMQ keys. Give each deployment its own when it shares a Redis instance with another app. */
    BULL_PREFIX: z.string().min(1).default('bull'),

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

    /** How platform emails (verification, password reset, invitations) are delivered. */
    EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
    /** Required when EMAIL_PROVIDER=smtp. */
    SMTP_URL: z.url().optional(),
    /** Required when EMAIL_PROVIDER=resend. */
    RESEND_API_KEY: z.string().min(1).optional(),
    /** The sender shown on platform emails, for either provider. With Resend the domain must be verified there. */
    MAIL_FROM: z.string().min(3),

    /**
     * Claude API key for staff model calls and website prefill. Optional so local development and tests run without
     * one; without it, model tasks fail loudly (retried, then marked dead with an alert) instead of doing nothing.
     */
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    /** Meta app (Facebook Pages and Instagram). Both needed to connect accounts; confirmed during Meta app review. */
    META_APP_ID: z.string().min(1).optional(),
    META_APP_SECRET: z.string().min(1).optional(),
    /** Pinned so a Graph API change cannot break posting unannounced. */
    META_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default('v21.0'),
    /** Switch on only once the app is approved to read and answer messages. */
    META_MESSAGING: z.stringbool().default(false),
    /** X API app (OAuth 2.0 client). */
    X_CLIENT_ID: z.string().min(1).optional(),
    X_CLIENT_SECRET: z.string().min(1).optional(),
    /** LinkedIn app. `LINKEDIN_PAGES` asks for the Company Page permissions, which LinkedIn must have approved first. */
    LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
    LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),
    LINKEDIN_PAGES: z.stringbool().default(false),
    /** The month of LinkedIn's versioned API to call, YYYYMM. Pinned so a change cannot break posting unannounced. */
    LINKEDIN_VERSION: z
      .string()
      .regex(/^20\d{2}(0[1-9]|1[0-2])$/)
      .default('202610'),
    /** Cloudinary account for the media library. All three are needed; without them the library says it is not set up. */
    CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().min(1).optional(),
    /** Threads app (shown under the Threads use case of a Meta app; it has its own id and secret). */
    THREADS_APP_ID: z.string().min(1).optional(),
    THREADS_APP_SECRET: z.string().min(1).optional(),
    /** TikTok developer app (Login Kit and Content Posting API). */
    TIKTOK_CLIENT_KEY: z.string().min(1).optional(),
    TIKTOK_CLIENT_SECRET: z.string().min(1).optional(),
    /** How often the worker schedules, delivers events, reaps dead runs and queues due work. */
    WORKER_TICK_MS: z.coerce.number().int().min(1000).max(60_000).default(5_000),
  })
  .refine(
    (config) =>
      config.ENCRYPTION_KEYS.split(',').some((entry) => entry.trim().split(':')[0] === config.ENCRYPTION_ACTIVE_KID),
    { message: 'ENCRYPTION_ACTIVE_KID must name one of the keys in ENCRYPTION_KEYS', path: ['ENCRYPTION_ACTIVE_KID'] },
  )
  .superRefine((config, ctx) => {
    if (config.EMAIL_PROVIDER === 'smtp' && !config.SMTP_URL) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_URL'], message: 'SMTP_URL is required when EMAIL_PROVIDER=smtp' });
    }
    if (config.EMAIL_PROVIDER === 'resend' && !config.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }
  });

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

/** The social network credentials in the shape `SocialProviders` takes. Unset networks are listed as not configured. */
export function socialConfig(
  config: Pick<
    AppConfig,
    | 'META_APP_ID'
    | 'META_APP_SECRET'
    | 'META_GRAPH_VERSION'
    | 'META_MESSAGING'
    | 'X_CLIENT_ID'
    | 'X_CLIENT_SECRET'
    | 'LINKEDIN_CLIENT_ID'
    | 'LINKEDIN_CLIENT_SECRET'
    | 'LINKEDIN_PAGES'
    | 'LINKEDIN_VERSION'
    | 'THREADS_APP_ID'
    | 'THREADS_APP_SECRET'
    | 'TIKTOK_CLIENT_KEY'
    | 'TIKTOK_CLIENT_SECRET'
  >,
) {
  return {
    meta: {
      appId: config.META_APP_ID ?? '',
      appSecret: config.META_APP_SECRET ?? '',
      graphVersion: config.META_GRAPH_VERSION,
      messaging: config.META_MESSAGING,
    },
    x: { clientId: config.X_CLIENT_ID ?? '', clientSecret: config.X_CLIENT_SECRET ?? '' },
    linkedin: {
      clientId: config.LINKEDIN_CLIENT_ID ?? '',
      clientSecret: config.LINKEDIN_CLIENT_SECRET ?? '',
      pages: config.LINKEDIN_PAGES,
      version: config.LINKEDIN_VERSION,
    },
    threads: { appId: config.THREADS_APP_ID ?? '', appSecret: config.THREADS_APP_SECRET ?? '' },
    tiktok: { clientKey: config.TIKTOK_CLIENT_KEY ?? '', clientSecret: config.TIKTOK_CLIENT_SECRET ?? '' },
  };
}
