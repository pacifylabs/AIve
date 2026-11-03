import { z } from 'zod';
import { factsOnly, optOutPresent } from '../guardrails/index.js';
import { APPROVED_PAYLOAD, type RoleDefinition, type TaskDefinition } from '../roles/types.js';

/**
 * A role that exists only to prove the platform (milestone 2 exit test). It drafts a note on a schedule from the
 * company's facts; approving the note emits `dummy.note_approved`, and another dummy task subscribes to that event.
 * Never registered in production.
 */

const noteSchema = z.object({ title: z.string().min(1).max(120), body: z.string().min(1).max(2000) });
type Note = z.infer<typeof noteSchema>;

const draftNote: TaskDefinition<{ slot?: string; topic?: string }, Note> = {
  type: 'dummy.draft_note',
  name: 'Draft a note',
  risk: 'acts_external',
  defaultAutonomy: 'draft',
  triggers: [{ schedule: '0 9 * * *' }, { person: true }],
  inputSchema: z.object({ slot: z.string().optional(), topic: z.string().optional() }),
  maxAttempts: 3,
  model: { name: 'fake', maxTokens: 500 },
  outputSchema: noteSchema,
  buildPrompt(ctx, input) {
    return {
      system: 'You write a short note for the company, using only its facts.',
      user: [`Topic: ${input.topic ?? 'this week'}`, ...ctx.facts.map((fact) => `- ${fact.text}`)].join('\n'),
      factIds: ctx.facts.map((fact) => fact.id),
    };
  },
  guardrails: [factsOnly<Note>('title', 'body'), optOutPresent<Note>('body')],
  toEffects(_ctx, output) {
    return [
      {
        type: 'createWorkItem',
        kind: 'note_draft',
        title: output.title,
        payload: output,
        onApprove: [{ type: 'emitEvent', event: 'dummy.note_approved', payload: APPROVED_PAYLOAD }],
      },
    ];
  },
  promotion: { approvals: 3, maxMedianEditRatio: 0.15, windowDays: 30 },
};

const recordApproval: TaskDefinition<{ title: string }, { title: string }> = {
  type: 'dummy.record_approval',
  name: 'Record an approved note',
  risk: 'internal',
  defaultAutonomy: 'act',
  triggers: [{ event: 'dummy.note_approved' }],
  inputSchema: z.object({ title: z.string() }),
  execute: async (_ctx, input) => input,
  toEffects: (_ctx, output) => [{ type: 'alert', summary: `Approved note "${output.title}" was recorded.` }],
};

export const dummyRole: RoleDefinition = {
  key: 'dummy',
  version: 1,
  name: 'Dummy Staff',
  summary: 'Test-only role that proves the platform.',
  jobDescription: ['Drafts notes from company facts.'],
  settingsSchema: z.object({}).passthrough(),
  interview: [],
  tasks: [draftNote, recordApproval],
  subscribes: [
    {
      event: 'dummy.note_approved',
      task: 'dummy.record_approval',
      input: (payload) => (typeof payload.title === 'string' ? { title: payload.title } : null),
    },
  ],
  emits: ['dummy.note_approved'],
};
