import { z } from 'zod';
import { email } from './auth.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

/** A bare domain or a full URL; people type "company.com" more often than "https://company.com". */
const website = z
  .string()
  .trim()
  .max(200)
  .refine(
    (value) => value === '' || /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(value),
    'Enter a website like company.com',
  )
  .transform((value) => (value === '' ? undefined : value))
  .optional();

export const earlyAccessRequest = z.object({
  email,
  website,
  /** Left out by the footer's email-only sign-up: a new address gets "both", an address already listed keeps its answers. */
  role: z.enum(['social', 'sales', 'both']).optional(),
  firstTask: optionalText(200),
});
export type EarlyAccessRequest = z.infer<typeof earlyAccessRequest>;
