import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EmailToken, type EmailTokenPurpose, type EntityManager, IsNull, MoreThan } from '@ai-staff/db';
import { AppError } from '../common/app-error.js';
import { randomToken, safeEqualHex, sha256, sixDigitCode } from '../crypto/crypto.js';

const VERIFY_TTL_MS = 15 * 60_000;
const RESET_TTL_MS = 30 * 60_000;
const MAX_CODE_ATTEMPTS = 5;

/** One-time verification codes and reset links. Only hashes are stored; a new one replaces any older unused one. */
@Injectable()
export class EmailCodesService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Codes are short, so the hash includes the user id to keep them unique and unguessable across users. */
  private codeHash(userId: string, code: string): string {
    return sha256(`${userId}:${code}`);
  }

  async issueVerificationCode(userId: string): Promise<string> {
    const code = sixDigitCode();
    await this.replace(userId, 'verify_email', this.codeHash(userId, code), VERIFY_TTL_MS);
    return code;
  }

  async issueResetToken(userId: string): Promise<string> {
    const token = randomToken();
    await this.replace(userId, 'reset_password', sha256(token), RESET_TTL_MS);
    return token;
  }

  /**
   * Checks a code, counting the attempt. Five wrong tries burn the code. Runs outside any caller transaction on
   * purpose: a failed attempt must stay counted even though the caller's work is abandoned.
   */
  async consumeVerificationCode(userId: string, code: string): Promise<void> {
    const repository = this.db.getRepository(EmailToken);
    const row = await repository.findOne({
      where: { userId, purpose: 'verify_email', usedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.expiresAt <= new Date() || row.attempts >= MAX_CODE_ATTEMPTS) {
      throw new AppError(400, 'code_expired', 'That code has expired. Ask for a new one.');
    }
    if (!safeEqualHex(row.tokenHash, this.codeHash(userId, code))) {
      await repository.increment({ id: row.id }, 'attempts', 1);
      throw new AppError(400, 'invalid_code', 'That code is not right.');
    }
    // Conditional, so two concurrent correct submissions cannot both succeed.
    const used = await repository.update({ id: row.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (!used.affected) throw new AppError(400, 'code_expired', 'That code has already been used.');
  }

  /** Returns the user a reset token belongs to and marks it used, or throws. */
  async consumeResetToken(token: string, m: EntityManager): Promise<string> {
    const row = await m.findOne(EmailToken, {
      where: { tokenHash: sha256(token), purpose: 'reset_password', usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      lock: { mode: 'pessimistic_write' },
    });
    if (!row) throw new AppError(400, 'code_expired', 'This reset link has expired or was already used.');
    await m.update(EmailToken, { id: row.id }, { usedAt: new Date() });
    return row.userId;
  }

  private async replace(userId: string, purpose: EmailTokenPurpose, tokenHash: string, ttlMs: number): Promise<void> {
    await this.db.transaction(async (m) => {
      await m.update(EmailToken, { userId, purpose, usedAt: IsNull() }, { usedAt: new Date() });
      await m.save(
        m.create(EmailToken, {
          userId,
          purpose,
          tokenHash,
          expiresAt: new Date(Date.now() + ttlMs),
          attempts: 0,
          usedAt: null,
        }),
      );
    });
  }
}
