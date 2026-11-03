'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Problem } from '@ai-staff/contracts';
import { api } from '@/lib/api';
import { echo, field, type FormState, fromProblem } from '@/lib/form-state';

/** An expired access token inside an action: refresh, then come back to the page the form was on. */
function expired(returnTo: string): never {
  redirect(`/session/refresh?next=${encodeURIComponent(returnTo)}`);
}

/** A failed submit: the API's messages plus what the person typed (never passwords), so the reset form shows it again. */
function failed(problem: Problem, data: FormData, returnTo: string, names: readonly string[]): FormState {
  if (problem.status === 401) expired(returnTo);
  return { ...fromProblem(problem), values: echo(data, (name) => names.includes(name)) };
}

const optional = (value: string) => (value.trim() ? value.trim() : null);
const number = (value: string) => (value.trim() === '' ? NaN : Number(value));

// ---- Mailboxes ---------------------------------------------------------------------------------------------

const MAILBOX_FIELDS = [
  'address',
  'displayName',
  'smtpHost',
  'smtpPort',
  'smtpUser',
  'inboundMode',
  'imapHost',
  'imapPort',
  'imapUser',
] as const;

export async function connectMailboxAction(_state: FormState, data: FormData): Promise<FormState> {
  const imap = field(data, 'inboundMode') === 'imap';
  const result = await api<{ forwardingUrl: string }>('/mailboxes', {
    method: 'POST',
    workspace: true,
    body: {
      address: field(data, 'address'),
      displayName: field(data, 'displayName'),
      provider: 'smtp',
      inboundMode: imap ? 'imap' : 'forward',
      smtp: {
        host: field(data, 'smtpHost'),
        port: number(field(data, 'smtpPort')),
        user: field(data, 'smtpUser'),
        pass: field(data, 'smtpPass'),
      },
      ...(imap
        ? {
            imap: {
              host: field(data, 'imapHost'),
              port: number(field(data, 'imapPort')),
              user: field(data, 'imapUser'),
              pass: field(data, 'imapPass'),
            },
          }
        : {}),
    },
  });
  if (!result.ok) return failed(result.problem, data, '/app/mailboxes', MAILBOX_FIELDS);
  revalidatePath('/app/mailboxes');
  // The forwarding URL holds the mailbox's secret and is shown only now.
  return {
    notice: imap
      ? 'Connected. Send a test message and reply to it to finish.'
      : `Connected. Forward replies to this address now, it is not shown again: ${result.data.forwardingUrl}`,
  };
}

export async function testMailboxAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api(`/mailboxes/${encodeURIComponent(field(data, 'id'))}/test`, {
    method: 'POST',
    workspace: true,
    body: { to: field(data, 'to') },
  });
  if (!result.ok) return failed(result.problem, data, '/app/mailboxes', ['to']);
  revalidatePath('/app/mailboxes');
  return { notice: 'Sent. Reply to it from that address with anything and this mailbox becomes verified.' };
}

export async function checkDnsAction(data: FormData): Promise<void> {
  const result = await api(`/mailboxes/${encodeURIComponent(field(data, 'id'))}/check-dns`, {
    method: 'POST',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/mailboxes');
  revalidatePath('/app/mailboxes');
}

export async function resumeMailboxAction(data: FormData): Promise<void> {
  const result = await api(`/mailboxes/${encodeURIComponent(field(data, 'id'))}/resume`, {
    method: 'POST',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/mailboxes');
  revalidatePath('/app/mailboxes');
}

// ---- Leads -------------------------------------------------------------------------------------------------

export async function addLeadAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api('/leads', {
    method: 'POST',
    workspace: true,
    body: {
      email: field(data, 'email'),
      name: optional(field(data, 'name')),
      company: optional(field(data, 'company')),
      website: optional(field(data, 'website')),
      notes: optional(field(data, 'notes')),
    },
  });
  if (!result.ok) return failed(result.problem, data, '/app/leads', ['email', 'name', 'company', 'website', 'notes']);
  revalidatePath('/app/leads');
  return { notice: 'Added. Your Sales Manager will read their website and draft a first email for you to approve.' };
}

export interface ImportPreview {
  committed: boolean;
  imported: number;
  ready: number;
  skipped: number;
  withoutResearch: number;
  rows: { line: number; email: string; status: string }[];
}

export type ImportState = FormState & { preview?: ImportPreview; csv?: string };

/** Two steps from one form: the first submit previews the file, the second (with `commit`) saves it. */
export async function importLeadsAction(_state: ImportState, data: FormData): Promise<ImportState> {
  const file = data.get('file');
  const pasted = field(data, 'csv');
  const csv = file instanceof File && file.size > 0 ? await file.text() : pasted;
  if (!csv.trim()) return { error: 'Choose a CSV file or paste its contents.' };
  const commit = field(data, 'commit') === 'yes';
  const result = await api<ImportPreview>('/leads/import', { method: 'POST', workspace: true, body: { csv, commit } });
  if (!result.ok) {
    if (result.problem.status === 401) expired('/app/leads');
    return { ...fromProblem(result.problem), csv };
  }
  if (commit) {
    revalidatePath('/app/leads');
    return { notice: `Imported ${result.data.imported} leads.`, preview: result.data };
  }
  return { preview: result.data, csv };
}

// ---- Conversations -----------------------------------------------------------------------------------------

async function conversationCall(id: string, action: 'take-over' | 'give-back') {
  const result = await api(`/conversations/${encodeURIComponent(id)}/${action}`, { method: 'POST', workspace: true });
  if (!result.ok && result.problem.status === 401) expired(`/app/pipeline/${id}`);
  revalidatePath(`/app/pipeline/${id}`);
  revalidatePath('/app/pipeline');
}

export async function takeOverAction(data: FormData): Promise<void> {
  await conversationCall(field(data, 'id'), 'take-over');
}

export async function giveBackAction(data: FormData): Promise<void> {
  await conversationCall(field(data, 'id'), 'give-back');
}

export async function replyAction(_state: FormState, data: FormData): Promise<FormState> {
  const id = field(data, 'id');
  const result = await api(`/conversations/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    workspace: true,
    body: { body: field(data, 'body'), subject: optional(field(data, 'subject')) ?? undefined },
  });
  if (!result.ok) return failed(result.problem, data, `/app/pipeline/${id}`, ['body', 'subject']);
  revalidatePath(`/app/pipeline/${id}`);
  return { notice: 'Queued. It goes out from your mailbox shortly.' };
}

export async function resolveSendAction(data: FormData): Promise<void> {
  const outcome = field(data, 'outcome') === 'sent' ? 'sent' : 'retry';
  const result = await api(`/send-intents/${encodeURIComponent(field(data, 'intentId'))}/resolve`, {
    method: 'POST',
    workspace: true,
    body: { outcome },
  });
  const id = field(data, 'id');
  if (!result.ok && result.problem.status === 401) expired(`/app/pipeline/${id}`);
  revalidatePath(`/app/pipeline/${id}`);
}

export async function closeLeadAction(data: FormData): Promise<void> {
  const state = field(data, 'state') === 'won' ? 'won' : 'lost';
  const result = await api(`/leads/${encodeURIComponent(field(data, 'leadId'))}`, {
    method: 'PATCH',
    workspace: true,
    body: { state },
  });
  if (!result.ok && result.problem.status === 401) expired('/app/pipeline');
  revalidatePath('/app/pipeline');
  revalidatePath('/app/leads');
}

// ---- Suppressions ------------------------------------------------------------------------------------------

export async function addSuppressionAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await api('/suppressions', {
    method: 'POST',
    workspace: true,
    body: { value: field(data, 'value'), note: optional(field(data, 'note')) ?? undefined },
  });
  if (!result.ok) return failed(result.problem, data, '/app/suppressions', ['value', 'note']);
  revalidatePath('/app/suppressions');
  return { notice: 'Added. This address or domain will not be contacted.' };
}

export async function removeSuppressionAction(data: FormData): Promise<void> {
  const result = await api(`/suppressions/${encodeURIComponent(field(data, 'id'))}`, {
    method: 'DELETE',
    workspace: true,
  });
  if (!result.ok && result.problem.status === 401) expired('/app/suppressions');
  revalidatePath('/app/suppressions');
}

// ---- Hiring ------------------------------------------------------------------------------------------------

const HIRE_FIELDS = [
  'displayName',
  'signature',
  'mailboxId',
  'idealCustomer',
  'problem',
  'offer',
  'escalateWhen',
  'ctaUrl',
] as const;

/** Hires the Sales Manager from the interview. The offer answer becomes a company fact the staff member may quote. */
export async function hireSalesManagerAction(_state: FormState, data: FormData): Promise<FormState> {
  const offer = field(data, 'offer').trim();
  const ctaUrl = optional(field(data, 'ctaUrl'));
  let offerFactIds: string[] = [];
  if (offer) {
    const fact = await api<{ id: string }>('/company/facts', {
      method: 'POST',
      workspace: true,
      body: { kind: 'offer', text: offer },
    });
    if (!fact.ok) return failed(fact.problem, data, '/app/hire', HIRE_FIELDS);
    offerFactIds = [fact.data.id];
  }
  const result = await api('/staff', {
    method: 'POST',
    workspace: true,
    body: {
      roleKey: 'sales_manager',
      displayName: field(data, 'displayName'),
      signature: optional(field(data, 'signature')),
      settings: {
        mailboxId: optional(field(data, 'mailboxId')),
        idealCustomer: field(data, 'idealCustomer').trim(),
        problem: field(data, 'problem').trim(),
        escalateWhen: field(data, 'escalateWhen').trim(),
        offerFactIds,
        cta: ctaUrl ? { kind: 'visit', url: ctaUrl } : { kind: 'reply', url: null },
      },
    },
  });
  if (!result.ok) return failed(result.problem, data, '/app/hire', HIRE_FIELDS);
  revalidatePath('/app/hire');
  redirect('/app/leads');
}
