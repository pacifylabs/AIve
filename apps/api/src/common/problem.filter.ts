import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ErrorCode, Problem } from '@ai-staff/contracts';
import type { Response } from 'express';
import { AppError } from './app-error.js';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'validation_failed',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'validation_failed',
  429: 'rate_limited',
};

/** Every error leaves the API as problem+json with a stable code. Unexpected errors are logged and hidden. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const problem = this.toProblem(exception);
    if (exception instanceof AppError && exception.options.retryAfterSec) {
      response.setHeader('Retry-After', String(exception.options.retryAfterSec));
    }
    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown): Problem {
    if (exception instanceof AppError) {
      return {
        type: `https://docs.ai-staff.app/errors/${exception.code}`,
        title: exception.message,
        status: exception.status,
        code: exception.code,
        ...(exception.options.errors ? { errors: exception.options.errors } : {}),
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_CODES[status] ?? (status >= 500 ? 'internal_error' : 'validation_failed');
      return { type: `https://docs.ai-staff.app/errors/${code}`, title: exception.message, status, code };
    }
    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    return {
      type: 'https://docs.ai-staff.app/errors/internal_error',
      title: 'Something went wrong on our side.',
      status: 500,
      code: 'internal_error',
    };
  }
}
