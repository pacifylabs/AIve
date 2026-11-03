import { MetaProvider, type MetaConfig } from './meta.js';
import { ProviderError, SOCIAL_NETWORKS, type SocialNetwork, type SocialProvider } from './provider.js';
import { XProvider, type XConfig } from './x.js';

export interface SocialConfig {
  meta?: MetaConfig;
  x?: XConfig;
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
    this.providers.set('x', new XProvider(config.x ?? { clientId: '', clientSecret: '' }));
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
        label: provider?.label ?? network,
        configured: provider?.isConfigured() ?? false,
        supportsNativeScheduling: provider?.supportsNativeScheduling ?? false,
        canReplyToComments: typeof provider?.replyToComment === 'function',
        canReplyToMessages: typeof provider?.replyToMessage === 'function',
      };
    });
  }
}
