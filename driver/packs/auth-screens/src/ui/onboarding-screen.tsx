import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Screen } from '@/shared/ui';

import { useOnboardingStore } from '../onboarding-store';

/** Edit per app — the steps your onboarding actually has. */
const STEPS = [
  { key: 'welcome', title: 'Welcome', body: 'A quick tour to set things up.' },
  { key: 'goal', title: 'Your goal', body: 'Tell us what you want to achieve.' },
  { key: 'ready', title: 'You’re ready', body: 'Let’s go.' },
];

/** DESIGN: replace after the Claude Design pass. Functional placeholder carousel. */
export function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const [i, setI] = useState(0);
  const complete = useOnboardingStore((s) => s.complete);
  const step = STEPS[i];

  const next = () => {
    if (i < STEPS.length - 1) {
      setI(i + 1);
    } else {
      complete();
      onDone?.();
    }
  };

  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <AppText variant="caption">
          {i + 1} / {STEPS.length}
        </AppText>
        <AppText variant="display">{step?.title}</AppText>
        <AppText variant="body">{step?.body}</AppText>
        <Button
          testID="onboarding-next"
          label={i < STEPS.length - 1 ? 'Next' : 'Get started'}
          onPress={next}
        />
      </View>
    </Screen>
  );
}
