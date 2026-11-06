import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { schemeBootScript } from '@/components/app/theme';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';

const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: 'Hire AI staff who do real work inside the limits you set.',
  openGraph: { siteName: SITE_NAME, type: 'website' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The colour-scheme script changes the meta tag before first paint, so the head can differ from the server's.
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" suppressHydrationWarning />
        <script dangerouslySetInnerHTML={{ __html: schemeBootScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
