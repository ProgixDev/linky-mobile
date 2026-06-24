import { OnboardingGateScreen } from '@/features/onboarding';

/**
 * Routes stay THIN — wire the URL to the feature screen. The livreur approval gate
 * (use-livreur-gate, wired in _layout) redirects authenticated-but-unapproved couriers
 * here; the screen renders the form / pending / rejection step from the onboarding store.
 */
export default function OnboardingRoute() {
  return <OnboardingGateScreen />;
}
