import { Inject, Injectable } from '@nestjs/common';
import { DataSource, User } from '@ai-staff/db';
import { Secret, TOTP } from 'otpauth';
import { AppError } from '../common/app-error.js';
import { Keyring } from '../crypto/crypto.js';
import { verifyPassword } from './passwords.js';

const ISSUER = 'AI Staff';

/** TOTP (authenticator app) second factor. The secret is stored encrypted; enrolment needs one valid code to finish. */
@Injectable()
export class MfaService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Keyring) private readonly keyring: Keyring,
  ) {}

  private totp(user: Pick<User, 'email'>, secret: Secret): TOTP {
    return new TOTP({ issuer: ISSUER, label: user.email, secret, algorithm: 'SHA1', digits: 6, period: 30 });
  }

  async startEnrolment(userId: string): Promise<{ otpauthUri: string; secret: string }> {
    const user = await this.db.getRepository(User).findOneByOrFail({ id: userId });
    if (user.mfaEnabledAt) throw new AppError(409, 'mfa_already_enabled', 'Two-step sign-in is already on.');
    const secret = new Secret({ size: 20 });
    await this.db.getRepository(User).update({ id: userId }, { mfaSecretEnc: this.keyring.encrypt(secret.base32) });
    return { otpauthUri: this.totp(user, secret).toString(), secret: secret.base32 };
  }

  async confirmEnrolment(userId: string, code: string): Promise<void> {
    const user = await this.db.getRepository(User).findOneByOrFail({ id: userId });
    if (user.mfaEnabledAt) throw new AppError(409, 'mfa_already_enabled', 'Two-step sign-in is already on.');
    if (!user.mfaSecretEnc) throw new AppError(400, 'mfa_not_enabled', 'Start setting up two-step sign-in first.');
    if (!this.check(user, code)) throw new AppError(400, 'invalid_code', 'That code is not right.');
    await this.db.getRepository(User).update({ id: userId }, { mfaEnabledAt: new Date() });
  }

  async disable(userId: string, code: string, password: string): Promise<void> {
    const user = await this.db.getRepository(User).findOneByOrFail({ id: userId });
    if (!user.mfaEnabledAt) throw new AppError(400, 'mfa_not_enabled', 'Two-step sign-in is not on.');
    if (!(await verifyPassword(user.passwordHash, password)) || !this.check(user, code)) {
      throw new AppError(400, 'invalid_code', 'The password or code is not right.');
    }
    await this.db.getRepository(User).update({ id: userId }, { mfaEnabledAt: null, mfaSecretEnc: null });
  }

  /** Accepts the current 30-second step and one either side, for clock drift. */
  check(user: Pick<User, 'email' | 'mfaSecretEnc'>, code: string): boolean {
    if (!user.mfaSecretEnc) return false;
    const secret = Secret.fromBase32(this.keyring.decrypt(user.mfaSecretEnc));
    return this.totp(user, secret).validate({ token: code, window: 1 }) !== null;
  }
}
