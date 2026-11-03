import { ConnectedAccount, type DataSource, DomainEvent, SocialPost, asSystem, withTenant } from '@ai-staff/db';
import type { SocialProviders } from '@ai-staff/social';
import { v7 as uuidv7 } from 'uuid';
import type { SocialAccess } from '../roles/types.js';
import { type AccountTokens } from './account-tokens.js';

/** How long after a private message an account may still answer it. Meta's standard messaging window. */
export const MESSAGE_REPLY_WINDOW_MS = 24 * 60 * 60_000;

export interface SocialGatewayOptions {
  providers: SocialProviders;
  tokens: AccountTokens;
  now?: () => Date;
}

/**
 * The platform's one door to the connected networks for tasks and background jobs: it holds the tokens, so a role never
 * does. Reads metrics for tasks, and files what people say to an account as engagements.
 */
export class SocialGateway {
  private readonly now: () => Date;

  constructor(
    private readonly db: DataSource,
    private readonly options: SocialGatewayOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  forWorkspace(workspaceId: string): SocialAccess {
    return {
      fetchMetrics: async (postId) => {
        const { post, account } = await withTenant(this.db, { workspaceId, userId: null }, async (m) => {
          const post = await m.findOneBy(SocialPost, { workspaceId, id: postId });
          const account = post ? await m.findOneBy(ConnectedAccount, { workspaceId, id: post.accountId }) : null;
          return { post, account };
        });
        if (!post?.externalPostId || !account) throw new Error('That post is not on a network yet.');
        const secrets = await this.options.tokens.fresh(account);
        return this.options.providers.get(account.network).fetchMetrics({
          accessToken: secrets.accessToken,
          externalId: account.externalId,
          externalPostId: post.externalPostId,
        });
      },
    };
  }

  /**
   * Looks for new comments on recent posts and files them. The same comment seen twice is one row, so overlapping polls
   * are harmless. A network or account that fails is skipped for this pass; it never stops the others.
   */
  async syncComments(limit = 100): Promise<{ checked: number; filed: number }> {
    const posts = await asSystem(this.db, 'engagement sync: list recently published posts to check for comments', (m) =>
      m.query(
        `SELECT p.id, p.workspace_id, p.staff_id, p.account_id, p.external_post_id
           FROM social_posts p JOIN connected_accounts a ON a.id = p.account_id
          WHERE p.state = 'published' AND p.external_post_id IS NOT NULL AND a.health = 'ok'
            AND p.published_at >= $1
          ORDER BY p.published_at DESC LIMIT $2`,
        [new Date(this.now().getTime() - 7 * 24 * 60 * 60_000), limit],
      ),
    );
    let filed = 0;
    for (const row of posts as {
      id: string;
      workspace_id: string;
      staff_id: string;
      account_id: string;
      external_post_id: string;
    }[]) {
      try {
        filed += await this.syncPost(row);
      } catch {
        // This post's network call failed; the next pass tries again.
      }
    }
    return { checked: (posts as unknown[]).length, filed };
  }

  private async syncPost(row: {
    id: string;
    workspace_id: string;
    staff_id: string;
    account_id: string;
    external_post_id: string;
  }) {
    const workspaceId = row.workspace_id;
    const account = await withTenant(this.db, { workspaceId, userId: null }, (m) =>
      m.findOneBy(ConnectedAccount, { workspaceId, id: row.account_id }),
    );
    if (!account) return 0;
    const provider = this.options.providers.get(account.network);
    if (!provider.fetchComments) return 0;
    const secrets = await this.options.tokens.fresh(account);
    const comments = await provider.fetchComments({
      accessToken: secrets.accessToken,
      externalId: account.externalId,
      externalPostId: row.external_post_id,
      limit: 25,
    });
    let filed = 0;
    for (const comment of comments) {
      filed += await this.file(workspaceId, row.staff_id, {
        accountId: account.id,
        postId: row.id,
        kind: 'comment',
        externalId: comment.externalId,
        authorName: comment.authorName,
        text: comment.message,
        receivedAt: comment.receivedAt,
      });
    }
    return filed;
  }

  /** A private message from a network webhook. Answerable only inside the reply window. */
  receiveMessage(
    workspaceId: string,
    staffId: string,
    input: { accountId: string; externalId: string; authorName: string | null; text: string; receivedAt: Date },
  ) {
    return this.file(workspaceId, staffId, { ...input, postId: null, kind: 'dm' });
  }

  private async file(
    workspaceId: string,
    staffId: string,
    input: {
      accountId: string;
      postId: string | null;
      kind: 'comment' | 'dm';
      externalId: string;
      authorName: string | null;
      text: string;
      receivedAt: Date;
    },
  ): Promise<number> {
    const text = input.text.trim();
    if (!text) return 0;
    return withTenant(this.db, { workspaceId, userId: null }, async (m) => {
      const rows = (await m.query(
        `INSERT INTO social_engagements
           (id, workspace_id, account_id, post_id, kind, external_id, author_name, text, received_at, reply_window_ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (workspace_id, account_id, external_id) DO NOTHING RETURNING id`,
        [
          uuidv7(),
          workspaceId,
          input.accountId,
          input.postId,
          input.kind,
          input.externalId.slice(0, 300),
          input.authorName?.slice(0, 200) ?? null,
          text.slice(0, 5000),
          input.receivedAt,
          input.kind === 'dm' ? new Date(input.receivedAt.getTime() + MESSAGE_REPLY_WINDOW_MS) : null,
        ],
      )) as { id: string }[];
      if (!rows.length) return 0;
      await m.save(
        m.create(DomainEvent, {
          workspaceId,
          type: 'engagement.received',
          payload: { staffId, engagementId: rows[0]!.id },
          sourceRunId: null,
          dispatchedAt: null,
        }),
      );
      return 1;
    });
  }
}
