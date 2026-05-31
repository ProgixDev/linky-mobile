import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { ScreenHeader } from '../../../src/components/nav/ScreenHeader';
import { haptic } from '../../../src/lib/haptics';
import { useOrder, useConfirmReception } from '../../../src/data/queries';
import { useToast } from '../../../src/components/feedback/Toast';
import { formatGNF } from '../../../src/lib/format';

export default function ConfirmReceiptRoute() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [confirmed, setConfirmed] = useState(false);
  const { data: order } = useOrder(id);
  const confirm = useConfirmReception();
  const { show } = useToast();
  if (!order) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const canRelease =
    confirmed &&
    (order.status === 'paid' || order.status === 'delivered') &&
    !confirm.isPending;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <ScreenHeader
          title="Confirmer la réception"
          subtitle="Une fois confirmé, le paiement est libéré au vendeur."
        />

        {/* Product card */}
        <View style={{ paddingHorizontal: 24 }}>
          <View
            style={{
              padding: 14,
              borderRadius: 18,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <Image
              source={order.productSnapshot.photo}
              style={{
                width: 64,
                height: 64,
                borderRadius: 12,
                backgroundColor: colors.bgSunken,
              }}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.5 }}>
                {order.reference}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: colors.text,
                  marginTop: 2,
                  letterSpacing: 0,
                  lineHeight: 18,
                  includeFontPadding: false,
                }}
                numberOfLines={2}
              >
                {order.productSnapshot.title}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.text,
                  marginTop: 4,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatGNF(order.totalGnf)}
              </Text>
            </View>
          </View>
        </View>

        {/* Big confirmation card */}
        <View style={{ paddingHorizontal: 24, paddingTop: 22 }}>
          <Pressable
            onPress={() => {
              haptic.selection();
              setConfirmed(!confirmed);
            }}
            style={{
              padding: 18,
              borderRadius: 22,
              backgroundColor: confirmed ? colors.primarySoft : colors.card,
              borderWidth: confirmed ? 2 : 1,
              borderColor: confirmed ? colors.primary : colors.border,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                backgroundColor: confirmed ? colors.primary : colors.bgSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2
                size={32}
                color={confirmed ? '#FFFFFF' : colors.textMuted}
                strokeWidth={2}
              />
            </View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: '700',
                color: colors.text,
                marginTop: 14,
                letterSpacing: 0,
                lineHeight: 20,
                includeFontPadding: false,
                textAlign: 'center',
              }}
            >
              J'ai bien reçu mon article
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                marginTop: 6,
                textAlign: 'center',
                lineHeight: 18,
                letterSpacing: 0,
                maxWidth: 280,
              }}
            >
              Tout est conforme à la description. Le paiement de{' '}
              <Text style={{ fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }}>
                {formatGNF(order.amountGnf)}
              </Text>{' '}
              sera libéré au vendeur.
            </Text>
          </Pressable>
        </View>

        {/* Trust */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <View
            style={{
              padding: 14,
              borderRadius: 16,
              backgroundColor: colors.bgSunken,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <ShieldCheck size={14} color={colors.primary} strokeWidth={2} style={{ marginTop: 1 }} />
            <Text
              style={{
                flex: 1,
                fontSize: 12.5,
                color: colors.textMuted,
                lineHeight: 18,
                letterSpacing: 0,
              }}
            >
              Tu as 48 h pour confirmer ou ouvrir un litige. Sans action, le paiement est libéré automatiquement.
            </Text>
          </View>
        </View>

        {/* Problem CTA */}
        <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
          <Pressable
            onPress={() => {
              haptic.light();
              router.push(`/dispute/${order.id}`);
            }}
            style={{
              padding: 14,
              borderRadius: 16,
              backgroundColor: 'rgba(209,79,60,0.06)',
              borderWidth: 1,
              borderColor: 'rgba(209,79,60,0.18)',
              flexDirection: 'row',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: 'rgba(209,79,60,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={15} color={colors.danger} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.danger,
                  letterSpacing: 0,
                  lineHeight: 17,
                  includeFontPadding: false,
                }}
              >
                Il y a un problème
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.danger,
                  marginTop: 2,
                  opacity: 0.75,
                  letterSpacing: 0,
                  lineHeight: 16,
                }}
              >
                Article non conforme, endommagé ou non reçu.
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <SafeAreaView
        edges={['bottom']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 8,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          disabled={!canRelease}
          onPress={() => {
            haptic.medium();
            confirm.mutate(order.id, {
              onSuccess: () => {
                show('Réception confirmée 🎉', 'success');
                router.replace('/orders');
              },
            });
          }}
          style={{
            height: 56,
            borderRadius: 16,
            backgroundColor: canRelease ? colors.text : colors.bgSunken,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canRelease ? 1 : 0.6,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: canRelease ? colors.bg : colors.textFaint,
              lineHeight: 18,
              includeFontPadding: false,
            }}
          >
            Libérer le paiement
          </Text>
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}
