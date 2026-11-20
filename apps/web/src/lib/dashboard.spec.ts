import { describe, expect, it } from 'vitest';
import { alertsFor, greeting, setupSteps } from './dashboard';

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

describe('setupSteps', () => {
  const none = { hasCompany: false, hasChannel: false, hasStaff: false, hasApproved: false };

  it('lists the four first steps in order', () => {
    expect(setupSteps(none).map((step) => step.href)).toEqual([
      '/app/company',
      '/app/accounts',
      '/app/hire',
      '/app/inbox',
    ]);
    expect(setupSteps({ ...none, hasStaff: true }).map((step) => step.done)).toEqual([false, false, true, false]);
  });
});

describe('greeting', () => {
  it('follows the hour where the workspace is, and uses the first name', () => {
    const nineUtc = new Date('2026-11-20T09:00:00Z');
    expect(greeting('Ada Audit', 'UTC', nineUtc)).toBe('Good morning, Ada');
    expect(greeting('Ada', 'Asia/Tokyo', nineUtc)).toBe('Good evening, Ada'); // 18:00 there
    expect(greeting('Ada', 'America/New_York', nineUtc)).toBe('Good evening, Ada'); // 04:00 there still counts as night
  });

  it('leaves the name out when there is none', () => {
    expect(greeting('  ', 'UTC', new Date('2026-11-20T14:00:00Z'))).toBe('Good afternoon');
  });
});
