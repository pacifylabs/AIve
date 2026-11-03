import type { RoleDefinition } from '@ai-staff/core';
import { salesSettingsSchema } from './settings.js';
import { firstTouch } from './tasks/first-touch.js';
import { followUp } from './tasks/follow-up.js';
import { researchLead } from './tasks/research.js';
import { triageReply } from './tasks/triage.js';
import { watchHealth } from './tasks/watch-health.js';
import { weeklyReport } from './tasks/weekly-report.js';

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

/**
 * Sales Manager Staff. See docs/roles/SALES-MANAGER-STAFF.md. Voice tasks (`answer_call`, `call_summary`, `call_lead`)
 * arrive with Milestone 3b and `social_handoff` with Social Media Staff in Milestone 4.
 */
export const salesManagerRole: RoleDefinition = {
  key: 'sales_manager',
  version: 1,
  name: 'Sales Manager Staff',
  summary: 'Researches leads, writes to them, answers replies from your facts, and hands you what needs a person.',
  jobDescription: [
    "Reads each lead's website so the first email is about them, not a template.",
    'Writes the first email and polite follow-ups, inside your sending hours and limits.',
    'Reads replies, answers questions using only your facts, and stops immediately for anyone who opts out.',
    'Hands you anything about pricing beyond your approved offers, contracts, complaints, or anyone who wants a person.',
    'Keeps a simple pipeline and sends you a weekly report.',
  ],
  settingsSchema: salesSettingsSchema,
  interview: [
    {
      key: 'idealCustomer',
      question: 'Who is your ideal customer? (industry, size, role)',
      target: { setting: 'idealCustomer' },
    },
    {
      key: 'problem',
      question: 'What problem do you solve for them, in one sentence?',
      target: { setting: 'problem' },
    },
    {
      key: 'offer',
      question: 'What may this staff member offer without asking you? (for example, a free trial or a demo call)',
      target: { fact: 'offer' },
    },
    {
      key: 'escalateWhen',
      question: 'What must always come to you?',
      target: { setting: 'escalateWhen' },
    },
    {
      key: 'ctaUrl',
      question: 'Where should interested people go? (a booking link or a page)',
      target: { setting: 'cta.url' },
    },
  ],
  tasks: [researchLead, firstTouch, followUp, triageReply, weeklyReport, watchHealth],
  subscribes: [
    {
      event: 'lead.created',
      task: 'sales_manager.research_lead',
      // A lead from social has no website or email to read; it waits for a suggested reply (a later task) instead.
      input: (payload) => (uuid(payload.leadId) && payload.source !== 'social' ? { leadId: payload.leadId } : null),
    },
    {
      event: 'lead.researched',
      task: 'sales_manager.first_touch',
      input: (payload) => (uuid(payload.leadId) ? { leadId: payload.leadId } : null),
    },
    {
      event: 'lead.replied',
      task: 'sales_manager.triage_reply',
      input: (payload) =>
        uuid(payload.leadId) &&
        uuid(payload.conversationId) &&
        uuid(payload.messageId) &&
        typeof payload.conversationVersion === 'number'
          ? {
              leadId: payload.leadId,
              conversationId: payload.conversationId,
              messageId: payload.messageId,
              conversationVersion: payload.conversationVersion,
            }
          : null,
    },
    {
      event: 'mail.bounced',
      task: 'sales_manager.watch_health',
      input: (payload) => (typeof payload.address === 'string' ? { kind: 'bounce', address: payload.address } : null),
    },
    {
      event: 'mail.complained',
      task: 'sales_manager.watch_health',
      input: (payload) =>
        typeof payload.address === 'string' ? { kind: 'complaint', address: payload.address } : null,
    },
  ],
  emits: ['lead.researched'],
};
