import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ArrowRight, CreditCard, Phone } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button, IconButton } from '../../src/components/primitives/Button';
import { useAuth } from '../../src/stores/auth';
import { haptic } from '../../src/lib/haptics';

type Channel = 'phone' | 'email';

interface Option {
  id: Channel;
  title: string;
  sub: string;
  Icon: LucideIcon;
}

const OPTIONS: Option[] = [
  { id: 'phone', title: 'Je suis en Guinée', sub: 'Téléphone & Mobile Money', Icon: Phone },
  { id: 'email', title: "Je suis à l'étranger", sub: 'Email & Carte bancaire', Icon: CreditCard },
];

export default function AuthChoiceRoute() {
  const { colors, radii } = useTheme();
  const setChannel = useAuth((s) => s.setChannel);
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  // Returning users arrive with ?mode=login — the flow is the same passwordless
  // entry, but the copy reflects sign-in rather than sign-up.
  const isLogin = mode === 'login';
  const [choice, setChoice] = useState<Channel>('phone');

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <View style={{ paddingTop: 4 }}>
          <IconButton
            variant="secondary"
            size={44}
            onPress={() => router.back()}
            accessibilityLabel="Retour"
            style={{ marginLeft: -4 }}
          >
            <ArrowLeft size={20} color={colors.text} strokeWidth={2.25} />
          </IconButton>
        </View>

        <View style={{ marginTop: 40 }}>
          <Text style={{ fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6, color: colors.text }}>
            {isLogin ? 'Te reconnecter' : 'Tu es où ?'}
          </Text>
          <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
            {isLogin
              ? 'Choisis comment tu t’es inscrit·e pour recevoir ton code.'
              : 'On adapte le paiement selon ta région.'}
          </Text>
        </View>

        <View style={{ marginTop: 40, gap: 12 }}>
          {OPTIONS.map((opt) => {
            const selected = choice === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  haptic.selection();
                  setChoice(opt.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{
                  paddingVertical: 22,
                  paddingHorizontal: 20,
                  borderRadius: radii.lg,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? colors.text : colors.border,
                  backgroundColor: colors.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: selected ? colors.text : colors.bgSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <opt.Icon
                    size={22}
                    color={selected ? colors.bg : colors.text}
                    strokeWidth={2.25}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{opt.title}</Text>
                  <Text style={{ marginTop: 2, fontSize: 13, color: colors.textMuted }}>{opt.sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 'auto', paddingBottom: 8 }}>
          <Button
            variant="dark"
            size="lg"
            block
            label={isLogin ? 'Se connecter' : 'Continuer'}
            trailing={<ArrowRight size={18} color="#FFFFFF" strokeWidth={2.5} />}
            onPress={() => {
              haptic.medium();
              setChannel(choice);
              router.push(choice === 'phone' ? '/(onboarding)/phone' : '/(onboarding)/email');
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
