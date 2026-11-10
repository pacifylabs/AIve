'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearResume,
  type Draft,
  draftKey,
  readDraft,
  readResume,
  removeDraft,
  type Resume,
  sessionStore,
  writeResume,
} from '@/lib/form-draft';

/** The workspace drafts belong to, so one workspace's unfinished form never shows in another. */
const ScopeContext = createContext<string | null>(null);

export function DraftScope({ workspaceId, children }: { workspaceId: string | undefined; children: ReactNode }) {
  return <ScopeContext.Provider value={workspaceId ?? null}>{children}</ScopeContext.Provider>;
}

export interface DraftHandle {
  /** Storage key, or null outside a workspace (nothing is then kept). */
  key: string | null;
  name: string;
  workspaceId: string | null;
  /** What was saved when the form opened, or null for a fresh form. */
  draft: Draft | null;
  /** Forget the saved input and start the form again. */
  discard: () => void;
}

const DraftContext = createContext<DraftHandle | null>(null);

export const useDraftHandle = () => useContext(DraftContext);

/**
 * Brings back what a person typed into this form earlier in this tab. sessionStorage does not exist on the server, so
 * the form first renders fresh, then, if a draft is found, renders again from it (the key restarts every field).
 */
export function WithDraft({ name, children }: { name: string; children: (draft: Draft | null) => ReactNode }) {
  const workspaceId = useContext(ScopeContext);
  const key = workspaceId ? draftKey(workspaceId, name) : null;
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!key) return;
    const store = sessionStore();
    const found = readDraft(store, key);
    // A draft marked as sent that is still here means the send went through and the page moved on.
    if (found?.sent) removeDraft(store, key);
    else if (found) setDraft(found);
    // Back on the form, so the banner pointing here is no longer needed.
    if (readResume(store)?.name === name) clearResume(store);
  }, [key, name]);

  const discard = useCallback(() => {
    if (key) removeDraft(sessionStore(), key);
    setDraft(null);
  }, [key]);

  const handle = useMemo(() => ({ key, name, workspaceId, draft, discard }), [key, name, workspaceId, draft, discard]);
  return (
    <DraftContext.Provider value={handle}>
      <Fragment key={draft ? `draft-${draft.savedAt}` : 'fresh'}>{children(draft)}</Fragment>
    </DraftContext.Provider>
  );
}

/**
 * A link out of a form to set up something it needs. What was typed is saved first, and the page it opens (and any
 * page after, such as a network's sign-in) shows a way back to the form.
 */
export function SetupLink({
  href,
  label,
  onLeave,
  children,
  className = 'font-medium text-accent hover:underline',
}: {
  href: string;
  /** What the form is called in the banner: "Back to {label}". */
  label: string;
  /** Saves the form now, rather than after the usual short wait. */
  onLeave?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const handle = useDraftHandle();
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        onLeave?.();
        if (!handle?.workspaceId) return;
        writeResume(sessionStore(), {
          workspaceId: handle.workspaceId,
          name: handle.name,
          href: `${window.location.pathname}${window.location.search}`,
          label,
        });
      }}
    >
      {children}
    </Link>
  );
}

/** Shown on every page while a form left to set something up still holds unsent input. */
export function ResumeBanner() {
  const pathname = usePathname();
  const workspaceId = useContext(ScopeContext);
  const [resume, setResume] = useState<Resume | null>(null);

  useEffect(() => {
    const store = sessionStore();
    const found = readResume(store);
    if (!found || !workspaceId || found.workspaceId !== workspaceId) {
      setResume(null);
      return;
    }
    const draft = readDraft(store, draftKey(workspaceId, found.name));
    if (!draft || draft.sent) {
      clearResume(store);
      setResume(null);
      return;
    }
    setResume(found.href.split('?')[0] === pathname ? null : found);
  }, [pathname, workspaceId]);

  if (!resume) return null;
  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm"
    >
      <p className="min-w-0 flex-1">
        Your unfinished <span className="font-medium">{resume.label}</span> is saved where you left it.
      </p>
      <div className="flex gap-2">
        <Link href={resume.href} className="btn btn-primary btn-sm">
          Back to {resume.label}
        </Link>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => {
            const store = sessionStore();
            removeDraft(store, draftKey(resume.workspaceId, resume.name));
            clearResume(store);
            setResume(null);
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
