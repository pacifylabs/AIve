import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ApprovalService, buildProductionRegistry, CompanyBrain, RoleRegistry } from '@ai-staff/core';
import { DataSource } from '@ai-staff/db';
import { AuthModule } from '../auth/auth.module.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { CompanyController, InboxController, StaffController } from './platform.controller.js';
import { PLATFORM_QUEUE, PlatformService } from './platform.service.js';

@Module({
  imports: [
    AuthModule,
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const url = new URL(config.REDIS_URL);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            db: Number(url.pathname.slice(1) || 0),
          },
        };
      },
    }),
    BullModule.registerQueue({ name: PLATFORM_QUEUE }),
  ],
  controllers: [InboxController, CompanyController, StaffController],
  providers: [
    // The same role list the worker runs, so the inbox and the engine agree on every task type.
    { provide: RoleRegistry, useFactory: buildProductionRegistry },
    {
      provide: ApprovalService,
      inject: [DataSource, RoleRegistry],
      useFactory: (db: DataSource, registry: RoleRegistry) => new ApprovalService(db, registry),
    },
    { provide: CompanyBrain, inject: [DataSource], useFactory: (db: DataSource) => new CompanyBrain(db) },
    PlatformService,
  ],
})
export class PlatformModule {}
