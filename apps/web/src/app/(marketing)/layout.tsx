import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteNav } from '@/components/marketing/site-nav';
import { themeBootScript } from '@/components/marketing/theme';
import './marketing.css';

const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script may add the dark theme class before React hydrates, so the class can differ from the server's.
    <div className={`page ${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteNav />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
