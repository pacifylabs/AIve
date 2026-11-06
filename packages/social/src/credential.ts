import {
  type AuthUrlInput,
  type CredentialConnection,
  type CredentialField,
  type ExchangeCodeInput,
  type PendingPublishResult,
  type PostRef,
  type ProviderAccount,
  ProviderError,
  type ProviderTokens,
  type PublishInput,
  type PublishResult,
  type SocialNetwork,
  type SocialProvider,
} from './provider.js';

/**
 * The shape shared by networks with no sign-in page, where the person makes a token or app password themselves and
 * pastes it in. There is no app for us to register and no review to wait for. The calls that belong to a sign-in page
 * say so plainly instead of pretending.
 */
export abstract class CredentialProvider implements SocialProvider {
  abstract readonly network: SocialNetwork;
  abstract readonly label: string;
  abstract readonly credentialFields: readonly CredentialField[];
  readonly authKind = 'credentials' as const;
  readonly supportsNativeScheduling = false;
  readonly usesPkce = false;

  isConfigured() {
    return true;
  }

  getAuthUrl(_input: AuthUrlInput): string {
    throw new ProviderError(`${this.label} connects with a login you paste in, not a sign-in page.`, this.network);
  }

  exchangeCode(_input: ExchangeCodeInput): Promise<ProviderTokens> {
    return Promise.reject(
      new ProviderError(`${this.label} connects with a login you paste in, not a sign-in page.`, this.network),
    );
  }

  /** A login that never expires has nothing to refresh. One that does overrides this. */
  refreshToken(_token: string): Promise<ProviderTokens> {
    return Promise.reject(new ProviderError(`${this.label} needs to be connected again.`, this.network, 'auth'));
  }

  listAccounts(_tokens: ProviderTokens): Promise<ProviderAccount[]> {
    return Promise.resolve([]);
  }

  schedulePost(_input: PublishInput): Promise<PublishResult> {
    return Promise.reject(
      new ProviderError(
        `${this.label} does not hold scheduled posts; we publish it at the time instead.`,
        this.network,
      ),
    );
  }

  abstract connectWithCredentials(input: Record<string, string>): Promise<CredentialConnection>;
  abstract publishPost(input: PublishInput): Promise<PublishResult | PendingPublishResult>;
  abstract fetchMetrics(input: PostRef): Promise<Record<string, number>>;

  /** One filled-in box, trimmed, or a message that names the box. */
  protected field(input: Record<string, string>, name: string): string {
    const value = (input[name] ?? '').trim();
    if (!value) {
      const label = this.credentialFields.find((box) => box.name === name)?.label ?? name;
      throw new ProviderError(`Fill in "${label}".`, this.network);
    }
    return value;
  }

  /** Pictures and videos are not sent to this network yet; refusing beats posting the words without them. */
  protected refuseMedia(input: PublishInput, why: string) {
    if (input.mediaUrls.length) throw new ProviderError(why, this.network);
  }
}

/** Counts what a person sees as one character, so an emoji or an accented letter is one, not several. */
export function graphemeCount(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    let count = 0;
    for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) count += 1;
    return count;
  }
  return [...text].length;
}

/** The words of a post with its markup removed, for matching a post the network returns as HTML. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
