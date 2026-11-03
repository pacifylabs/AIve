const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Escapes a line and turns bare https links and email addresses into links. */
function inline(value: string): string {
  return value
    .split(/(https:\/\/[^\s<>]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)
    .map((part) => {
      if (/^https:\/\//i.test(part)) {
        const url = part.replace(/[.,;:!?)]+$/, '');
        return `<a href="${escape(url)}" style="color:#3346d3">${escape(url)}</a>${escape(part.slice(url.length))}`;
      }
      if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(part)) {
        return `<a href="mailto:${escape(part)}" style="color:#3346d3">${escape(part)}</a>`;
      }
      return escape(part);
    })
    .join('');
}

/**
 * Plain, email-safe HTML built only from escaped text: drafts never carry markup of their own. It looks like a person's
 * email, not a newsletter, on purpose. Paragraphs are split on blank lines; lines of "- item" become a list.
 */
export function renderEmailHtml(input: { subject: string; text: string; unsubscribeUrl?: string }): string {
  const paragraphs = input.text.trim().split(/\n\s*\n/);
  const body = paragraphs
    .map((paragraph) => {
      const lines = paragraph.split('\n');
      if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
        return `<ul style="margin:0 0 16px;padding-left:20px">${lines
          .map((line) => `<li style="margin:0 0 6px">${inline(line.replace(/^\s*[-•]\s+/, ''))}</li>`)
          .join('')}</ul>`;
      }
      return `<p style="margin:0 0 16px">${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
  const footer = input.unsubscribeUrl
    ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280"><a href="${escape(input.unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a></p>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(input.subject)}</title></head><body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${body}${footer}</body></html>`;
}
