'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mediaTicketAction, registerMediaAction } from '@/app/actions/social';

/** Sends a file from the browser straight to Cloudinary (signed by us for this workspace's folder), then records it. */
export function UploadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const { ticket, error } = await mediaTicketAction();
      if (!ticket) throw new Error(error ?? 'Could not start the upload.');
      const form = new FormData();
      form.set('file', file);
      form.set('api_key', ticket.apiKey);
      form.set('timestamp', String(ticket.timestamp));
      form.set('folder', ticket.folder);
      form.set('signature', ticket.signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${ticket.cloudName}/auto/upload`, {
        method: 'POST',
        body: form,
      });
      const stored = (await response.json()) as {
        public_id?: string;
        resource_type?: string;
        error?: { message?: string };
      };
      if (!response.ok || !stored.public_id) throw new Error(stored.error?.message ?? 'Cloudinary refused the file.');
      if (stored.resource_type !== 'image' && stored.resource_type !== 'video') {
        throw new Error('Only pictures and videos can go in the library.');
      }
      const saved = await registerMediaAction(stored.public_id, stored.resource_type, file.name);
      if (saved.error) throw new Error(saved.error);
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="btn btn-primary cursor-pointer">
        {busy ? 'Uploading…' : 'Upload a picture or video'}
        <input
          type="file"
          accept="image/*,video/*"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
      </label>
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
