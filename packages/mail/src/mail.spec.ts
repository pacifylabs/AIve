import { describe, expect, it } from 'vitest';
import { checkSendingDns } from './dns.js';
import { FixtureTransport } from './fixture.js';
import { renderEmailHtml } from './render.js';
import { isFreeMail, isOptOut, splitQuoted } from './thread.js';
import { type OutgoingMail, SendError } from './types.js';

describe('splitQuoted', () => {
  it('keeps only the new text above the quoted history', () => {
    const reply = 'Sounds good, send it over.\n\nOn Mon, 3 Nov 2026 at 09:00, Dee <dee@acme.test> wrote:\n> Hello';
    expect(splitQuoted(reply)).toEqual({
      text: 'Sounds good, send it over.',
      quoted: 'On Mon, 3 Nov 2026 at 09:00, Dee <dee@acme.test> wrote:\n> Hello',
    });
  });

  it('returns the whole message when nothing is quoted', () => {
    expect(splitQuoted('  Just this.  ')).toEqual({ text: 'Just this.', quoted: '' });
  });
});

describe('isOptOut', () => {
  it.each(['Please unsubscribe me', 'STOP', 'stop.', 'Remove me from your list', "Don't email me again", 'opt-out'])(
    'treats "%s" as an opt-out',
    (text) => expect(isOptOut(text)).toBe(true),
  );

  it.each(['Can you stop by on Tuesday?', 'What does it cost?', 'Interested, tell me more'])(
    'does not treat "%s" as an opt-out',
    (text) => expect(isOptOut(text)).toBe(false),
  );

  it('ignores our own opt-out line quoted below a reply', () => {
    expect(isOptOut('Yes please, book me in.\n\n> If this is not for you, reply stop and unsubscribe.')).toBe(false);
  });
});

describe('isFreeMail', () => {
  it('knows consumer mail domains', () => {
    expect(isFreeMail('Someone@Gmail.com')).toBe(true);
    expect(isFreeMail('ceo@acme.test')).toBe(false);
  });
});

describe('renderEmailHtml', () => {
  it('escapes markup from the draft', () => {
    const html = renderEmailHtml({ subject: 'Hi', text: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('links https URLs but not other schemes', () => {
    const html = renderEmailHtml({ subject: 'Hi', text: 'See https://acme.test/a. Or javascript:alert(1)' });
    expect(html).toContain('<a href="https://acme.test/a"');
    expect(html).not.toContain('href="javascript');
  });

  it('turns dash lines into a list and adds an unsubscribe link', () => {
    const html = renderEmailHtml({ subject: 'Hi', text: '- one\n- two', unsubscribeUrl: 'https://app.test/u/x' });
    expect(html).toContain('<ul');
    expect(html).toContain('href="https://app.test/u/x"');
  });
});

describe('checkSendingDns', () => {
  it('reports SPF, DKIM and DMARC from TXT records', async () => {
    const records: Record<string, string[][]> = {
      'acme.test': [['v=spf1 include:_spf.example.test ~all']],
      '_dmarc.acme.test': [['v=DMARC1; p=none']],
      'selector1._domainkey.acme.test': [['v=DKIM1; k=rsa; p=MIGf']],
    };
    const resolve = (name: string) =>
      records[name] ? Promise.resolve(records[name]) : Promise.reject(new Error('ENOTFOUND'));
    expect(await checkSendingDns('acme.test', resolve)).toEqual({
      spf: true,
      dkim: true,
      dmarc: true,
      dkimSelector: 'selector1',
    });
  });

  it('reports missing records as false', async () => {
    const report = await checkSendingDns('bare.test', () => Promise.reject(new Error('ENOTFOUND')));
    expect(report).toEqual({ spf: false, dkim: false, dmarc: false, dkimSelector: null });
  });
});

describe('FixtureTransport', () => {
  const mail: OutgoingMail = {
    from: { name: 'Dee', address: 'dee@acme.test' },
    to: 'lead@buyer.test',
    subject: 'Hi',
    text: 'Hello',
    html: '<p>Hello</p>',
    messageId: '<1@acme.test>',
  };

  it('records sends and can fail the next one either way', async () => {
    const transport = new FixtureTransport();
    await transport.send(mail);
    expect(transport.outbox).toHaveLength(1);
    transport.next = 'refuse';
    await expect(transport.send(mail)).rejects.toMatchObject({ definite: true });
    transport.next = 'drop';
    const dropped = await transport.send(mail).catch((error: unknown) => error);
    expect(dropped).toBeInstanceOf(SendError);
    expect((dropped as SendError).definite).toBe(false);
    expect(transport.outbox).toHaveLength(1);
  });
});
