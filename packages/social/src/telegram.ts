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

const API = 'https://api.telegram.org';
const MESSAGE_LIMIT = 4096;
const CAPTION_LIMIT = 1024;

interface Chat {
  id: number;
  title?: string;
  username?: string;
  type: string;
}

/**
 * Telegram channels and groups, through a bot the person makes with @BotFather. The bot must be an administrator of the
 * channel. The bot token never expires. Text goes as plain text, so nothing in a post can be taken for formatting.
 * One or several pictures are supported (the words become the caption); videos are not sent yet.
 */
export class TelegramProvider extends CredentialProvider {
  readonly network = 'telegram' as const;
  readonly label = 'Telegram channel or group';
  readonly credentialFields: readonly CredentialField[] = [
    {
      name: 'botToken',
      label: 'Bot token',
      secret: true,
      hint: 'In Telegram, message @BotFather, send /newbot, and copy the token it gives you. Then add the bot to your channel as an administrator who can post.',
    },
    {
      name: 'chat',
      label: 'Channel or group',
      placeholder: '@yourchannel',
      hint: 'The channel name starting with @. For a private channel, use its number (it starts with -100).',
    },
  ];

  constructor(private readonly fetcher: typeof fetch = fetch) {
    super();
  }

  /** The bot token is part of the address, so it is never put in a message or a log. */
  private async call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
    try {
      const response = await callApi<{ ok: boolean; result: T }>(
        this.network,
        `${API}/bot${token}/${method}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) },
        this.fetcher,
      );
      return response.result;
    } catch (error) {
      if (error instanceof ProviderError && error.status === 403) {
        // The bot was removed, or lost its right to post. Posting cannot work until the person fixes that.
        throw new ProviderError(
          'Telegram says the bot can no longer post there. Add it back as an administrator, then connect again.',
          this.network,
          'auth',
          403,
        );
      }
      throw error;
    }
  }

  async connectWithCredentials(input: Record<string, string>): Promise<CredentialConnection> {
    const token = this.field(input, 'botToken');
    const chatInput = this.field(input, 'chat');
    const chatId = /^-?\d+$/.test(chatInput)
      ? chatInput
      : `@${chatInput.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '')}`;
    const bot = await this.call<{ id: number; username?: string }>(token, 'getMe');
    const chat = await this.call<Chat>(token, 'getChat', { chat_id: chatId });
    const member = await this.call<{ status: string; can_post_messages?: boolean }>(token, 'getChatMember', {
      chat_id: chat.id,
      user_id: bot.id,
    });
    const isAdmin = member.status === 'administrator' || member.status === 'creator';
    const mayPost =
      chat.type === 'channel' ? isAdmin && member.can_post_messages !== false : isAdmin || member.status === 'member';
    if (!mayPost) {
      throw new ProviderError(
        'The bot is not an administrator of that channel yet. Add it as an administrator who can post, then try again.',
        this.network,
      );
    }
    return {
      tokens: { accessToken: token, refreshToken: null, expiresInSeconds: null },
      accounts: [
        {
          externalId: String(chat.id),
          name: chat.title ?? chat.username ?? String(chat.id),
          username: chat.username ? `@${chat.username}` : null,
          kind: 'organization',
          metadata: { chatUsername: chat.username ?? null },
        },
      ],
    };
  }

  async publishPost(input: PublishInput): Promise<PublishResult> {
    const text = input.linkUrl ? `${input.body}\n${input.linkUrl}`.trim() : input.body;
    const token = input.accessToken;
    const chat_id = input.externalId;
    const username = (input.metadata?.username as string | null | undefined)?.replace(/^@/, '') ?? null;
    const permalink = (messageId: number) => (username ? `https://t.me/${username}/${messageId}` : null);

    if (input.mediaUrls.length) {
      if (input.mediaUrls.some((url) => mediaKindOf(url) === 'video')) {
        throw new ProviderError(
          'Videos are not sent to Telegram yet. Use pictures, or leave Telegram off this post.',
          this.network,
        );
      }
      if (input.mediaUrls.length > 10)
        throw new ProviderError('Telegram takes up to 10 pictures in one post.', this.network);
      if (text.length > CAPTION_LIMIT) {
        throw new ProviderError(
          `With a picture, Telegram allows ${CAPTION_LIMIT} characters of text and this is longer.`,
          this.network,
        );
      }
      if (input.mediaUrls.length === 1) {
        const sent = await this.call<{ message_id: number }>(token, 'sendPhoto', {
          chat_id,
          photo: input.mediaUrls[0],
          caption: text,
        });
        return { externalPostId: String(sent.message_id), permalink: permalink(sent.message_id) };
      }
      const album = await this.call<{ message_id: number }[]>(token, 'sendMediaGroup', {
        chat_id,
        media: input.mediaUrls.map((url, index) => ({
          type: 'photo',
          media: url,
          ...(index === 0 ? { caption: text } : {}),
        })),
      });
      const first = album[0]!;
      return { externalPostId: String(first.message_id), permalink: permalink(first.message_id) };
    }

    if (text.length > MESSAGE_LIMIT) {
      throw new ProviderError(`Telegram allows ${MESSAGE_LIMIT} characters and this is longer.`, this.network);
    }
    const sent = await this.call<{ message_id: number }>(token, 'sendMessage', { chat_id, text });
    return { externalPostId: String(sent.message_id), permalink: permalink(sent.message_id) };
  }

  /** Telegram gives a bot no numbers for its own posts. */
  fetchMetrics(_ref: PostRef): Promise<Record<string, number>> {
    return Promise.resolve({});
  }
}
