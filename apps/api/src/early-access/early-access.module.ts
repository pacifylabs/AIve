import { Body, Controller, HttpCode, Inject, Injectable, Module, Post, Req } from '@nestjs/common';
import { earlyAccessRequest, type EarlyAccessRequest } from '@ai-staff/contracts';
import { DataSource, EarlyAccessSignup } from '@ai-staff/db';
import type { Request } from 'express';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { RateLimiter } from '../redis/rate-limiter.service.js';

const HOUR = 3600;

@Injectable()
export class EarlyAccessService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  /**
   * Signing up again with the same address updates the existing row, and the answer is identical either way, so the
   * form can't be used to find out who is already on the list.
   */
  async join(input: EarlyAccessRequest, ip: string): Promise<void> {
    await this.limiter.consume(
      { key: `early-access:ip:${ip}`, max: 10, windowSec: HOUR },
      { key: `early-access:email:${input.email}`, max: 5, windowSec: HOUR },
    );
    await this.db
      .createQueryBuilder()
      .insert()
      .into(EarlyAccessSignup)
      .values(
        this.db.getRepository(EarlyAccessSignup).create({
          // Set here because query-builder inserts don't run entity listeners like assignId.
          id: uuidv7(),
          email: input.email,
          website: input.website ?? null,
          role: input.role,
          firstTask: input.firstTask ?? null,
          invitedAt: null,
        }),
      )
      .orUpdate(['website', 'role', 'first_task', 'updated_at'], ['email'])
      .execute();
  }
}

@Controller('early-access')
export class EarlyAccessController {
  constructor(@Inject(EarlyAccessService) private readonly earlyAccess: EarlyAccessService) {}

  @Post()
  @HttpCode(202)
  async join(
    @Body(new ZodPipe(earlyAccessRequest)) body: z.output<typeof earlyAccessRequest>,
    @Req() request: Request,
  ) {
    await this.earlyAccess.join(body, request.ip ?? 'unknown');
    return { status: 'on_list' };
  }
}

@Module({
  controllers: [EarlyAccessController],
  providers: [EarlyAccessService],
})
export class EarlyAccessModule {}
