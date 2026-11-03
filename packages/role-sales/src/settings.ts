import type { StaffMember } from '@ai-staff/db';
import { z } from 'zod';

/** The most new people one staff member may contact in a day, whatever its settings say. */
export const PLATFORM_DAILY_NEW_CONTACTS_MAX = 100;
/** All sends in a day (first touches, follow-ups and replies), as a backstop. */
export const PLATFORM_DAILY_SENDS_MAX = 300;

const hour = z.number().int().min(0).max(24);

/** `settingsSchema` from docs/roles/SALES-MANAGER-STAFF.md. Voice settings arrive with Milestone 3b. */
export const salesSettingsSchema = z
  .object({
    /** Set when a mailbox is connected; until then nothing can be sent. */
    mailboxId: z.uuid().nullable().default(null),
    dailyNewContacts: z.number().int().min(1).max(PLATFORM_DAILY_NEW_CONTACTS_MAX).default(20),
    sendingHours: z
      .object({ start: hour.default(9), end: hour.default(17), weekdaysOnly: z.boolean().default(true) })
      .refine((hours) => hours.start < hours.end, { message: 'The sending window must end after it starts.' })
      .default({ start: 9, end: 17, weekdaysOnly: true }),
    followUps: z
      .object({
        count: z.number().int().min(0).max(3).default(2),
        gapsDays: z.array(z.number().int().min(1).max(30)).max(3).default([3, 5]),
      })
      .default({ count: 2, gapsDays: [3, 5] }),
    /** Company facts (of kind `offer` or `price`) this staff member may quote without asking. Empty: quote none. */
    offerFactIds: z.array(z.uuid()).max(50).default([]),
    escalateWhen: z.string().max(1000).default(''),
    cta: z
      .object({
        kind: z.enum(['book', 'reply', 'visit']).default('reply'),
        url: z
          .url({ protocol: /^https$/ })
          .nullable()
          .default(null),
      })
      .default({ kind: 'reply', url: null }),
    idealCustomer: z.string().max(1000).default(''),
    problem: z.string().max(1000).default(''),
  })
  .strict();

export type SalesSettings = z.infer<typeof salesSettingsSchema>;

export function settingsOf(staff: Pick<StaffMember, 'settings'>): SalesSettings {
  return salesSettingsSchema.parse(staff.settings);
}
