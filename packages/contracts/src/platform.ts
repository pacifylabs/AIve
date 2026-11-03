import { z } from 'zod';

/** Request bodies for the platform core: the approval inbox, the company brain, staff, promotions and the spend cap. */

const jsonObject = z.record(z.string(), z.unknown());

export const approveWorkItemRequest = z.object({
  /** The payload as the person left it. Omit to approve exactly what the staff member proposed. */
  payload: jsonObject.optional(),
});

export const rejectWorkItemRequest = z.object({
  reason: z.string().trim().min(1, 'Say why, so the staff member can learn from it.').max(500),
});

export const updateCompanyProfileRequest = z
  .object({
    website: z
      .string()
      .trim()
      .max(300)
      .regex(/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i, 'Enter a website like company.com')
      .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
      .nullable(),
    summary: z.string().trim().max(2000).nullable(),
    voice: z.string().trim().max(1000).nullable(),
    audience: z.string().trim().max(1000).nullable(),
    escalationEmail: z.string().trim().toLowerCase().email().max(254).nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Change at least one field.');

export const factKind = z.enum(['offering', 'offer', 'price', 'claim', 'banned', 'link_domain', 'faq']);

export const addFactRequest = z.object({
  kind: factKind,
  text: z.string().trim().min(1).max(1000),
});

export const updateFactRequest = z.object({
  text: z.string().trim().min(1).max(1000),
});

export const updateStaffRequest = z.object({
  state: z.enum(['active', 'paused']),
  pausedReason: z.string().trim().max(300).optional(),
});

export const decidePromotionRequest = z.object({
  accept: z.boolean(),
});

export const spendCapRequest = z.object({
  monthlyCapUsd: z.number().positive().max(100_000),
  alertAtPct: z.number().int().min(1).max(100).default(80),
});
