import { Inject, Injectable } from '@nestjs/common';
import type { LoginResponse, MeResponse, SignupRequest, TokenPair } from '@ai-staff/contracts';
import { DataSource, Membership, UNIQUE_VIOLATION, QueryFailedError, User, Workspace, withTenant } from '@ai-staff/db';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { Mailer } from '../mail/mail.module.js';
import { accountExistsEmail, passwordResetEmail, verificationEmail } from '../mail/templates.js';
import { RateLimiter } from '../redis/rate-limiter.service.js';
import { EmailCodesService } from './email-codes.service.js';
import { MfaService } from './mfa.service.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords.js';
import { TokensService } from './tokens.service.js';

export interface ClientInfo {
  ip: string;
  userAgent: string | undefined;
}

const HOUR = 3600;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(TokensService) private readonly tokens: TokensService,
    @Inject(EmailCodesService) private readonly codes: EmailCodesService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(Mailer) private readonly mailer: Mailer,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Always answers the same way whether or not the email is taken, so sign-up cannot be used to find out who has an
   * account. The owner of an existing address gets an email instead.
   */
  async signup(input: SignupRequest, client: ClientInfo): Promise<void> {
    await this.limiter.consume(
      { key: `signup:ip:${client.ip}`, max: 10, windowSec: HOUR },
      { key: `signup:email:${input.email}`, max: 5, windowSec: HOUR },
    );
    const users = this.db.getRepository(User);
    const existing = await users.findOneBy({ email: input.email });
    if (existing) {
      if (existing.emailVerifiedAt)
        await this.mailer.send(accountExistsEmail(existing.email, existing.name, this.config.APP_URL));
      else await this.sendVerification(existing);
      return;
    }
    const passwordHash = await hashPassword(input.password);
    let user: User;
    try {
      user = await users.save(
        users.create({
          email: input.email,
          name: input.name,
          passwordHash,
          emailVerifiedAt: null,
          mfaSecretEnc: null,
          mfaEnabledAt: null,
          tokenVersion: 0,
        }),
      );
    } catch (error) {
      // Two sign-ups racing for one address: the loser behaves like "already exists".
      if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === UNIQUE_VIOLATION)
        return;
      throw error;
    }
    await this.sendVerification(user);
  }

  async resendVerification(email: string, client: ClientInfo): Promise<void> {
    await this.limiter.consume(
      { key: `verify-resend:email:${email}`, max: 5, windowSec: HOUR },
      { key: `verify-resend:ip:${client.ip}`, max: 20, windowSec: HOUR },
    );
    const user = await this.db.getRepository(User).findOneBy({ email });
    if (user && !user.emailVerifiedAt) await this.sendVerification(user);
  }

  /** Confirms the address and signs the user straight in. */
  async verifyEmail(email: string, code: string, client: ClientInfo): Promise<TokenPair> {
    await this.limiter.consume({ key: `verify:ip:${client.ip}`, max: 30, windowSec: HOUR });
    const user = await this.db.getRepository(User).findOneBy({ email });
    if (!user) throw new AppError(400, 'invalid_code', 'That code is not right.');
    if (user.emailVerifiedAt)
      throw new AppError(400, 'code_expired', 'This address is already verified. Sign in instead.');
    await this.codes.consumeVerificationCode(user.id, code);
    await this.db.getRepository(User).update({ id: user.id }, { emailVerifiedAt: new Date() });
    return this.tokens.issue(user, client.userAgent);
  }

  async login(email: string, password: string, client: ClientInfo): Promise<LoginResponse> {
    await this.limiter.consume(
      { key: `login:email:${email}`, max: 10, windowSec: 900 },
      { key: `login:ip:${client.ip}`, max: 50, windowSec: 900 },
    );
    const user = await this.db.getRepository(User).findOneBy({ email });
    if (!user) {
      await burnPasswordCheck(password);
      throw new AppError(401, 'invalid_credentials', 'The email or password is not right.');
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new AppError(401, 'invalid_credentials', 'The email or password is not right.');
    }
    if (!user.emailVerifiedAt) {
      await this.sendVerification(user);
      throw new AppError(403, 'email_not_verified', 'Verify your email first. We just sent you a new code.');
    }
    if (user.mfaEnabledAt) return { mfaRequired: true, mfaToken: await this.tokens.signMfa(user.id) };
    return { mfaRequired: false, ...(await this.tokens.issue(user, client.userAgent)) };
  }

  async loginWithMfa(mfaToken: string, code: string, client: ClientInfo): Promise<TokenPair> {
    const userId = await this.tokens.verifyMfa(mfaToken);
    await this.limiter.consume({ key: `mfa:user:${userId}`, max: 10, windowSec: 900 });
    const user = await this.db.getRepository(User).findOneBy({ id: userId });
    if (!user?.mfaEnabledAt || !this.mfa.check(user, code))
      throw new AppError(401, 'invalid_code', 'That code is not right.');
    return this.tokens.issue(user, client.userAgent);
  }

  refresh(refreshToken: string, client: ClientInfo): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, client.userAgent);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revokeFamilyOf(refreshToken);
  }

  async forgotPassword(email: string, client: ClientInfo): Promise<void> {
    await this.limiter.consume(
      { key: `forgot:email:${email}`, max: 5, windowSec: HOUR },
      { key: `forgot:ip:${client.ip}`, max: 20, windowSec: HOUR },
    );
    const user = await this.db.getRepository(User).findOneBy({ email });
    if (!user) return;
    const token = await this.codes.issueResetToken(user.id);
    await this.mailer.send(
      passwordResetEmail(
        user.email,
        user.name,
        `${this.config.APP_URL}/reset-password?token=${encodeURIComponent(token)}`,
      ),
    );
  }

  /** Sets the new password and signs out every session, including access tokens already issued. */
  async resetPassword(token: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (m) => {
      const userId = await this.codes.consumeResetToken(token, m);
      const user = await m.findOneByOrFail(User, { id: userId });
      // Following the emailed link proves the address belongs to them.
      await m.update(
        User,
        { id: userId },
        { passwordHash, tokenVersion: user.tokenVersion + 1, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      );
      await this.tokens.revokeAllFor(userId, m);
    });
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.db.getRepository(User).findOneByOrFail({ id: userId });
    const workspaces = await withTenant(this.db, { workspaceId: null, userId }, (m) =>
      m
        .createQueryBuilder(Membership, 'membership')
        .innerJoin(Workspace, 'workspace', 'workspace.id = membership.workspace_id')
        .select(['workspace.id AS id', 'workspace.name AS name', 'workspace.slug AS slug', 'membership.role AS role'])
        .where('membership.user_id = :userId', { userId })
        .andWhere(`workspace.state <> 'closed'`)
        .orderBy('workspace.name', 'ASC')
        .getRawMany<MeResponse['workspaces'][number]>(),
    );
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: !!user.emailVerifiedAt,
      mfaEnabled: !!user.mfaEnabledAt,
      workspaces,
    };
  }

  private async sendVerification(user: User): Promise<void> {
    const code = await this.codes.issueVerificationCode(user.id);
    await this.mailer.send(verificationEmail(user.email, user.name, code));
  }
}
