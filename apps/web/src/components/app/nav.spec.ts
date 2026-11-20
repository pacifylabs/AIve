import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, isSidebarCollapsed, PRIMARY, SECTIONS, SETUP, sectionOf, visiblePrimary } from './nav';

describe('app navigation', () => {
  it('keeps the menu short: six places for daily work and three set once', () => {
    expect(PRIMARY.map((item) => item.label)).toEqual([
      'Home',
      'Review work',
      'My staff',
      'Content',
      'Sales',
      'Activity',
    ]);
    expect(SETUP.map((item) => item.label)).toEqual(['Business info', 'Connections', 'Settings']);
  });

  it('shows Sales only once a Sales Manager is hired', () => {
    expect(visiblePrimary([]).map((item) => item.label)).not.toContain('Sales');
    expect(visiblePrimary(['social_media']).map((item) => item.label)).not.toContain('Sales');
    expect(visiblePrimary(['sales_manager']).map((item) => item.label)).toContain('Sales');
  });

  it('keeps every older page reachable from a place in the menu', () => {
    const older = [
      '/app/compose',
      '/app/recurring',
      '/app/results',
      '/app/templates',
      '/app/media',
      '/app/feeds',
      '/app/leads',
      '/app/suppressions',
      '/app/hire',
      '/app/autopilot',
      '/app/mailboxes',
      '/app/audit',
    ];
    for (const path of older) expect(sectionOf(path), path).not.toBeNull();
  });

  it('highlights the right place for nested and grouped pages', () => {
    expect(sectionOf('/app')?.label).toBe('Home');
    expect(sectionOf('/app/pipeline/123')?.label).toBe('Sales');
    expect(sectionOf('/app/staff/abc')?.label).toBe('My staff');
    expect(sectionOf('/app/autopilot')?.label).toBe('My staff');
    expect(sectionOf('/app/media')?.label).toBe('Content');
    expect(sectionOf('/app/mailboxes')?.label).toBe('Connections');
    expect(sectionOf('/elsewhere')).toBeNull();
  });

  it('lists every tab of a section under the place that owns it', () => {
    for (const tab of Object.values(SECTIONS).flat()) expect(sectionOf(tab.href), tab.href).not.toBeNull();
  });

  it('lets search reach each page once', () => {
    const hrefs = ALL_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('reads only the exact collapsed value from the cookie', () => {
    expect(isSidebarCollapsed('collapsed')).toBe(true);
    expect(isSidebarCollapsed(undefined)).toBe(false);
    expect(isSidebarCollapsed('open')).toBe(false);
    expect(isSidebarCollapsed('COLLAPSED')).toBe(false);
  });
});
