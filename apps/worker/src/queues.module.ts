import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { loadConfig } from '@ai-staff/config';
import { LoggerModule } from 'nestjs-pino';
import { HeartbeatProcessor } from './heartbeat.processor.js';
import { PLATFORM_QUEUE, SYSTEM_QUEUE, TASKS_QUEUE } from './queues.js';

/** Logging, the Redis connection and the queues. Has no database, so the queue round-trip test runs on Redis alone. */
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
    // Retries and back-off for task runs are decided by the task engine and stored on the run, so BullMQ never retries.
    BullModule.registerQueue({
      name: TASKS_QUEUE,
      defaultJobOptions: { attempts: 1, removeOnComplete: 5_000, removeOnFail: 5_000 },
    }),
    BullModule.registerQueue({ name: PLATFORM_QUEUE }),
  ],
  providers: [HeartbeatProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
