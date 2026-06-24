import { WelcomeScreen } from '@/features/welcome';

/**
 * Routes stay THIN. Pre-auth animated welcome (first install only); the welcome
 * gate (use-welcome-gate, wired in _layout) routes here on a fresh install.
 */
export default function WelcomeRoute() {
  return <WelcomeScreen />;
}
