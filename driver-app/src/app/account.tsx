import { AccountScreen } from '@/features/auth';

/**
 * Routes stay THIN. `/account` hosts sign-out + the required in-app account
 * deletion path. Link to it from your app's settings/profile.
 */
export default function AccountRoute() {
  return <AccountScreen />;
}
