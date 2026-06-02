import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CreditCard } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { Chip } from '../../src/components/primitives/Chip';
import { TopBar } from '../../src/components/nav/TopBar';
import { StickyBottom } from '../../src/components/nav/StickyBottom';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { Card } from '../../src/components/primitives/Card';
import { SettingsRow } from '../../src/components/lists/SettingsRow';
import { formatGNF, formatEUR } from '../../src/lib/format';
import { gnfToEur } from '../../src/lib/currency';
import { useRechargeWallet } from '../../src/data/queries';
import { useToast } from '../../src/components/feedback/Toast';
import { useAuth } from '../../src/stores/auth';

const QUICKS = [100_000, 250_000, 500_000, 1_000_000];

export default function RechargerRoute() {
  const { colors, radii } = useTheme();
  const [amount, setAmount] = useState(500_000);
  const [source, setSource] = useState<'orange-money' | 'mtn-money' | 'card'>('orange-money');
  const recharge = useRechargeWallet();
  const { show } = useToast();
  // Diaspora detection: users who signed in via email (vs phone OTP) don't have
  // a Guinean Orange/MTN number, so showing those topup methods is dead-end.
  // V1.1 swap-out: when AuthUser carries `phone`, switch to `!user.phone?.startsWith('+224')`
  // — the channel proxy works correctly during a fresh session but resets to
  // 'phone' default on app restart. See memory project-diaspora-channel-proxy.
  const isDiaspora = useAuth((s) => s.channel === 'email');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Recharger" back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <MicroLabel label="Source" />
        {isDiaspora ? (
          <>
            <Card padding={16} style={{ marginBottom: 10, opacity: 0.85 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: colors.bgSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CreditCard size={22} color={colors.textMuted} strokeWidth={1.75} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                      Mastercard
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        height: 18,
                        borderRadius: 999,
                        backgroundColor: colors.bgSunken,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 }}>
                        BIENTÔT
                      </Text>
                    </View>
                  </View>
                  <Text variant="caption" tone="muted" style={{ marginTop: 4, letterSpacing: 0 }}>
                    Paiement par carte bancaire
                  </Text>
                </View>
              </View>
            </Card>
            <Text variant="caption" tone="muted" style={{ marginBottom: 18, lineHeight: 17 }}>
              Le rechargement par carte bancaire arrive bientôt pour les utilisateurs hors de Guinée. Orange Money et MTN Mobile Money ne sont disponibles qu&apos;avec un numéro Guinéen.
            </Text>
          </>
        ) : (
          <Card padding={0} style={{ overflow: 'hidden', marginBottom: 18 }}>
            <SettingsRow
              icon="phone"
              label="Orange Money"
              sub="+224 622 •• 12 88"
              showChevron={false}
              onPress={() => setSource('orange-money')}
              right={
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: source === 'orange-money' ? colors.primary : 'transparent',
                    borderWidth: source === 'orange-money' ? 0 : 1.5,
                    borderColor: colors.borderStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {source === 'orange-money' && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
                </View>
              }
            />
            <SettingsRow
              icon="phone"
              label="MTN Mobile Money"
              sub="+224 657 •• 44 02"
              showChevron={false}
              onPress={() => setSource('mtn-money')}
              right={
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: source === 'mtn-money' ? colors.primary : 'transparent',
                    borderWidth: source === 'mtn-money' ? 0 : 1.5,
                    borderColor: colors.borderStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {source === 'mtn-money' && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
                </View>
              }
            />
            <SettingsRow
              icon="card"
              label="Carte bancaire"
              sub="Visa •• 4082"
              showChevron={false}
              divider={false}
              onPress={() => setSource('card')}
              right={
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: source === 'card' ? colors.primary : 'transparent',
                    borderWidth: source === 'card' ? 0 : 1.5,
                    borderColor: colors.borderStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {source === 'card' && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
                </View>
              }
            />
          </Card>
        )}

        <MicroLabel label="Montant" />
        <View
          style={{
            backgroundColor: colors.bgElev,
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {formatGNF(amount).replace(' GNF', '')}
            </Text>
            <Text variant="caption" tone="muted" style={{ fontWeight: '600', letterSpacing: 0 }}>
              GNF
            </Text>
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: 4, fontVariant: ['tabular-nums'], letterSpacing: 0 }}>
            {formatEUR(gnfToEur(amount))}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {QUICKS.map((v) => (
            <Chip key={v} label={new Intl.NumberFormat('fr-FR').format(v)} active={v === amount} onPress={() => setAmount(v)} block />
          ))}
        </View>
      </View>

      <StickyBottom>
        <Button
          size="lg"
          block
          disabled={isDiaspora}
          loading={recharge.isPending}
          label={isDiaspora ? 'Bientôt disponible' : `Recharger ${formatGNF(amount)}`}
          onPress={() => {
            if (isDiaspora) {
              show('Le rechargement par carte arrive bientôt', 'info');
              return;
            }
            recharge.mutate(
              { amountGnf: amount, source },
              {
                onSuccess: () => {
                  show('Recharge effectuée', 'success');
                  router.back();
                },
              },
            );
          }}
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
