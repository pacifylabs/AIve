import { CredentialProvider } from './credential.js';
import {
  callApi,
  type CredentialConnection,
  type CredentialField,
  mediaKindOf,
  type PostRef,
  ProviderError,
  type PublishInput,
  type PublishResult,
} from './provider.js';

const CONTENT_LIMIT = 2000;
const WEBHOOK = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/(\d+)\/([\w-]+)$/;

/**
 * A Discord channel, through a webhook the person makes in the channel's settings. A webhook can post to its own
 * channel and nothing else, so there is no bot to add and nothing more to trust us with. The webhook address is the
 * secret and never expires. Posts never ping anyone: mentions of people, roles and @everyone are switched off. Pictures
 * go as embedded images; videos are not sent yet.
 */
export class DiscordProvider extends CredentialProvider {
  readonly network = 'discord' as const;
  readonly label = 'Discord channel';
  readonly credentialFields: readonly CredentialField[] = [
    {
      name: 'webhookUrl',
      label: 'Webhook address',
      secret: true,
      placeholder: 'https://discord.com/api/webhooks/…',
      hint: 'In Discord: channel settings, then Integrations, then Webhooks, then New webhook. Choose the channel and copy the webhook address.',
    },
  ];

  constructor(private readonly fetcher: typeof fetch = fetch) {
    super();
  }

  async connectWithCredentials(input: Record<string, string>): Promise<CredentialConnection> {
    const url = this.field(input, 'webhookUrl');
    const match = WEBHOOK.exec(url);
    if (!match) {
      // Only Discord's own address is ever called, so this cannot be pointed at anything else.
      throw new ProviderError(
        "That is not a Discord webhook address. Copy it from the channel's Webhooks settings.",
        this.network,
      );
    }
    const hook = await callApi<{ id: string; name?: string; guild_id?: string; channel_id?: string }>(
      this.network,
      url,
      {},
      this.fetcher,
    );
    return {
      tokens: { accessToken: url, refreshToken: null, expiresInSeconds: null },
      accounts: [
        {
          externalId: hook.id ?? match[1]!,
          name: hook.name ? `${hook.name} (Discord channel)` : 'Discord channel',
          username: null,
          kind: 'organization',
          metadata: { guildId: hook.guild_id ?? null, channelId: hook.channel_id ?? null },
        },
      ],
    };
  }

  async publishPost(input: PublishInput): Promise<PublishResult> {
    if (!WEBHOOK.test(input.accessToken)) {
      throw new ProviderError(
        'This Discord connection is no longer valid. Connect the channel again.',
        this.network,
        'auth',
      );
    }
    if (input.mediaUrls.some((url) => mediaKindOf(url) === 'video')) {
      throw new ProviderError(
        'Videos are not sent to Discord yet. Use pictures, or leave Discord off this post.',
        this.network,
      );
    }
    if (input.mediaUrls.length > 10)
      throw new ProviderError('Discord takes up to 10 pictures in one post.', this.network);
    const content = input.linkUrl ? `${input.body}\n${input.linkUrl}`.trim() : input.body;
    if (content.length > CONTENT_LIMIT) {
      throw new ProviderError(`Discord allows ${CONTENT_LIMIT} characters and this is longer.`, this.network);
    }
    try {
      const sent = await callApi<{ id: string; channel_id?: string; guild_id?: string }>(
        this.network,
        `${input.accessToken}?wait=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            // A post must never ping people, roles or everyone, whatever the words say.
            allowed_mentions: { parse: [] },
            ...(input.mediaUrls.length ? { embeds: input.mediaUrls.map((url) => ({ image: { url } })) } : {}),
          }),
        },
        this.fetcher,
      );
      const guild = sent.guild_id ?? (input.metadata?.guildId as string | undefined);
      return {
        externalPostId: sent.id,
        permalink:
          guild && sent.channel_id ? `https://discord.com/channels/${guild}/${sent.channel_id}/${sent.id}` : null,
      };
    } catch (error) {
      // 404 means the webhook was deleted, which only reconnecting can fix.
      if (error instanceof ProviderError && error.status === 404) {
        throw new ProviderError(
          'That Discord webhook was deleted. Make a new one and connect the channel again.',
          this.network,
          'auth',
          404,
        );
      }
      throw error;
    }
  }

  /** A webhook cannot read back what it posted. */
  fetchMetrics(_ref: PostRef): Promise<Record<string, number>> {
    return Promise.resolve({});
  }
}
