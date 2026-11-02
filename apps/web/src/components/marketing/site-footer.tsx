import Link from 'next/link';
import { Arrow, BrandMark } from './primitives';

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
      [`mailto:${CONTACT}`, 'Contact us'],
      ['/early-access', 'Join early access'],
      ['/login', 'Log in'],
    ],
  },
  {
    heading: 'Legal',
    links: [
      ['/privacy', 'Privacy'],
      ['/terms', 'Terms'],
      ['/acceptable-use', 'Acceptable use'],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" className="brand" aria-label="AI as a Staff, home">
              <BrandMark />
              <span className="brand-word">AI as a Staff</span>
            </Link>
            <p className="body" style={{ maxWidth: 340 }}>
              AI staff for social media and sales. They start on probation and earn the right to act on their own.
            </p>
            <div className="footer-cta glass">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500 }}>
                <span className="live-dot" />
                Early access is open
              </span>
              <span className="small">
                Invites go out in small groups. Questions? <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
              </span>
              <Link href="/early-access" className="btn btn-dark btn-sm" style={{ alignSelf: 'flex-start' }}>
                Join early access <Arrow />
              </Link>
            </div>
          </div>
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
        </div>
        <div className="footer-bottom">
          <span>© 2026 AI as a Staff</span>
          <span>Earth imagery: NASA</span>
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </div>
      </div>
    </footer>
  );
}
