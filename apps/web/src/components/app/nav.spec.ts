import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, isSidebarCollapsed, NAV, NEW_POST, sectionOf } from './nav';

describe('sidebar navigation', () => {
  it('keeps every page reachable exactly once', () => {
    const hrefs = ALL_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toHaveLength(19);
  });

  it('groups pages by job, with setup last', () => {
    expect(NAV.map((group) => group.label)).toEqual([undefined, 'Social', 'Sales', 'Staff', 'Setup']);
  });

  it('shows New post as a button, not a link among the groups', () => {
    expect(NAV.flatMap((group) => group.items)).not.toContainEqual(NEW_POST);
    expect(sectionOf('/app/compose')).toEqual({ group: 'Social', item: NEW_POST });
  });

  it('finds the section for nested pages', () => {
    expect(sectionOf('/app/pipeline/123')?.item.label).toBe('Pipeline');
    expect(sectionOf('/app')?.item.label).toBe('Dashboard');
    expect(sectionOf('/elsewhere')).toBeNull();
  });

  it('reads only the exact collapsed value from the cookie', () => {
    expect(isSidebarCollapsed('collapsed')).toBe(true);
    expect(isSidebarCollapsed(undefined)).toBe(false);
    expect(isSidebarCollapsed('open')).toBe(false);
    expect(isSidebarCollapsed('COLLAPSED')).toBe(false);
  });
});
