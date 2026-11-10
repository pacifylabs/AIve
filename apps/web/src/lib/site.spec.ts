import { describe, expect, it } from 'vitest';
import { liveProfiles } from './site';

describe('liveProfiles', () => {
  it('drops profiles without an https address', () => {
    expect(
      liveProfiles([
        { label: 'X', href: '' },
        { label: 'LinkedIn', href: 'https://www.linkedin.com/company/example' },
        { label: 'Old', href: 'http://example.com' },
        { label: 'Script', href: 'javascript:alert(1)' },
      ]),
    ).toEqual([{ label: 'LinkedIn', href: 'https://www.linkedin.com/company/example' }]);
  });

  it('shows nothing when no profile is filled in', () => {
    expect(liveProfiles([{ label: 'X', href: '' }])).toEqual([]);
  });
});
