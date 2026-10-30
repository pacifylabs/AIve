/** Queue names are shared with the API (which enqueues) once it starts producing work. */
export const SYSTEM_QUEUE = 'system';

export interface HeartbeatJob {
  requestedAt: string;
}
