import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from './app-error.js';

/** Validates and normalises a request body against a contracts schema. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new AppError(400, 'validation_failed', 'Some fields need attention.', {
      errors: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
}
