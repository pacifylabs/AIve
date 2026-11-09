import { Logger } from '@nestjs/common';
import { asSystem, DataSource } from '@ai-staff/db';
import type { NextFunction, Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';
import type { AuthUser } from '../auth/access-token.guard.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);
const logger = new Logger('Audit');

type Tracked = Request & { user?: AuthUser; workspace?: WorkspaceContext };

/**
 * Records every change a signed-in person makes, and every sign-in step, once the response is sent. Reads are not
 * recorded. What is stored is who, which workspace, `METHOD /route/:pattern`, the ids in the route, the status the
 * answer carried and the IP. Request bodies are never stored, so no password, code, token or message text can end up in
 * the log; the one exception is the email address on a sign-in step, which says whose sign-in it was.
 *
 * The workspace comes only from the membership check the route already did, never from the header, so nobody can write
 * into another workspace's log by lying about it. A sign-in step has no workspace: it is written to every workspace the
 * address belongs to, so its admins can see someone guessing a password, and with none when the address is unknown.
 * A failure to write is logged and never fails the request.
 */
export function recordChanges(db: DataSource) {
  return (request: Tracked, response: Response, next: NextFunction) => {
    if (READ_ONLY.has(request.method)) return next();
    response.on('finish', () => {
      const route = (request.route as { path?: string } | undefined)?.path;
      const signIn = Boolean(route?.startsWith('/v1/auth/'));
      if (!route || (!request.user && !signIn)) return;
      const email = signIn && typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : null;
      void write(db, {
        userId: request.user?.id ?? null,
        workspaceId: request.workspace?.workspaceId ?? null,
        action: `${request.method} ${route}`.slice(0, 120),
        target: Object.values(request.params).join(',').slice(0, 120),
        detail: { status: response.statusCode, ...(email ? { email: email.slice(0, 320) } : {}) },
        ip: request.ip?.slice(0, 45) ?? null,
        email,
      }).catch((error: unknown) =>
        logger.error({ error: error instanceof Error ? error.message : String(error) }, 'audit entry not written'),
      );
    });
    next();
  };
}

interface Entry {
  userId: string | null;
  workspaceId: string | null;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  ip: string | null;
  email: string | null;
}

async function write(db: DataSource, entry: Entry) {
  await asSystem(db, 'audit: record a change made by a person', async (m) => {
    // Each place the entry belongs: its own workspace, or for a sign-in step every workspace the address is a member of.
    let places: { userId: string | null; workspaceId: string | null }[] = [
      { userId: entry.userId, workspaceId: entry.workspaceId },
    ];
    if (!entry.workspaceId && entry.email) {
      const rows = (await m.query(
        `SELECT u.id AS user_id, ms.workspace_id FROM users u
           LEFT JOIN memberships ms ON ms.user_id = u.id WHERE lower(u.email) = $1`,
        [entry.email],
      )) as { user_id: string; workspace_id: string | null }[];
      if (rows.length) places = rows.map((row) => ({ userId: row.user_id, workspaceId: row.workspace_id }));
    }
    for (const place of places) {
      await m.query(
        `INSERT INTO audit_log (id, workspace_id, user_id, action, target, detail, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uuidv7(), place.workspaceId, place.userId, entry.action, entry.target, entry.detail, entry.ip],
      );
    }
  });
}
