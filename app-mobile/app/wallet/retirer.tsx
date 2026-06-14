import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { Chip } from '../../src/components/primitives/Chip';
import { TopBar } from '../../src/components/nav/TopBar';
import { StickyBottom } from '../../src/components/nav/StickyBottom';
import { MicroLabel } from '../../src/components/lists/SectionHeader';
import { Card } from '../../src/components/primitives/Card';
import { SettingsRow } from '../../src/components/lists/SettingsRow';
import { formatGNF } from '../../src/lib/format';
import { useToast } from '../../src/components/feedback/Toast';
import { useWithdrawWallet, useWallet } from '../../src/data/queries';
import { toToastMessage } from '../../src/lib/api';

type Operator = 'Orange Money' | 'MTN Mobile Money';

function Radio({ active }: { active: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        backgroundColor: active ? colors.primary : 'transparent',
        borderWidth: active ? 0 : 1.5,
        borderColor: colors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {active && <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#FFFFFF' }} />}
    </View>
  );
}

export default function RetirerRoute() {
  const { colors } = useTheme();
  const [amount, setAmount] = useState(200_000);
  const [operator, setOperator] = useState<Operator>('Orange Money');
  const { show } = useToast();
  const withdraw = useWithdrawWallet();
  const walletQuery = useWallet();
  const walletReady = !walletQuery.isLoading && !walletQuery.isError && !!walletQuery.data;
  const balance = walletQuery.data?.balanceGnf ?? 0;
  const exceedsBalance = walletReady && amount > balance;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Retirer" back />
      <View style={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <MicroLabel label="Vers" />
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: 18 }}>
          <SettingsRow
            icon="phone"
            label="Orange Money"
            sub="Sur ton numéro Orange Money"
            onPress={() => setOperator('Orange Money')}
            right={<Radio active={operator === 'Orange Money'} />}
          />
          <SettingsRow
            icon="phone"
            label="MTN Mobile Money"
            sub="Sur ton numéro MTN"
            divider={false}
            onPress={() => setOperator('MTN Mobile Money')}
            right={<Radio active={operator === 'MTN Mobile Money'} />}
          />
        </Card>

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
          <Text style={{ fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {formatGNF(amount).replace(' GNF', '')}
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 4, letterSpacing: 0 }}>
            GNF
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
          {[100_000, 200_000, 500_000].map((v) => (
            <Chip key={v} label={new Intl.NumberFormat('fr-FR').format(v)} active={v === amount} onPress={() => setAmount(v)} block />
          ))}
        </View>

        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: 14, letterSpacing: 0, color: exceedsBalance ? colors.danger : undefined }}
        >
          {walletReady
            ? exceedsBalance
              ? `Solde insuffisant — disponible : ${formatGNF(balance)}`
              : `Solde disponible : ${formatGNF(balance)}`
            : 'Chargement du solde…'}
        </Text>
      </View>

      <StickyBottom>
        <Button
          size="lg"
          block
          loading={withdraw.isPending}
          disabled={withdraw.isPending || !walletReady || amount <= 0 || exceedsBalance}
          label={`Retirer ${formatGNF(amount)}`}
          onPress={() =>
            withdraw.mutate(
              { amountGnf: amount, destination: operator },
              {
                onSuccess: () => {
                  show('Retrait en cours de traitement', 'info');
                  router.back();
                },
                onError: (e) => show(toToastMessage(e, 'Retrait impossible'), 'danger'),
              },
            )
          }
        />
      </StickyBottom>
    </SafeAreaView>
  );
}
