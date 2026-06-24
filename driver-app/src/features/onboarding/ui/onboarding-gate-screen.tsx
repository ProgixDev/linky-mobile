import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/shared/theme/colors';
import { AppText, Button, EmptyState, Screen } from '@/shared/ui';

import { useOnboardingStore } from '../model/store';
import { ApplicationFormScreen } from './application-form-screen';
import { PendingScreen } from './pending-screen';
import { RejectedScreen } from './rejected-screen';

/**
 * The onboarding route’s single screen: renders the right step of the approval gate from
 * the store. The livreur gate (use-livreur-gate) keeps APPROVED couriers out of here and
 * routes them to the deliveries home; everyone else lands on the form / pending /
 * rejection / loading state below.
 */
export function OnboardingGateScreen() {
  const phase = useOnboardingStore((s) => s.phase);
  const appStatus = useOnboardingStore((s) => s.appStatus);
  const refresh = useOnboardingStore((s) => s.refresh);

  // Safety net: if we reached here before the app-level gate fetched the status, fetch it.
  useEffect(() => {
    if (phase === 'unknown') void refresh();
  }, [phase, refresh]);

  if (phase === 'unknown' || phase === 'loading') {
    return (
      <Screen testID="onboarding-loading">
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator color={colors.brand600} />
          <AppText variant="caption" className="text-ink-muted">
            Vérification de ton statut…
          </AppText>
        </View>
      </Screen>
    );
  }

  if (phase === 'error') {
    return (
      <Screen testID="onboarding-gate-error">
        <EmptyState
          title="Connexion impossible"
          description="Impossible de vérifier ta candidature. Vérifie ta connexion et réessaie."
          action={
            <Button
              testID="onboarding-gate-retry"
              label="Réessayer"
              onPress={() => void refresh()}
            />
          }
        />
      </Screen>
    );
  }

  switch (appStatus) {
    case 'rejected':
      return <RejectedScreen />;
    case 'pending':
      return <PendingScreen />;
    case 'none':
      return <ApplicationFormScreen />;
    default:
      // `approved` (or null mid-transition) — the gate is about to route to the home.
      return (
        <Screen testID="onboarding-loading">
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.brand600} />
          </View>
        </Screen>
      );
  }
}
