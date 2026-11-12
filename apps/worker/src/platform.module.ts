import { Module, type OnApplicationShutdown, Inject } from '@nestjs/common';
import { type AppConfig, loadConfig, parseKeyring, socialConfig } from '@ai-staff/config';
import {
  AccountHealth,
  AccountStats,
  RecurringPosts,
  AccountTokens,
  ApprovalService,
  FeedPoller,
  Keyring,
  MailDispatcher,
  MailInbox,
  PostPublisher,
  ReplySender,
  RoleRegistry,
  SocialGateway,
  TaskEngine,
  Triggers,
  WebsitePrefill,
  safeFetchMedia,
} from '@ai-staff/core';
import { createDataSource, DataSource, type Mailbox } from '@ai-staff/db';
import { type ModelProvider, selectModelProvider } from '@ai-staff/llm';
import { FixtureTransport, type MailboxLogin, type MailTransport, SmtpTransport } from '@ai-staff/mail';
import { salesSendHooks } from '@ai-staff/role-sales';
import { SocialProviders } from '@ai-staff/social';
import { Logger as PinoLogger } from 'nestjs-pino';
import { ImapPoller } from './imap-poller.service.js';
import { MailProcessor } from './mail.processor.js';
import { PublishProcessor } from './publish.processor.js';
import { PlatformProcessor } from './platform.processor.js';
import { QueuesModule } from './queues.module.js';
import { buildRegistry } from './roles.js';
import { TaskProcessor } from './task.processor.js';
import { Ticker } from './ticker.service.js';
import { APP_CONFIG, KEYRING, MODEL_PROVIDER } from './tokens.js';

/** The database, the role registry and the task engine, plus the processors and the tick loop that drive them. */
@Module({
  imports: [QueuesModule],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig(process.env) },
    {
      provide: DataSource,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        createDataSource({
          host: config.DB_HOST,
          port: config.DB_PORT,
          database: config.DB_NAME,
          username: config.DB_APP_USER,
          password: config.DB_APP_PASSWORD,
          ssl: config.DB_SSL,
        }).initialize(),
    },
    { provide: RoleRegistry, useFactory: buildRegistry },
    {
      provide: MODEL_PROVIDER,
      inject: [APP_CONFIG],
      // LLM_PROVIDER picks Claude or an OpenAI-compatible endpoint (OpenAI, Groq, Gemini, OpenRouter, Ollama).
      useFactory: (config: AppConfig): ModelProvider => selectModelProvider(config),
    },
    {
      provide: SocialProviders,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new SocialProviders({ ...socialConfig(config), fetchMedia: (url) => safeFetchMedia(url) }),
    },
    {
      provide: AccountTokens,
      inject: [DataSource, KEYRING, SocialProviders],
      useFactory: (db: DataSource, keyring: Keyring, providers: SocialProviders) =>
        new AccountTokens(db, keyring, providers),
    },
    {
      provide: RecurringPosts,
      inject: [DataSource],
      useFactory: (db: DataSource) => new RecurringPosts(db),
    },
    {
      provide: AccountStats,
      inject: [DataSource, SocialProviders, AccountTokens],
      useFactory: (db: DataSource, providers: SocialProviders, tokens: AccountTokens) =>
        new AccountStats(db, providers, tokens),
    },
    {
      provide: AccountHealth,
      inject: [DataSource, KEYRING, AccountTokens],
      useFactory: (db: DataSource, keyring: Keyring, tokens: AccountTokens) => new AccountHealth(db, keyring, tokens),
    },
    {
      provide: SocialGateway,
      inject: [DataSource, SocialProviders, AccountTokens],
      useFactory: (db: DataSource, providers: SocialProviders, tokens: AccountTokens) =>
        new SocialGateway(db, { providers, tokens }),
    },
    {
      provide: PostPublisher,
      inject: [DataSource, KEYRING, SocialProviders],
      useFactory: (db: DataSource, keyring: Keyring, providers: SocialProviders) =>
        new PostPublisher(db, { keyring, providers }),
    },
    {
      provide: ReplySender,
      inject: [DataSource, SocialProviders, AccountTokens],
      useFactory: (db: DataSource, providers: SocialProviders, tokens: AccountTokens) =>
        new ReplySender(db, { providers, tokens }),
    },
    {
      provide: TaskEngine,
      inject: [DataSource, RoleRegistry, MODEL_PROVIDER, PinoLogger, SocialGateway],
      useFactory: (
        db: DataSource,
        registry: RoleRegistry,
        model: ModelProvider,
        logger: PinoLogger,
        social: SocialGateway,
      ) =>
        new TaskEngine(db, registry, model, {
          social,
          logger: {
            info: (detail, message) => logger.log({ ...detail, msg: message }, 'TaskEngine'),
            error: (detail, message) => logger.error({ ...detail, msg: message }, undefined, 'TaskEngine'),
          },
        }),
    },
    {
      provide: Triggers,
      inject: [DataSource, RoleRegistry],
      useFactory: (db: DataSource, registry: RoleRegistry) => new Triggers(db, registry),
    },
    {
      provide: ApprovalService,
      inject: [DataSource, RoleRegistry],
      useFactory: (db: DataSource, registry: RoleRegistry) => new ApprovalService(db, registry),
    },
    {
      provide: FeedPoller,
      inject: [DataSource],
      useFactory: (db: DataSource) => new FeedPoller(db),
    },
    {
      provide: WebsitePrefill,
      inject: [DataSource, MODEL_PROVIDER],
      useFactory: (db: DataSource, model: ModelProvider) => new WebsitePrefill(db, model),
    },
    {
      provide: KEYRING,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new Keyring(parseKeyring(config), config.ENCRYPTION_ACTIVE_KID),
    },
    {
      provide: MailDispatcher,
      inject: [DataSource, KEYRING, APP_CONFIG],
      useFactory: (db: DataSource, keyring: Keyring, config: AppConfig) => {
        // Fixture mailboxes (local development only) record mail instead of sending it.
        const recorded = new FixtureTransport();
        return new MailDispatcher(db, {
          keyring,
          appUrl: config.APP_URL,
          transportFor: (mailbox: Mailbox, login: MailboxLogin | null): MailTransport => {
            if (mailbox.provider === 'fixture') return recorded;
            if (!login) throw new Error('This mailbox has no login.');
            return new SmtpTransport(login.smtp);
          },
          hooksFor: (role) => (role === 'sales_manager' ? salesSendHooks : null),
        });
      },
    },
    {
      provide: MailInbox,
      inject: [DataSource, KEYRING],
      useFactory: (db: DataSource, keyring: Keyring) => new MailInbox(db, keyring),
    },
    TaskProcessor,
    PlatformProcessor,
    MailProcessor,
    PublishProcessor,
    ImapPoller,
    Ticker,
  ],
})
export class PlatformModule implements OnApplicationShutdown {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.db.isInitialized) await this.db.destroy();
  }
}
