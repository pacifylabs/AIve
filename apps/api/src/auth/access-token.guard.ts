import { type CanActivate, createParamDecorator, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { DataSource, User } from '@ai-staff/db';
import type { Request } from 'express';
import { AppError } from '../common/app-error.js';
import { TokensService } from './tokens.service.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export type AuthedRequest = Request & { user: AuthUser };

/**
 * Accepts `Authorization: Bearer <access token>`. The user row is re-read on every request so a password reset
 * (which bumps tokenVersion) cuts off existing access tokens immediately instead of after they expire.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(DataSource) private readonly db: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw AppError.unauthorized();
    const claims = await this.tokens.verifyAccess(header.slice(7).trim());
    const user = await this.db.getRepository(User).findOne({
      where: { id: claims.sub },
      select: { id: true, email: true, name: true, tokenVersion: true, emailVerifiedAt: true },
    });
    if (!user || user.tokenVersion !== claims.ver || !user.emailVerifiedAt) throw AppError.unauthorized();
    request.user = { id: user.id, email: user.email, name: user.name };
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest<AuthedRequest>().user;
});
