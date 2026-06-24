import { useAuthStore } from '@/features/auth';
import { ProfileScreen } from '@/features/profile';

/**
 * Profil (right tab) — driver info + settings. Routes stay THIN; auth sign-out is
 * injected so the profile feature stays free of a cross-feature import.
 */
export default function ProfilRoute() {
  const signOut = useAuthStore((s) => s.signOut);
  return <ProfileScreen onSignOut={() => void signOut()} />;
}
