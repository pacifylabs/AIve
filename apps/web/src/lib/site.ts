/** The public origin of the marketing site, used for canonical links, the sitemap and robots.txt. */
export const SITE_URL = new URL(process.env.SITE_URL ?? 'http://localhost:3101');

export const SITE_NAME = 'AI as a Staff';

export interface SocialProfile {
  label: string;
  href: string;
}

/**
 * Public profiles for the footer. Leave `href` empty until the profile exists; empty or non-https entries are not
 * shown, so the footer never links to a page that isn't there.
 */
export const SOCIAL_PROFILES: SocialProfile[] = [
  { label: 'X', href: '' },
  { label: 'LinkedIn', href: '' },
  { label: 'Instagram', href: '' },
];

export function liveProfiles(profiles: readonly SocialProfile[]): SocialProfile[] {
  return profiles.filter((profile) => profile.href.startsWith('https://'));
}
