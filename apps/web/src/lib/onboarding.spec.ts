import { describe, expect, it } from 'vitest';
import { nextStep, type OnboardingState } from './onboarding';

const fresh: OnboardingState = { role: null, confirmedFacts: 0, socialAccounts: 0, mailboxes: 0 };

describe('nextStep', () => {
  it('asks for the hire first', () => {
    expect(nextStep(fresh)).toBe('role');
  });

  it('then business info until a fact is confirmed', () => {
    expect(nextStep({ ...fresh, role: 'social_media' })).toBe('business');
    expect(nextStep({ ...fresh, role: 'social_media', confirmedFacts: 1 })).toBe('connect');
  });

  it('asks each role for the connection it needs', () => {
    const briefed = { ...fresh, confirmedFacts: 2 };
    // A mailbox does not help Social, and a social account does not help Sales.
    expect(nextStep({ ...briefed, role: 'social_media', mailboxes: 1 })).toBe('connect');
    expect(nextStep({ ...briefed, role: 'sales_manager', socialAccounts: 1 })).toBe('connect');
    expect(nextStep({ ...briefed, role: 'social_media', socialAccounts: 1 })).toBe('brief');
    expect(nextStep({ ...briefed, role: 'sales_manager', mailboxes: 1 })).toBe('brief');
  });
});
