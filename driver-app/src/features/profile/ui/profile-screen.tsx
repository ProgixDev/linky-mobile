import { EmptyState, Screen } from '@/shared/ui';

/**
 * Profil (right tab) — the courier's editable info + settings.
 * PLACEHOLDER: the real screen (nom/ville/moyen de transport/photo + edit with
 * Zod, the Approuvé badge, sign-out) lands in exec-plan slice 5. Calm branded
 * state until then.
 */
export function ProfileScreen() {
  return (
    <Screen testID="profile-screen">
      <EmptyState
        testID="profile-placeholder"
        title="Profil"
        description="Tes informations de livreur et tes réglages arrivent ici."
      />
    </Screen>
  );
}
