'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { movePostAction } from '@/app/actions/social';

const TYPE = 'application/x-ai-staff-post';

/** A post that can be dragged onto a day. The Edit form on each post does the same job without a mouse. */
export function DraggablePost({
  id,
  updatedAt,
  scheduledFor,
  children,
}: {
  id: string;
  updatedAt: string;
  scheduledFor: string;
  children: ReactNode;
}) {
  return (
    <li
      draggable
      onDragStart={(event) => event.dataTransfer.setData(TYPE, JSON.stringify({ id, updatedAt, scheduledFor }))}
      className="cursor-grab space-y-2 px-5 py-3 text-sm active:cursor-grabbing"
    >
      {children}
    </li>
  );
}

/** The next two weeks as days to drop a post on. Keeps its time of day; a refusal is shown in words. */
export function DayStrip({ days }: { days: { date: string; label: string }[] }) {
  const router = useRouter();
  const [over, setOver] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function drop(date: string, raw: string) {
    setOver(null);
    if (!raw) return;
    const { id, updatedAt, scheduledFor } = JSON.parse(raw) as { id: string; updatedAt: string; scheduledFor: string };
    const result = await movePostAction(id, updatedAt, scheduledFor, date);
    setMessage(result.error ?? null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Drag a scheduled post onto a day to move it there, at the same time.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Days to move a post to">
        {days.map((day) => (
          <div
            key={day.date}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(day.date);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(event) => {
              event.preventDefault();
              void drop(day.date, event.dataTransfer.getData(TYPE));
            }}
            className={`rounded-lg border px-2.5 py-1 text-xs ${over === day.date ? 'border-accent bg-accent-soft' : 'border-line-strong'}`}
          >
            {day.label}
          </div>
        ))}
      </div>
      {message ? (
        <p role="alert" className="text-xs text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
