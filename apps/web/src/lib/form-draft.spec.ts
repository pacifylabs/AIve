import { describe, expect, it } from 'vitest';
import {
  clearAllDrafts,
  collectValues,
  DRAFT_TTL_MS,
  draftKey,
  type DraftStorage,
  readDraft,
  readResume,
  writeDraft,
  writeResume,
} from './form-draft';

/** sessionStorage in memory, with a switch to make writes fail as a full store does. */
function memoryStore(full = false): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (full) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key) => void map.delete(key),
  };
}

const NOW = 1_800_000_000_000;

describe('collectValues', () => {
  it('keeps text and every ticked box, and never a password, file or hidden field', () => {
    expect(
      collectValues([
        { name: 'body', type: 'textarea', value: 'Hello' },
        { name: 'accountId', type: 'checkbox', value: 'a', checked: true },
        { name: 'accountId', type: 'checkbox', value: 'b', checked: false },
        { name: 'accountId', type: 'checkbox', value: 'c', checked: true },
        { name: 'smtpPass', type: 'password', value: 'secret' },
        { name: 'requestId', type: 'hidden', value: 'r-1' },
        { name: 'file', type: 'file', value: 'C:\\fakepath\\a.csv' },
        { name: 'mode', type: 'radio', value: 'imap', checked: true },
        { name: 'locked', type: 'text', value: 'x', disabled: true },
        { name: '', type: 'text', value: 'no name' },
      ]),
    ).toEqual({ body: ['Hello'], accountId: ['a', 'c'], mode: ['imap'] });
  });

  it('keeps empty text, so a cleared box stays cleared', () => {
    expect(collectValues([{ name: 'linkUrl', type: 'url', value: '' }])).toEqual({ linkUrl: [''] });
  });
});

describe('drafts', () => {
  const key = draftKey('ws-1', 'compose');

  it('are kept per workspace and form', () => {
    expect(draftKey('ws-1', 'compose')).not.toBe(draftKey('ws-2', 'compose'));
  });

  it('read back what was written', () => {
    const store = memoryStore();
    const draft = { values: { body: ['Hi'] }, step: 2, savedAt: NOW };
    writeDraft(store, key, draft);
    expect(readDraft(store, key, NOW + 1000)).toEqual(draft);
  });

  it('expire after a day and are removed', () => {
    const store = memoryStore();
    writeDraft(store, key, { values: {}, step: 0, savedAt: NOW });
    expect(readDraft(store, key, NOW + DRAFT_TTL_MS + 1)).toBeNull();
    expect(store.map.has(key)).toBe(false);
  });

  it('that cannot be read are removed, not trusted', () => {
    const store = memoryStore();
    store.map.set(key, '{not json');
    expect(readDraft(store, key, NOW)).toBeNull();
    store.map.set(key, JSON.stringify({ values: { body: [1] }, step: 0, savedAt: NOW }));
    expect(readDraft(store, key, NOW)).toBeNull();
    expect(store.map.has(key)).toBe(false);
  });

  it('do not break the form when storage is full or missing', () => {
    expect(() => writeDraft(memoryStore(true), key, { values: {}, step: 0, savedAt: NOW })).not.toThrow();
    expect(readDraft(null, key, NOW)).toBeNull();
  });

  it('are all cleared on sign-out, other keys left alone', () => {
    const store = memoryStore();
    writeDraft(store, draftKey('ws-1', 'compose'), { values: {}, step: 0, savedAt: NOW });
    writeDraft(store, draftKey('ws-2', 'hire:social_media'), { values: {}, step: 0, savedAt: NOW });
    writeResume(store, { workspaceId: 'ws-1', name: 'compose', href: '/app/compose', label: 'New post' });
    store.map.set('theme', 'dark');
    clearAllDrafts(store);
    expect([...store.map.keys()]).toEqual(['theme']);
  });
});

describe('the way back to a form', () => {
  it('reads back a path inside the app', () => {
    const store = memoryStore();
    const resume = { workspaceId: 'ws-1', name: 'compose', href: '/app/compose?template=t1', label: 'New post' };
    writeResume(store, resume);
    expect(readResume(store)).toEqual(resume);
  });

  it('refuses anything that would leave the app', () => {
    const store = memoryStore();
    for (const href of ['https://evil.example', '//evil.example/app', '/login', 'javascript:alert(1)']) {
      store.map.set('ai-staff:resume', JSON.stringify({ workspaceId: 'w', name: 'n', href, label: 'l' }));
      expect(readResume(store)).toBeNull();
    }
  });
});
