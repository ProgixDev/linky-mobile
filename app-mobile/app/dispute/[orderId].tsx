import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Input } from '../../src/components/primitives/Input';
import { Button } from '../../src/components/primitives/Button';
import { ProgressDots } from '../../src/components/primitives/ProgressDots';
import { TopBar } from '../../src/components/nav/TopBar';
import { StickyBottom } from '../../src/components/nav/StickyBottom';
import { I, type IconKey } from '../../src/icons/Icon';
import { useToast } from '../../src/components/feedback/Toast';
import { useOrder, useDisputeOrder, type DisputeReason } from '../../src/data/queries';

interface IssueDef {
  id: DisputeReason;
  t: string;
  icon: IconKey;
}

const ISSUES: IssueDef[] = [
  { id: 'not_received', t: "Je n'ai pas reçu mon article",        icon: 'package' },
  { id: 'wrong',        t: "L'article est différent de l'annonce", icon: 'warn'    },
  { id: 'damaged',      t: "L'article est endommagé",              icon: 'trash'   },
];

export default function DisputeRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { colors, radii } = useTheme();
  const [issue, setIssue] = useState<DisputeReason | null>(null);
  const [description, setDescription] = useState('');
  const { show } = useToast();
  const { data: order } = useOrder(orderId);
  const dispute = useDisputeOrder();
  const canSubmit = !!issue && !!order && !dispute.isPending;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Signaler un problème" back subtitle={`Commande #${orderId}`} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <ProgressDots total={4} current={0} />
        <Text variant="dispL" style={{ fontSize: 20, marginTop: 14, marginBottom: 14 }}>
          Que s'est-il passé ?
        </Text>

        {ISSUES.map((o) => {
          const sel = issue === o.id;
          const Icon = I[o.icon];
          return (
            <Pressable
              key={o.id}
              onPress={() => setIssue(o.id)}
              style={{
                padding: 14,
                borderRadius: radii.lg,
                borderWidth: sel ? 2 : 1,
                borderColor: sel ? colors.danger : colors.border,
                backgroundColor: colors.card,
                marginBottom: 8,
                flexDirection: 'row',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: sel ? 'rgba(209,79,60,0.1)' : colors.bgSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={17} color={sel ? colors.danger : colors.text} />
              </View>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '500' }}>{o.t}</Text>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  backgroundColor: sel ? colors.danger : 'transparent',
                  borderWidth: sel ? 0 : 1.5,
                  borderColor: colors.borderStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {sel && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
              </View>
            </Pressable>
          );
        })}

        <View style={{ marginTop: 16 }}>
          <Input
            label="Décris ce qui s'est passé"
            multiline
            maxLength={500}
            value={description}
            onChangeText={setDescription}
            placeholder="Donne le maximum de détails…"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <Text variant="micro" tone="muted" style={{ textTransform: 'none', letterSpacing: 0, marginBottom: 6 }}>
            Photos (optionnel)
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 10,
                backgroundColor: colors.bgElev,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.borderStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <I.plus size={20} color={colors.textMuted} />
            </View>
          </View>
        </View>
      </ScrollView>
      <StickyBottom>
        <Button
          variant="destructive"
          size="lg"
          block
          disabled={!canSubmit}
          label="Envoyer le signalement"
          onPress={() => {
            if (!issue || !order) return;
            dispute.mutate(
              { orderId: order.id, reason: issue, note: description.trim() || undefined },
              {
                onSuccess: () => {
                  show('Litige signalé', 'success');
                  router.replace('/orders');
                },
              },
            );
          }}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
