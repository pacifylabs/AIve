import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

const PATHS = [
  '/',
  '/staff/social-media',
  '/staff/sales-manager',
  '/how-it-works',
  '/safety',
  '/pricing',
  '/early-access',
  '/privacy',
  '/terms',
  '/acceptable-use',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : 0.7,
  }));
}
