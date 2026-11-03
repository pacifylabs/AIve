import { randomBytes } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { type Queue, QueueEvents } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYSTEM_QUEUE } from '../src/queues.js';
import { QueuesModule } from '../src/queues.module.js';

const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://localhost:6390';

describe('worker queue round-trip', () => {
  let close: () => Promise<void>;
  let queue: Queue;
  let events: QueueEvents;

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      APP_URL: 'http://localhost:3101',
      WEB_ORIGIN: 'http://localhost:3101',
      DB_HOST: 'unused',
      DB_NAME: 'unused',
      DB_APP_USER: 'unused',
      DB_APP_PASSWORD: 'unused',
      REDIS_URL: redisUrl,
      JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
      ENCRYPTION_KEYS: `t:${randomBytes(32).toString('hex')}`,
      ENCRYPTION_ACTIVE_KID: 't',
      SMTP_URL: 'smtp://localhost:1',
      MAIL_FROM: 'test <test@test.local>',
    });
    const moduleRef = await Test.createTestingModule({ imports: [QueuesModule] }).compile();
    const app = await moduleRef.init();
    queue = app.get<Queue>(getQueueToken(SYSTEM_QUEUE));
    const url = new URL(redisUrl);
    events = new QueueEvents(SYSTEM_QUEUE, { connection: { host: url.hostname, port: Number(url.port || 6379) } });
    await events.waitUntilReady();
    close = () => app.close();
  });

  afterAll(async () => {
    await events?.close();
    await close?.();
  });

  it('processes a heartbeat job', async () => {
    const job = await queue.add('heartbeat', { requestedAt: new Date().toISOString() });
    const result = (await job.waitUntilFinished(events, 10_000)) as { lagMs: number };
    expect(result.lagMs).toBeGreaterThanOrEqual(0);
  });

  it('fails unknown job names loudly', async () => {
    const job = await queue.add('nope', { requestedAt: new Date().toISOString() }, { attempts: 1 });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(/Unknown job nope/);
  });
});
