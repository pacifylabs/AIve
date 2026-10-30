import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { loadConfig } from '@ai-staff/config';
import { LoggerModule } from 'nestjs-pino';
import { HeartbeatProcessor } from './heartbeat.processor.js';
import { SYSTEM_QUEUE } from './queues.js';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: () => ({ pinoHttp: { level: loadConfig(process.env).LOG_LEVEL } }),
    }),
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(loadConfig(process.env).REDIS_URL);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            db: Number(url.pathname.slice(1) || 0),
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: 1_000,
            removeOnFail: 5_000,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: SYSTEM_QUEUE }),
  ],
  providers: [HeartbeatProcessor],
})
export class WorkerModule {}
