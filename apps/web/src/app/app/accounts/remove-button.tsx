'use client';

import { removeAccountAction } from '@/app/actions/social';

/** Removes an account that is not working. Asks first, because its post history goes with it. */
export function RemoveAccountButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={removeAccountAction}
      onSubmit={(event) => {
        if (!window.confirm(`Remove ${name} for good? Its post history is deleted too. This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-danger hover:underline">
        Remove
      </button>
    </form>
  );
}
