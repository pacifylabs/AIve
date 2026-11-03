/**
 * Plain-text helpers for threads. Inbound HTML is never rendered or trusted: replies are read as text, and only the
 * new part (above the quoted history) is used for decisions.
 */

/** The new part of a reply, and the quoted history below it. */
export function splitQuoted(value: string): { text: string; quoted: string } {
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const boundary = lines.findIndex(
    (line) =>
      /^\s*On .{1,400}wrote:\s*$/.test(line) ||
      /^\s*>/.test(line) ||
      /^\s*-{2,}\s*(Original|Forwarded) message\s*-*/i.test(line) ||
      /^\s*From:\s.+$/.test(line),
  );
  return boundary < 0
    ? { text: value.trim(), quoted: '' }
    : { text: lines.slice(0, boundary).join('\n').trim(), quoted: lines.slice(boundary).join('\n').trim() };
}

const OPT_OUT =
  /\b(unsubscribe|stop (emailing|writing|contacting|sending)|remove me|take me off|opt[- ]?out|do not (contact|email)|don'?t (contact|email)|leave me alone|not interested,? (please )?stop)\b|^\s*stop\s*[.!]*\s*$/im;

/**
 * Whether a reply asks us to stop, judged on the new text only so our own opt-out line quoted below does not count.
 * Deterministic and checked before any model sees the reply: an opt-out never depends on a model's judgement.
 */
export function isOptOut(reply: string): boolean {
  return OPT_OUT.test(splitQuoted(reply).text);
}

export const normaliseEmail = (value: string): string => value.trim().toLowerCase();

export function domainOf(email: string): string {
  return normaliseEmail(email).split('@')[1] ?? '';
}

/** Mail providers whose domain says nothing about a company, so there is no company website to research. */
const FREE_MAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'yandex.ru',
  'fastmail.com',
  'hey.com',
]);

export const isFreeMail = (email: string): boolean => FREE_MAIL.has(domainOf(email));

/** A loose shape check; deliverability is the mail server's job. */
export const looksLikeEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
