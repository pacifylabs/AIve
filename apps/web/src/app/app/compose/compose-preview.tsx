'use client';

import { useEffect, useState } from 'react';
import { postLength, X_LIMIT } from '@/lib/post-length';

/**
 * The side panel beside New post on wide screens: the post text as typed, and its length against X's limit. It reads
 * the form's `body` field, so the form itself does not change.
 */
export function ComposePreview() {
  const [text, setText] = useState('');

  useEffect(() => {
    const body = document.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
    setText(body?.value ?? '');
    const onInput = (event: Event) => {
      if (event.target instanceof HTMLTextAreaElement && event.target.name === 'body') setText(event.target.value);
    };
    document.addEventListener('input', onInput);
    return () => document.removeEventListener('input', onInput);
  }, []);

  const length = postLength(text);
  return (
    <aside aria-labelledby="preview-heading" className="sticky top-20 hidden space-y-3 xl:block">
      <h2 id="preview-heading" className="eyebrow">
        Preview
      </h2>
      <div className="card p-5">
        {text.trim() ? (
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{text}</p>
        ) : (
          <p className="text-sm text-muted">Your post shows here as you write it.</p>
        )}
      </div>
      <p className={`text-sm ${length > X_LIMIT ? 'text-danger' : 'text-muted'}`} aria-live="polite">
        {length} {length === 1 ? 'character' : 'characters'}.{' '}
        {length > X_LIMIT ? `Too long for X, which allows ${X_LIMIT}.` : `X allows ${X_LIMIT}.`}
      </p>
      <p className="text-xs text-muted">
        What you type is kept in this tab until you send it, so you can leave to connect an account and come back.
      </p>
    </aside>
  );
}
