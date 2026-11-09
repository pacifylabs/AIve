'use client';

import { useState } from 'react';

export interface LibraryItem {
  id: string;
  kind: 'image' | 'video';
  name: string;
  urls: { original: string; square?: string; portrait?: string; landscape?: string };
}

const SHAPES = [
  { key: 'original', label: 'As uploaded' },
  { key: 'square', label: 'Square 1:1' },
  { key: 'portrait', label: 'Portrait 9:16' },
  { key: 'landscape', label: 'Landscape 16:9' },
] as const;

/** Adds a library picture or video to the post, with a picture cut to the shape a network likes. */
export function MediaPicker({ items, onPick }: { items: LibraryItem[]; onPick: (url: string) => void }) {
  const [shape, setShape] = useState<(typeof SHAPES)[number]['key']>('original');
  if (!items.length) return null;
  return (
    <details className="rounded-xl border border-line-soft p-3">
      <summary className="cursor-pointer text-sm font-medium text-accent">Pick from the media library</summary>
      <div className="space-y-3 pt-3">
        <label className="flex items-center gap-2 text-xs">
          Shape for pictures
          <select
            value={shape}
            onChange={(event) => setShape(event.target.value as typeof shape)}
            className="field w-auto py-1 text-xs"
          >
            {SHAPES.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() =>
                  onPick(item.kind === 'image' ? (item.urls[shape] ?? item.urls.original) : item.urls.original)
                }
                className="block w-full overflow-hidden rounded-lg border border-line-soft text-left hover:border-accent"
                title={`Add ${item.name}`}
              >
                {item.kind === 'image' ? (
                  <img
                    src={item.urls.square ?? item.urls.original}
                    alt={item.name}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <span className="flex aspect-square items-center justify-center bg-sunken text-xs text-muted">
                    Video
                  </span>
                )}
                <span className="block truncate px-1 py-0.5 text-xs">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
