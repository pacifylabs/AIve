import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { EmailToken, RefreshToken, User } from './entities/identity.entities.js';
import { EarlyAccessSignup } from './entities/early-access.entity.js';
import {
  ActivityEvent,
  AuditEntry,
  CompanyFact,
  CompanyProfile,
  DomainEvent,
  PromotionOffer,
  SpendCap,
  StaffMember,
  StaffTaskSetting,
  TaskRun,
  UsageReservation,
  WorkItem,
} from './entities/platform.entities.js';
import {
  Conversation,
  GlobalSuppression,
  InboundEvent,
  Lead,
  LeadResearch,
  Mailbox,
  Message,
  SendIntent,
  Suppression,
} from './entities/sales.entities.js';
import {
  ConnectedAccount,
  PublishIntent,
  ReplyIntent,
  SocialEngagement,
  SocialMetric,
  ContentFeed,
  FeedItem,
  PostTag,
  PostTemplate,
  SocialPost,
} from './entities/social.entities.js';
import { Invitation, Membership, Workspace } from './entities/workspace.entities.js';
import { IdentityAndWorkspaces1793318400000 } from './migrations/0001-identity-and-workspaces.js';
import { EarlyAccess1793404800000 } from './migrations/0002-early-access.js';
import { PlatformCore1793491200000 } from './migrations/0003-platform-core.js';
import { SalesManager1793577600000 } from './migrations/0004-sales-manager.js';
import { SocialPublishing1793664000000 } from './migrations/0005-social-publishing.js';
import { SocialEngagement1793750400000 } from './migrations/0006-social-engagement.js';
import { SocialReplies1793836800000 } from './migrations/0007-social-replies.js';
import { Autopilot1793923200000 } from './migrations/0008-autopilot.js';
import { MoreNetworks1794009600000 } from './migrations/0009-more-networks.js';
import { PendingPublishes1794096000000 } from './migrations/0010-pending-publishes.js';
import { ContentFeeds1794182400000 } from './migrations/0011-content-feeds.js';
import { NetworksThreadsTikTok1794268800000 } from './migrations/0012-networks-threads-tiktok.js';
import { PostAuthor1794355200000 } from './migrations/0013-post-author.js';
import { PostTagsTemplates1794441600000 } from './migrations/0014-post-tags-templates.js';
import { AuditEveryChange1794528000000 } from './migrations/0015-audit-every-change.js';
import { PostFollowUps1794614400000 } from './migrations/0016-post-follow-ups.js';
import { SnakeNamingStrategy } from './naming.js';

export const entities = [
  User,
  EmailToken,
  RefreshToken,
  Workspace,
  Membership,
  Invitation,
  EarlyAccessSignup,
  CompanyProfile,
  CompanyFact,
  StaffMember,
  StaffTaskSetting,
  PromotionOffer,
  TaskRun,
  WorkItem,
  DomainEvent,
  ActivityEvent,
  AuditEntry,
  UsageReservation,
  SpendCap,
  Mailbox,
  Lead,
  LeadResearch,
  Conversation,
  Message,
  SendIntent,
  Suppression,
  GlobalSuppression,
  InboundEvent,
  ConnectedAccount,
  SocialPost,
  PublishIntent,
  SocialEngagement,
  SocialMetric,
  ContentFeed,
  FeedItem,
  PostTag,
  PostTemplate,
  ReplyIntent,
];
export const migrations = [
  IdentityAndWorkspaces1793318400000,
  EarlyAccess1793404800000,
  PlatformCore1793491200000,
  SalesManager1793577600000,
  SocialPublishing1793664000000,
  SocialEngagement1793750400000,
  SocialReplies1793836800000,
  Autopilot1793923200000,
  MoreNetworks1794009600000,
  PendingPublishes1794096000000,
  ContentFeeds1794182400000,
  NetworksThreadsTikTok1794268800000,
  PostAuthor1794355200000,
  PostTagsTemplates1794441600000,
  AuditEveryChange1794528000000,
  PostFollowUps1794614400000,
];

export interface ConnectionOptions {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  /** Connection pool size; the API and worker size this separately. */
  poolSize?: number;
  /** Use TLS and verify the server certificate. Managed databases (Neon, Render) require it; local Postgres does not. */
  ssl?: boolean;
}

export function createDataSource(options: ConnectionOptions): DataSource {
  return new DataSource({
    type: 'postgres',
    host: options.host,
    port: options.port,
    database: options.database,
    username: options.username,
    password: options.password,
    ssl: options.ssl ? { rejectUnauthorized: true } : false,
    entities,
    migrations,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
    extra: { max: options.poolSize ?? 10 },
  });
}

/** Applies pending migrations. Must connect as the admin role: the app role cannot create tables. */
export async function runMigrations(options: ConnectionOptions): Promise<string[]> {
  const db = createDataSource(options);
  await db.initialize();
  try {
    const applied = await db.runMigrations({ transaction: 'each' });
    return applied.map((migration) => migration.name);
  } finally {
    await db.destroy();
  }
}
