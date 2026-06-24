import { RefreshControl, ScrollView } from 'react-native';

import { AppText, Card, Screen } from '@/shared/ui';

import { useOnboardingStore } from '../model/store';

/**
 * « Candidature en cours d’examen » — read-only while an admin reviews. Pull to refresh
 * re-checks the gate; when the admin approves, the next check returns `approved` and the
 * livreur gate routes through to the deliveries home automatically.
 */
export function PendingScreen() {
  const refresh = useOnboardingStore((s) => s.refresh);
  const phase = useOnboardingStore((s) => s.phase);

  return (
    <Screen testID="onboarding-pending">
      <ScrollView
        contentContainerClassName="grow justify-center gap-4 px-2"
        refreshControl={
          <RefreshControl refreshing={phase === 'loading'} onRefresh={() => void refresh()} />
        }
        showsVerticalScrollIndicator={false}
      >
        <Card className="items-center gap-3 bg-accent-soft">
          <AppText variant="display" className="text-center">
            ⏳
          </AppText>
          <AppText variant="title" className="text-center">
            Candidature en cours d’examen
          </AppText>
          <AppText variant="body" className="text-center text-ink-muted">
            Merci ! Ta demande pour devenir livreur Linky a bien été reçue. Un administrateur la
            vérifie — tu seras notifié dès qu’elle est validée.
          </AppText>
          <AppText variant="caption" className="text-center text-ink-faint">
            Tire vers le bas pour actualiser.
          </AppText>
        </Card>
      </ScrollView>
    </Screen>
  );
}
