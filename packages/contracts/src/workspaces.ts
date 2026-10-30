import { z } from 'zod';
import { email } from './auth.js';

const timezone = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone');

export const createWorkspaceRequest = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: timezone.default('UTC'),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
});

export const updateWorkspaceRequest = z
  .object({
    name: z.string().trim().min(1).max(120),
    timezone,
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

export const inviteRequest = z.object({ email, role: z.enum(['admin', 'member']) });
export const acceptInvitationRequest = z.object({ token: z.string().min(1).max(200) });
export const changeRoleRequest = z.object({ role: z.enum(['owner', 'admin', 'member']) });

export interface WorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  country: string | null;
  role: 'owner' | 'admin' | 'member';
}

export interface MemberResponse {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
}

export interface InvitationResponse {
  id: string;
  email: string;
  role: 'admin' | 'member';
  expiresAt: string;
  createdAt: string;
}
