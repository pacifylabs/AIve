import { promises as dns } from 'node:dns';

export interface DnsReport {
  spf: boolean;
  /** Found under one of the common selectors. A miss is not proof there is none: providers choose their own. */
  dkim: boolean;
  dmarc: boolean;
  dkimSelector: string | null;
}

type ResolveTxt = (name: string) => Promise<string[][]>;

const DKIM_SELECTORS = ['default', 'google', 'selector1', 'selector2', 'k1', 's1', 's2', 'mail', 'dkim', 'smtp'];

async function txt(resolve: ResolveTxt, name: string): Promise<string[]> {
  try {
    return (await resolve(name)).map((parts) => parts.join(''));
  } catch {
    return [];
  }
}

/** Checks the records a sending domain needs so mail lands in inboxes and cannot be spoofed. */
export async function checkSendingDns(domain: string, resolve: ResolveTxt = dns.resolveTxt): Promise<DnsReport> {
  const [root, dmarc] = await Promise.all([txt(resolve, domain), txt(resolve, `_dmarc.${domain}`)]);
  let dkimSelector: string | null = null;
  for (const selector of DKIM_SELECTORS) {
    const records = await txt(resolve, `${selector}._domainkey.${domain}`);
    if (records.some((record) => /v=DKIM1|p=/i.test(record))) {
      dkimSelector = selector;
      break;
    }
  }
  return {
    spf: root.some((record) => /^v=spf1\b/i.test(record)),
    dkim: dkimSelector !== null,
    dmarc: dmarc.some((record) => /^v=DMARC1\b/i.test(record)),
    dkimSelector,
  };
}
