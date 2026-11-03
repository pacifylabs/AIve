import { Module, type OnApplicationShutdown, Inject } from '@nestjs/common';
import { type AppConfig, loadConfig } from '@ai-staff/config';
import { ApprovalService, RoleRegistry, TaskEngine, Triggers, WebsitePrefill } from '@ai-staff/core';
import { createDataSource, DataSource } from '@ai-staff/db';
import { AnthropicProvider, type ModelProvider } from '@ai-staff/llm';
import { Logger as PinoLogger } from 'nestjs-pino';
import { PlatformProcessor } from './platform.processor.js';
import { QueuesModule } from './queues.module.js';
import { buildRegistry } from './roles.js';
import { TaskProcessor } from './task.processor.js';
import { Ticker } from './ticker.service.js';
import { APP_CONFIG, MODEL_PROVIDER } from './tokens.js';

/** Used when no API key is configured: every model call fails with a message an operator can act on. */
const notConfigured: ModelProvider = {
  generate: () => Promise.reject(new Error('ANTHROPIC_API_KEY is not set, so staff cannot call a model.')),
};

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
        }).initialize(),
    },
    { provide: RoleRegistry, useFactory: buildRegistry },
    {
      provide: MODEL_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): ModelProvider =>
        config.ANTHROPIC_API_KEY ? new AnthropicProvider({ apiKey: config.ANTHROPIC_API_KEY }) : notConfigured,
    },
    {
      provide: TaskEngine,
      inject: [DataSource, RoleRegistry, MODEL_PROVIDER, PinoLogger],
      useFactory: (db: DataSource, registry: RoleRegistry, model: ModelProvider, logger: PinoLogger) =>
        new TaskEngine(db, registry, model, {
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
      provide: WebsitePrefill,
      inject: [DataSource, MODEL_PROVIDER],
      useFactory: (db: DataSource, model: ModelProvider) => new WebsitePrefill(db, model),
    },
    TaskProcessor,
    PlatformProcessor,
    Ticker,
  ],
})
export class PlatformModule implements OnApplicationShutdown {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.db.isInitialized) await this.db.destroy();
  }
}
