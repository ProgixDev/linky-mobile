import { useAuthStore } from '@/features/auth';
import { ProfileScreen } from '@/features/profile';

/**
 * Profil (right tab) — driver info + settings. Routes stay THIN; auth sign-out + the
 * avatar (read + update via update-profile) are injected so the profile feature stays
 * free of a cross-feature import.
 */
export default function ProfilRoute() {
  const signOut = useAuthStore((s) => s.signOut);
  const avatarUrl = useAuthStore((s) => s.user?.avatar_url ?? null);
  return (
    <ProfileScreen
      onSignOut={() => void signOut()}
      avatarUrl={avatarUrl}
      onChangeAvatar={(url) => {
        void useAuthStore.getState().updateProfile({ avatar_url: url });
      }}
    />
  );
}
