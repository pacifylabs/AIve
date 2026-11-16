import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LEGAL_UPDATED } from '@/components/marketing/legal-page';
import AcceptableUsePage from './acceptable-use/page';
import PrivacyPage from './privacy/page';
import TermsPage from './terms/page';

const render = (page: () => ReactNode) => renderToStaticMarkup(createElement(page));

describe('legal pages', () => {
  const pages = { terms: render(TermsPage), privacy: render(PrivacyPage), acceptableUse: render(AcceptableUsePage) };

  it('are published in full: no draft notice, a real date and a contact address', () => {
    for (const html of Object.values(pages)) {
      expect(html).not.toMatch(/Draft|published before launch/);
      expect(html).toContain(`Last updated ${LEGAL_UPDATED}`);
      expect(html).toContain('mailto:pacifylabs@gmail.com');
    }
    expect(Number.isNaN(Date.parse(LEGAL_UPDATED))).toBe(false);
  });

  it('name the operator and the governing law', () => {
    expect(pages.terms).toContain('Pacify Labs');
    expect(pages.terms).toContain('laws of the Federal Republic of Nigeria');
    expect(pages.privacy).toContain('Nigeria Data Protection Act 2023');
  });

  it('list who processes data and what the cookies are for', () => {
    for (const name of ['Vercel', 'Render', 'Neon', 'Resend', 'Cloudinary', 'Anthropic', 'Paystack']) {
      expect(pages.privacy).toContain(name);
    }
    expect(pages.privacy).toContain('no advertising or analytics trackers');
  });
});
