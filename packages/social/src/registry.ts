import { DiscordProvider } from './discord.js';
import { LinkedInProvider, type LinkedInConfig } from './linkedin.js';
import { MetaProvider, type MetaConfig } from './meta.js';
import {
  type MediaFetcher,
  ProviderError,
  SOCIAL_NETWORKS,
  type SocialNetwork,
  type SocialProvider,
} from './provider.js';
import { TelegramProvider } from './telegram.js';
import { ThreadsProvider, type ThreadsConfig } from './threads.js';
import { TikTokProvider, type TikTokConfig } from './tiktok.js';
import { XProvider, type XConfig } from './x.js';

/** Names for networks that have no client yet, so a screen can still list them properly. */
const NETWORK_LABELS: Record<SocialNetwork, string> = {
  facebook: 'Facebook Page',
  instagram: 'Instagram business account',
  linkedin: 'LinkedIn profile or Page',
  x: 'X account',
  threads: 'Threads profile',
  tiktok: 'TikTok account',
  telegram: 'Telegram channel or group',
  discord: 'Discord channel',
};

export interface SocialConfig {
  meta?: MetaConfig;
  x?: XConfig;
  linkedin?: LinkedInConfig;
  threads?: ThreadsConfig;
  /** Reads a public picture for networks that must be sent the file. Supplied by the platform, which owns the safe fetch. */
  fetchMedia?: MediaFetcher;
  tiktok?: TikTokConfig;
}

/**
 * The one place that knows which class speaks to which network. A network with no credentials is still listed, as not
 * configured, so a screen can say why it cannot be connected instead of hiding it. LinkedIn has no client yet (access
 * is a Milestone 0 approval); asking for it fails clearly instead of pretending.
 */
export class SocialProviders {
  private readonly providers = new Map<SocialNetwork, SocialProvider>();

  constructor(config: SocialConfig = {}, overrides: SocialProvider[] = []) {
    const meta = config.meta ?? { appId: '', appSecret: '', graphVersion: 'v21.0', messaging: false };
    this.providers.set('facebook', new MetaProvider('facebook', meta));
    this.providers.set('instagram', new MetaProvider('instagram', meta));
    this.providers.set(
      'x',
      new XProvider(config.x ?? { clientId: '', clientSecret: '' }, undefined, { fetchMedia: config.fetchMedia }),
    );
    this.providers.set(
      'linkedin',
      new LinkedInProvider(config.linkedin ?? { clientId: '', clientSecret: '', pages: false, version: '202610' }, {
        fetchMedia: config.fetchMedia,
      }),
    );
    this.providers.set('threads', new ThreadsProvider(config.threads ?? { appId: '', appSecret: '' }));
    this.providers.set('tiktok', new TikTokProvider(config.tiktok ?? { clientKey: '', clientSecret: '' }));
    this.providers.set('telegram', new TelegramProvider());
    this.providers.set('discord', new DiscordProvider());
    for (const provider of overrides) this.providers.set(provider.network, provider);
  }

  get(network: SocialNetwork): SocialProvider {
    const provider = this.providers.get(network);
    if (!provider) throw new ProviderError(`We cannot post to ${network} yet.`, network);
    return provider;
  }

  catalogue() {
    return SOCIAL_NETWORKS.map((network) => {
      const provider = this.providers.get(network);
      return {
        network,
        label: provider?.label ?? NETWORK_LABELS[network],
        configured: provider?.isConfigured() ?? false,
        auth: provider?.authKind ?? 'oauth',
        /** The boxes for networks with no sign-in page. The hints say where to find each value. */
        fields: provider?.credentialFields ?? [],
        supportsNativeScheduling: provider?.supportsNativeScheduling ?? false,
        canReplyToComments: typeof provider?.replyToComment === 'function',
        canReplyToMessages: typeof provider?.replyToMessage === 'function',
      };
    });
  }
}
