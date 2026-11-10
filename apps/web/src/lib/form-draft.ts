/**
 * Unfinished form input, kept in this tab's sessionStorage so a person can leave a form to set up something it needs
 * (an account, a mailbox, a picture) and come back to what they typed. It lives only in this tab, for at most a day,
 * one per workspace and form, and never holds a password, a file or a hidden field.
 */

export type DraftValues = Record<string, string[]>;

export interface Draft {
  values: DraftValues;
  step: number;
  savedAt: number;
  /** Set as the form is sent. A sent draft found later means the send went through and the page moved on. */
  sent?: boolean;
}

/** The way back to a form, set when a person follows a link out of it to set something up. */
export interface Resume {
  workspaceId: string;
  name: string;
  href: string;
  label: string;
}

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const PREFIX = 'ai-staff:draft:';
const RESUME_KEY = 'ai-staff:resume';
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export const draftKey = (workspaceId: string, name: string) => `${PREFIX}${workspaceId}:${name}`;

/** sessionStorage, or null where it is missing or blocked (a private window, a strict setting, the server). */
export function sessionStore(): DraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export interface FieldLike {
  name: string;
  type: string;
  value: string;
  checked?: boolean;
  disabled?: boolean;
}

/** Fields whose value is never kept: secrets, files, and what the page itself fills in (such as a request id). */
const NEVER_KEPT = new Set(['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image']);

/** What the form holds now, by field name. Checkboxes keep every ticked value; unticked ones are left out. */
export function collectValues(fields: Iterable<FieldLike>): DraftValues {
  const values: DraftValues = {};
  for (const field of fields) {
    if (!field.name || field.disabled || NEVER_KEPT.has(field.type)) continue;
    if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) continue;
    (values[field.name] ??= []).push(field.value);
  }
  return values;
}

/** The first saved value of a field, for a text box's starting value. */
export const firstValue = (values: DraftValues | undefined, name: string): string | undefined => values?.[name]?.[0];

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<Draft>;
  return (
    typeof draft.step === 'number' &&
    typeof draft.savedAt === 'number' &&
    !!draft.values &&
    typeof draft.values === 'object' &&
    Object.values(draft.values).every((list) => Array.isArray(list) && list.every((item) => typeof item === 'string'))
  );
}

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The saved draft, or null when there is none, it is older than a day, or it cannot be read (then it is removed). */
export function readDraft(storage: DraftStorage | null, key: string, now = Date.now()): Draft | null {
  const raw = storage?.getItem(key) ?? null;
  if (!raw) return null;
  const draft = parse(raw);
  if (!isDraft(draft) || now - draft.savedAt > DRAFT_TTL_MS) {
    storage?.removeItem(key);
    return null;
  }
  return draft;
}

/** Saves a draft. A full or blocked storage loses the draft, never the form. */
export function writeDraft(storage: DraftStorage | null, key: string, draft: Draft): void {
  try {
    storage?.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota or a blocked store: typing carries on, only the safety copy is missing.
  }
}

export function removeDraft(storage: DraftStorage | null, key: string): void {
  storage?.removeItem(key);
}

export function readResume(storage: DraftStorage | null): Resume | null {
  const value = parse(storage?.getItem(RESUME_KEY) ?? null) as Partial<Resume> | null;
  if (!value || typeof value !== 'object') return null;
  const { workspaceId, name, href, label } = value;
  if (typeof workspaceId !== 'string' || typeof name !== 'string' || typeof label !== 'string') return null;
  // Only a path inside the app: the stored value is never trusted to send the person somewhere else.
  if (typeof href !== 'string' || !href.startsWith('/app') || href.startsWith('//')) return null;
  return { workspaceId, name, href, label };
}

export function writeResume(storage: DraftStorage | null, resume: Resume): void {
  try {
    storage?.setItem(RESUME_KEY, JSON.stringify(resume));
  } catch {
    // As in writeDraft: without it, the banner back to the form does not show.
  }
}

export function clearResume(storage: DraftStorage | null): void {
  storage?.removeItem(RESUME_KEY);
}

/** On sign-out: every draft in this tab, for every workspace, and the way back. */
export function clearAllDrafts(storage: DraftStorage | null): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  storage.removeItem(RESUME_KEY);
}
