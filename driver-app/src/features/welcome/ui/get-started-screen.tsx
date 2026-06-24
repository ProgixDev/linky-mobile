import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText, Button, LinkyMark, Screen } from '@/shared/ui';

import { useWelcomeStore } from '../model/welcome-store';

/**
 * Get-started — the value-prop hero after the welcome animation: the Linky Driver
 * mark, a one-line pitch, and « Commencer » → marks the welcome seen (once per
 * install) and hands off to the existing OTP sign-in. French, « tu », warm.
 */
export function GetStartedScreen() {
  const markSeen = useWelcomeStore((s) => s.markSeen);

  const onStart = async () => {
    await markSeen();
    router.replace('/sign-in');
  };

  return (
    <Screen testID="get-started-screen">
      <View className="flex-1 justify-between py-8">
        <View className="flex-1 items-center justify-center gap-7">
          <LinkyMark size={136} />
          <View className="items-center gap-3 px-2">
            <AppText variant="display" className="text-center">
              Livre avec Linky
            </AppText>
            <AppText variant="body" className="text-center text-ink-muted">
              Reçois tes courses, scanne le QR du client à la remise et fais-toi payer — une
              livraison simple et sûre, 24h/7.
            </AppText>
          </View>
        </View>
        <Button testID="get-started-cta" label="Commencer" onPress={() => void onStart()} />
      </View>
    </Screen>
  );
}
