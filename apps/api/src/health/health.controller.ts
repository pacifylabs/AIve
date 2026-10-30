import { Controller, Get, HttpCode, Inject } from '@nestjs/common';
import { DataSource } from '@ai-staff/db';
import { Redis } from 'ioredis';
import { AppError } from '../common/app-error.js';
import { REDIS } from '../redis/redis.module.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. */
  @Get('live')
  @HttpCode(200)
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies answer. Load balancers stop routing here when this fails. */
  @Get('ready')
  async ready() {
    try {
      await Promise.all([this.db.query('SELECT 1'), this.redis.ping()]);
    } catch {
      throw new AppError(503, 'internal_error', 'A dependency is unavailable.');
    }
    return { status: 'ok' };
  }
}
