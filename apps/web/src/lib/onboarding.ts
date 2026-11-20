/** The guided first-run path, as data, so which step opens can be tested without a page. */

export type OnboardingStep = 'start' | 'role' | 'business' | 'connect' | 'brief';

/** The steps in order, with what the side rail calls them. */
export const STEP_LABELS: [OnboardingStep, string][] = [
  ['start', 'Welcome'],
  ['role', 'Choose a hire'],
  ['business', 'Your business'],
  ['connect', 'Connect'],
  ['brief', 'The brief'],
];

export interface OnboardingState {
  /** The role chosen on the way, or null before the choice. */
  role: 'social_media' | 'sales_manager' | null;
  confirmedFacts: number;
  socialAccounts: number;
  mailboxes: number;
}

/**
 * The first step not yet done, for someone arriving without a step in the address. The workspace exists by the time
 * this is asked, so the welcome step is already behind them.
 */
export function nextStep(state: OnboardingState): OnboardingStep {
  if (!state.role) return 'role';
  if (state.confirmedFacts === 0) return 'business';
  const connected = state.role === 'sales_manager' ? state.mailboxes > 0 : state.socialAccounts > 0;
  if (!connected) return 'connect';
  return 'brief';
}
