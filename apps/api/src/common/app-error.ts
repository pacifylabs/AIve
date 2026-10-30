import type { ErrorCode } from '@ai-staff/contracts';

/** The only error type services throw for expected failures. The problem filter turns it into RFC 9457 JSON. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly options: { errors?: { path: string; message: string }[]; retryAfterSec?: number } = {},
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(message = 'Not found.') {
    return new AppError(404, 'not_found', message);
  }

  static forbidden(message = 'You do not have permission to do that.') {
    return new AppError(403, 'forbidden', message);
  }

  static unauthorized(message = 'Sign in to continue.') {
    return new AppError(401, 'unauthorized', message);
  }

  static conflict(message: string) {
    return new AppError(409, 'conflict', message);
  }
}
