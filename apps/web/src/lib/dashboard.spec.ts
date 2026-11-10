import { describe, expect, it } from 'vitest';
import { alertsFor, primaryAction, setupSteps, weekFigures } from './dashboard';

const NOW = new Date('2026-11-10T12:00:00Z');

describe('alertsFor', () => {
  it('is empty when every account is fine and nothing failed', () => {
    expect(
      alertsFor(
        [{ id: 'a', name: 'Acme', health: 'ok', healthReason: null }],
        [{ state: 'published', scheduledFor: '2026-11-09T10:00:00Z' }],
      ),
    ).toEqual([]);
  });

  it('puts what stops posting first, and points failed posts at the earliest failed day', () => {
    const alerts = alertsFor(
      [
        { id: 'a', name: 'Acme IG', health: 'degraded', healthReason: 'Ends on 20 Nov.' },
        { id: 'b', name: 'Acme X', health: 'broken', healthReason: null },
      ],
      [
        { state: 'failed', scheduledFor: '2026-11-08T10:00:00Z' },
        { state: 'failed', scheduledFor: '2026-11-03T10:00:00Z' },
      ],
    );
    expect(alerts.map((alert) => [alert.tone, alert.cta])).toEqual([
      ['danger', 'Reconnect'],
      ['danger', 'See why'],
      ['warn', 'Renew'],
    ]);
    expect(alerts[1]!.text).toBe('2 posts this month did not go out.');
    expect(alerts[1]!.href).toBe('/app/calendar#day-2026-11-03');
    expect(alerts[2]!.text).toContain('Ends on 20 Nov.');
  });
});

describe('setup and the main button', () => {
  const none = { hasCompany: false, hasChannel: false, hasStaff: false, hasApproved: false };
  const all = { hasCompany: true, hasChannel: true, hasStaff: true, hasApproved: true };

  it('lists the four first steps in order', () => {
    expect(setupSteps(none).map((step) => step.href)).toEqual([
      '/app/company',
      '/app/accounts',
      '/app/hire',
      '/app/inbox',
    ]);
    expect(setupSteps({ ...none, hasStaff: true }).map((step) => step.done)).toEqual([false, false, true, false]);
  });

  it('asks to review drafts before anything else', () => {
    expect(primaryAction(1, setupSteps(none))).toEqual({ label: 'Review 1 draft', href: '/app/inbox' });
    expect(primaryAction(3, setupSteps(all)).label).toBe('Review 3 drafts');
  });

  it('then to finish setup, then to write a post', () => {
    expect(primaryAction(0, setupSteps(none)).href).toBe('#setup');
    expect(primaryAction(0, setupSteps(all))).toEqual({ label: 'New post', href: '/app/compose' });
  });
});

describe('weekFigures', () => {
  it('counts only posts that went out in the last seven days', () => {
    const figures = weekFigures(
      [
        { state: 'published', scheduledFor: '2026-11-09T10:00:00Z' },
        { state: 'published', scheduledFor: '2026-11-01T10:00:00Z' },
        { state: 'failed', scheduledFor: '2026-11-09T10:00:00Z' },
        { state: 'scheduled', scheduledFor: '2026-11-11T10:00:00Z' },
      ],
      [{ engagement: 12 }, { engagement: 5 }],
      [
        { reach: 300, change: 4 },
        { reach: null, change: -1 },
      ],
      NOW,
    );
    expect(figures).toEqual({ postsOut: 1, engagement: 17, reach: 300, followers: 3 });
  });

  it('says reach is unknown when no network reports it', () => {
    expect(weekFigures([], [], [{ reach: null, change: 0 }], NOW).reach).toBeNull();
  });
});
