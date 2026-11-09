import type { StaffMember } from '@ai-staff/db';
import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30.');
const tag = z
  .string()
  .trim()
  .transform((value) => value.replace(/^#+/, '').replace(/\s+/g, ''))
  .pipe(z.string().min(1).max(50));

/** `settingsSchema` from docs/roles/SOCIAL-MEDIA-STAFF.md. Video settings arrive with Milestone 4b. */
export const socialSettingsSchema = z
  .object({
    /** Which connected accounts this staff member posts to. Nothing is planned until there is at least one. */
    accountIds: z.array(z.uuid()).max(20).default([]),
    /** Posts per week, per account. */
    cadence: z.number().int().min(1).max(14).default(3),
    /** Times of day (workspace time zone) posts may go out; plans pick from these. */
    postingTimes: z.array(time).min(1).max(6).default(['09:00', '12:30', '18:00']),
    pillars: z.array(z.string().trim().min(1).max(120)).max(5).default([]),
    hashtags: z
      .object({
        always: z.array(tag).max(5).default([]),
        never: z.array(tag).max(20).default([]),
        max: z.number().int().min(0).max(10).default(3),
      })
      .default({ always: [], never: [], max: 3 }),
    emoji: z.enum(['none', 'light', 'free']).default('light'),
    /** Accounts a person saved so drafts may tag them. The staff member never tags anyone else. */
    mentions: z
      .array(
        z.object({
          network: z.enum(['facebook', 'instagram', 'threads', 'tiktok', 'linkedin', 'x', 'telegram', 'discord']),
          handle: z.string().regex(/^[A-Za-z0-9_.]{2,50}$/),
          name: z.string().max(100).default(''),
          /** True when the network confirmed the account exists; false when a person vouched for it. */
          verified: z.boolean().default(false),
        }),
      )
      .max(50)
      .default([]),
    /** A sign-off added to the end of every post for one account, by account id. Written by the owner, so it is trusted. */
    signatures: z.record(z.uuid(), z.string().trim().max(300)).default({}),
    /** What people should do after seeing a post. */
    goal: z.string().max(300).default(''),
    neverPost: z.string().max(1000).default(''),
    /** Posts the owner liked: used as style examples, never copied. */
    styleExamples: z.array(z.string().max(1500)).max(3).default([]),
    replyPolicy: z
      .object({
        draftReplies: z.boolean().default(true),
        /** Topics that always go to a person, whatever the model thinks. */
        alwaysEscalate: z.string().max(500).default(''),
      })
      .default({ draftReplies: true, alwaysEscalate: '' }),
  })
  .strict();

export type SocialSettings = z.infer<typeof socialSettingsSchema>;

/** The saved @mentions for one network, as handles without the @. */
export function mentionsFor(settings: SocialSettings, network: unknown): string[] {
  return settings.mentions.filter((mention) => mention.network === network).map((mention) => mention.handle);
}

/** The sign-off for one account, or null when it has none. */
export function signatureFor(settings: SocialSettings, accountId: unknown): string | null {
  return (typeof accountId === 'string' ? settings.signatures[accountId] : undefined) || null;
}

export function settingsOf(staff: Pick<StaffMember, 'settings'>): SocialSettings {
  return socialSettingsSchema.parse(staff.settings);
}
