/**
 * The task contract ported from KudiBooks' worker. A task throws one of these to tell the engine what happened;
 * anything else is a failure that is retried with back-off, then marked dead with an alert.
 */

/** Not now: run again at `until`. Does not count as a failed attempt. */
export class Defer extends Error {
  constructor(
    readonly until: Date,
    message: string,
  ) {
    super(message);
  }
}

/** Not at all: the reason the run no longer makes sense (the staff member was paused, the lead stopped). */
export class Cancel extends Error {}
