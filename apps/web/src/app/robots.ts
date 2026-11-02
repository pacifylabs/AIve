import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/session', '/invitations'] },
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
  };
}
