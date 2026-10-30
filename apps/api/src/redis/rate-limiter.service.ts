import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { REDIS } from './redis.module.js';

export interface Limit {
  /** What is being limited, e.g. `login:ip:1.2.3.4`. Must not contain secrets. */
  key: string;
  max: number;
  windowSec: number;
}

/** Fixed-window counters in Redis, shared by every API instance. */
@Injectable()
export class RateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Counts one attempt against every limit and throws `rate_limited` if any of them is exceeded. */
  async consume(...limits: Limit[]): Promise<void> {
    const pipeline = this.redis.multi();
    for (const limit of limits) {
      const key = `${this.config.RATE_LIMIT_PREFIX}:${limit.key}`;
      pipeline.incr(key).expire(key, limit.windowSec, 'NX').ttl(key);
    }
    const results = (await pipeline.exec()) ?? [];
    limits.forEach((limit, index) => {
      const count = Number(results[index * 3]?.[1] ?? 0);
      if (count > limit.max) {
        const ttl = Number(results[index * 3 + 2]?.[1] ?? limit.windowSec);
        throw new AppError(429, 'rate_limited', 'Too many attempts. Try again later.', {
          retryAfterSec: ttl > 0 ? ttl : limit.windowSec,
        });
      }
    });
  }
}
