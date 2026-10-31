import Link from 'next/link';

const COLUMNS = [
  {
    heading: 'STAFF',
    label: 'Staff',
    links: [
      ['/staff/social-media', 'Social Media Staff'],
      ['/staff/sales-manager', 'Sales Manager Staff'],
    ],
  },
  {
    heading: 'PRODUCT',
    label: 'Product',
    links: [
      ['/how-it-works', 'How it works'],
      ['/safety', 'Safety'],
      ['/pricing', 'Pricing'],
    ],
  },
  {
    heading: 'LEGAL',
    label: 'Legal',
    links: [
      ['/privacy', 'Privacy'],
      ['/terms', 'Terms'],
      ['/acceptable-use', 'Acceptable use'],
    ],
  },
  {
    heading: 'ACCOUNT',
    label: 'Account',
    links: [
      ['/login', 'Log in'],
      ['/early-access', 'Join early access'],
      ['mailto:pacifylabs@gmail.com', 'pacifylabs@gmail.com'],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer style={{ borderTop: '1px solid #E6E6E2', padding: '56px 0 48px' }}>
      <div className="wrap footer-row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                background: '#111111',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 2, background: '#F6F6F4' }} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>AI as a Staff</span>
          </div>
          <span className="small">AI staff that start on probation and earn the right to act on their own.</span>
        </div>
        {COLUMNS.map((column) => (
          <nav
            key={column.heading}
            aria-label={column.label}
            style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}
          >
            <span className="eyebrow" style={{ fontSize: 11 }}>
              {column.heading}
            </span>
            {column.links.map(([href, label]) =>
              href.startsWith('mailto:') ? (
                <a key={href} href={href} style={{ textDecoration: 'none', color: '#3A3A38' }}>
                  {label}
                </a>
              ) : (
                <Link key={href} href={href} style={{ textDecoration: 'none', color: '#3A3A38' }}>
                  {label}
                </Link>
              ),
            )}
          </nav>
        ))}
      </div>
      <div className="wrap" style={{ marginTop: 40 }}>
        <span className="small">© 2026 AI as a Staff</span>
      </div>
    </footer>
  );
}
