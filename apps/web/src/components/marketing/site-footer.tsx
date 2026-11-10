import Link from 'next/link';
import { liveProfiles, SOCIAL_PROFILES } from '@/lib/site';
import { FooterSignup } from './footer-signup';
import { BrandMark } from './primitives';

const CONTACT = 'pacifylabs@gmail.com';

const COLUMNS = [
  {
    heading: 'Staff',
    links: [
      ['/staff/social-media', 'Social Media Staff'],
      ['/staff/sales-manager', 'Sales Manager Staff'],
    ],
    note: 'More roles coming',
  },
  {
    heading: 'Product',
    links: [
      ['/how-it-works', 'How it works'],
      ['/safety', 'Safety'],
      ['/pricing', 'Pricing'],
      ['/pricing#faq-title', 'Questions'],
    ],
  },
  {
    heading: 'Company',
    links: [
      ['/early-access', 'Join early access'],
      ['/login', 'Log in'],
      [`mailto:${CONTACT}`, 'Contact us'],
    ],
  },
  {
    heading: 'Legal',
    links: [
      ['/privacy', 'Privacy'],
      ['/terms', 'Terms'],
      ['/acceptable-use', 'Acceptable use'],
      ['/data-deletion', 'Data deletion'],
    ],
  },
] as const;

export function SiteFooter() {
  const profiles = liveProfiles(SOCIAL_PROFILES);
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            <Link href="/" className="brand" aria-label="AI as a Staff, home">
              <BrandMark />
              <span className="brand-word">AI as a Staff</span>
            </Link>
            <p className="body" style={{ maxWidth: 440 }}>
              AI staff for social media and sales. They start on probation, work only from facts you confirm, and earn
              the right to act on their own.
            </p>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500 }}>
              <span className="live-dot" />
              Early access is open. Invites go out in small groups.
            </span>
          </div>
          <FooterSignup />
        </div>
        <div className="footer-grid">
          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading} className="footer-col">
              <span className="footer-head">{column.heading}</span>
              {column.links.map(([href, label]) =>
                href.startsWith('mailto:') ? (
                  <a key={href} href={href}>
                    {label}
                  </a>
                ) : (
                  <Link key={href} href={href}>
                    {label}
                  </Link>
                ),
              )}
              {'note' in column ? <span className="footer-note">{column.note}</span> : null}
            </nav>
          ))}
          <div className="footer-col">
            <span className="footer-head">Contact</span>
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
            {profiles.length ? (
              <nav aria-label="Follow us" className="footer-col" style={{ gap: 12 }}>
                {profiles.map((profile) => (
                  <a key={profile.href} href={profile.href} rel="noopener noreferrer" target="_blank">
                    {profile.label}
                  </a>
                ))}
              </nav>
            ) : null}
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 AI as a Staff</span>
          <span>Earth imagery: NASA</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </div>
    </footer>
  );
}
