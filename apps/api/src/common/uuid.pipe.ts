import { type PipeTransform } from '@nestjs/common';
import { AppError } from './app-error.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rejects malformed IDs as "not found", so probing with junk IDs looks the same as probing with real ones. */
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) throw AppError.notFound();
    return value.toLowerCase();
  }
}

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
