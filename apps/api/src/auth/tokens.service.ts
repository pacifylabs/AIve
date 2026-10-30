import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TokenPair } from '@ai-staff/contracts';
import { DataSource, type EntityManager, IsNull, RefreshToken, User } from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { randomToken, sha256 } from '../crypto/crypto.js';

export interface AccessClaims {
  sub: string;
  ver: number;
  typ: 'access';
}

interface MfaClaims {
  sub: string;
  typ: 'mfa';
}

const MFA_TOKEN_TTL_SEC = 300;

@Injectable()
export class TokensService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Starts a new login: a new refresh-token family. */
  async issue(
    user: Pick<User, 'id' | 'tokenVersion'>,
    userAgent: string | undefined,
    manager?: EntityManager,
  ): Promise<TokenPair> {
    return this.mint(user, uuidv7(), userAgent, manager ?? this.db.manager);
  }

  /**
   * Exchanges a refresh token for a new pair. A token that was already exchanged means it was copied, so the whole
   * family is revoked and the caller must sign in again.
   */
  async rotate(presented: string, userAgent: string | undefined): Promise<TokenPair> {
    const outcome = await this.db.transaction(async (m) => {
      const row = await m.findOne(RefreshToken, {
        where: { tokenHash: sha256(presented) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.revokedAt || row.expiresAt <= new Date()) return { kind: 'invalid' as const };
      if (row.rotatedAt) {
        // Committed before answering: an error thrown inside this transaction would roll the revocation back.
        await m.update(RefreshToken, { familyId: row.familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
        return { kind: 'reused' as const };
      }
      const user = await m.findOneByOrFail(User, { id: row.userId });
      await m.update(RefreshToken, { id: row.id }, { rotatedAt: new Date() });
      return { kind: 'rotated' as const, pair: await this.mint(user, row.familyId, userAgent, m) };
    });
    if (outcome.kind === 'rotated') return outcome.pair;
    throw new AppError(
      401,
      outcome.kind === 'reused' ? 'refresh_token_reused' : 'refresh_token_invalid',
      'Your session has ended. Sign in again.',
    );
  }

  async revokeFamilyOf(presented: string): Promise<void> {
    const row = await this.db.getRepository(RefreshToken).findOneBy({ tokenHash: sha256(presented) });
    if (row)
      await this.db
        .getRepository(RefreshToken)
        .update({ familyId: row.familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeAllFor(userId: string, manager: EntityManager): Promise<void> {
    await manager.update(RefreshToken, { userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const claims = await this.jwt.verifyAsync<AccessClaims>(token).catch(() => null);
    if (!claims || claims.typ !== 'access' || typeof claims.sub !== 'string') throw AppError.unauthorized();
    return claims;
  }

  signMfa(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, typ: 'mfa' } satisfies MfaClaims, { expiresIn: MFA_TOKEN_TTL_SEC });
  }

  async verifyMfa(token: string): Promise<string> {
    const claims = await this.jwt.verifyAsync<MfaClaims>(token).catch(() => null);
    if (!claims || claims.typ !== 'mfa')
      throw new AppError(401, 'unauthorized', 'The sign-in step expired. Start again.');
    return claims.sub;
  }

  private async mint(
    user: Pick<User, 'id' | 'tokenVersion'>,
    familyId: string,
    userAgent: string | undefined,
    m: EntityManager,
  ): Promise<TokenPair> {
    const refreshToken = randomToken();
    await m.save(
      m.create(RefreshToken, {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
        rotatedAt: null,
        revokedAt: null,
        userAgent: userAgent?.slice(0, 300) ?? null,
      }),
    );
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, ver: user.tokenVersion, typ: 'access' } satisfies AccessClaims,
      {
        expiresIn: this.config.ACCESS_TOKEN_TTL_SEC,
      },
    );
    return { accessToken, accessTokenExpiresIn: this.config.ACCESS_TOKEN_TTL_SEC, refreshToken };
  }
}
