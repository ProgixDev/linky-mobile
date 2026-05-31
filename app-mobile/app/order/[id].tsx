import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Card } from '../../src/components/primitives/Card';
import { Button } from '../../src/components/primitives/Button';
import { HoldToConfirmButton } from '../../src/components/primitives/HoldToConfirmButton';
import { TrustStrip } from '../../src/components/primitives/TrustStrip';
import { TopBar } from '../../src/components/nav/TopBar';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { I } from '../../src/icons/Icon';
import { formatGNF } from '../../src/lib/format';
import { useOrder, useConfirmReception } from '../../src/data/queries';
import { useToast } from '../../src/components/feedback/Toast';

const STAGES = [
  { key: 'placed', t: 'Commande passée' },
  { key: 'paid', t: 'Paiement reçu en séquestre' },
  { key: 'preparing', t: 'En cours de remise' },
  { key: 'released', t: 'Réception confirmée' },
];

export default function OrderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data: order } = useOrder(id);
  const confirm = useConfirmReception();
  const { show } = useToast();

  if (!order) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const currentStageIdx = STAGES.findIndex((s) => s.key === order.status);
  const idx = currentStageIdx === -1 ? 2 : currentStageIdx;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Suivi de commande" back subtitle={`#${order.reference}`} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <Card padding={12}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Image
              source={order.productSnapshot.photo}
              style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.bgSunken }}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={2}>
                {order.productSnapshot.title}
              </Text>
              <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                Qté {order.quantity}
              </Text>
            </View>
            <Text style={{ fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] }}>
              {formatGNF(order.productSnapshot.priceGnf)}
            </Text>
          </View>
        </Card>

        <View style={{ marginTop: 18 }}>
          <MicroLabel label="Statut du séquestre" />
          <Card padding={16}>
            {STAGES.map((s, i, arr) => {
              const done = i < idx;
              const current = i === idx;
              const action = i === arr.length - 1 && !done && !current;
              return (
                <View key={s.key} style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        backgroundColor: done || current ? colors.primary : action ? colors.accent : colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: current ? colors.primary : 'transparent',
                        shadowOpacity: current ? 0.3 : 0,
                        shadowRadius: 0,
                      }}
                    >
                      {(done || current) && <I.check size={12} color="#FFFFFF" stroke={3} />}
                    </View>
                    {i < arr.length - 1 && (
                      <View style={{ width: 2, flex: 1, backgroundColor: i < idx ? colors.primary : colors.border, marginTop: 2, minHeight: 30 }} />
                    )}
                  </View>
                  <View style={{ flex: 1, paddingBottom: i < arr.length - 1 ? 22 : 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: done || current || action ? colors.text : colors.textMuted }}>
                      {s.t}
                    </Text>
                    <Text variant="micro" tone="muted" style={{ marginTop: 2, letterSpacing: 0, textTransform: 'none' }}>
                      {order.events[i]?.label === s.t
                        ? new Date(order.events[i]!.at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : action
                          ? 'Action requise dès remise'
                          : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </View>

        {(order.status === 'paid' || order.status === 'delivered') && (
          <>
            <View style={{ marginTop: 16 }}>
              <TrustStrip tone="accent">
                <Text style={{ color: colors.accentText, fontSize: 11.5 }}>
                  Une fois que tu confirmes, le paiement est libéré vers le vendeur.{' '}
                  <Text style={{ fontWeight: '700' }}>Cette action est irréversible.</Text>
                </Text>
              </TrustStrip>
            </View>

            <View style={{ marginTop: 18 }}>
              <HoldToConfirmButton
                onConfirm={() => {
                  confirm.mutate(order.id, {
                    onSuccess: () => show('Paiement libéré au vendeur', 'success'),
                  });
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                block
                style={{ marginTop: 8 }}
                label="Signaler un problème"
                leading={<I.warn size={14} color={colors.danger} />}
                onPress={() => router.push(`/dispute/${order.id}`)}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
