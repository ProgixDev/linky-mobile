import { GetStartedScreen } from '@/features/welcome';

/**
 * Routes stay THIN. The get-started value-prop screen; « Commencer » marks the
 * welcome seen and hands off to /sign-in.
 */
export default function GetStartedRoute() {
  return <GetStartedScreen />;
}
