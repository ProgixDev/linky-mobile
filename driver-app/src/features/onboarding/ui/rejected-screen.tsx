import { View } from 'react-native';

import { AppText, Button, Card, Screen } from '@/shared/ui';

import { useOnboardingStore } from '../model/store';

/**
 * Rejection screen — shows the admin’s `reject_reason` and offers « Refaire une demande »,
 * which sends the courier back to a fresh application form (never a dead end).
 */
export function RejectedScreen() {
  const rejectReason = useOnboardingStore((s) => s.rejectReason);
  const reapply = useOnboardingStore((s) => s.reapply);

  return (
    <Screen testID="onboarding-rejected">
      <View className="flex-1 justify-center gap-4">
        <View className="gap-1">
          <AppText variant="display">Candidature refusée</AppText>
          <AppText variant="body" className="text-ink-muted">
            Ta demande pour devenir livreur n’a pas été retenue cette fois.
          </AppText>
        </View>

        <Card className="gap-1 bg-surface-muted">
          <AppText variant="caption" className="text-ink-muted">
            Motif
          </AppText>
          <AppText variant="body" testID="onboarding-reject-reason">
            {rejectReason?.trim() || 'Aucun motif précisé.'}
          </AppText>
        </Card>

        <Button testID="onboarding-reapply" label="Refaire une demande" onPress={() => reapply()} />
      </View>
    </Screen>
  );
}
