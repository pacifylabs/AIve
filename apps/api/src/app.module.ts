import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { APP_CONFIG, type AppConfig, ConfigModule } from './config/config.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { DatabaseModule } from './database/database.module.js';
import { EarlyAccessModule } from './early-access/early-access.module.js';
import { HealthController } from './health/health.controller.js';
import { MailModule } from './mail/mail.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { RedisModule } from './redis/redis.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.LOG_LEVEL,
          // Never log credentials or tokens. Bodies are not logged at all.
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            censor: '[redacted]',
          },
          serializers: {
            req: (req: { id: unknown; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url.split('?')[0],
            }),
          },
          autoLogging: { ignore: (req: { url?: string }) => req.url?.startsWith('/health') ?? false },
        },
      }),
    }),
    DatabaseModule,
    RedisModule,
    CryptoModule,
    MailModule,
    AuthModule,
    WorkspacesModule,
    EarlyAccessModule,
    PlatformModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
