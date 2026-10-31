import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { toToastMessage } from '@/shared/lib/api';
import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';
import { AppText, Button, Card, Screen, TextField } from '@/shared/ui';

import {
  formatGnf,
  formatGnPhone,
  isValidGnPhone,
  normalizeGnPhone,
  OPERATORS,
  operatorMismatch,
  parseAmount,
  withdrawalDestination,
  type Operator,
} from '../lib/money';
import { requestWithdrawal } from '../lib/wallet-api';
import { useWalletStore } from '../model/store';

/**
 * Withdraw delivery earnings to Orange Money or MTN Mobile Money. The money is held
 * at once server-side (the request lands in the Linky withdrawals console, paid by
 * Lengopay or by hand), and the courier can cancel it from his wallet until it
 * leaves. Same destination format and operator rules as the Linky app.
 */
export function WithdrawScreen() {
  const wallet = useWalletStore((s) => s.wallet);
  const load = useWalletStore((s) => s.load);
  const balance = wallet?.balance_minor ?? 0;

  const [amountText, setAmountText] = useState('');
  const [operator, setOperator] = useState<Operator>('Orange Money');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!wallet) void load();
  }, [wallet, load]);

  const amount = parseAmount(amountText);
  const tooMuch = amount > balance;
  const mismatch = isValidGnPhone(phone) && operatorMismatch(operator, phone);
  const ready = amount > 0 && !tooMuch && isValidGnPhone(phone) && !mismatch && !sending;

  const submit = async () => {
    if (!ready) return;
    setSending(true);
    try {
      await requestWithdrawal(amount, withdrawalDestination(operator, phone));
      void load();
      Alert.alert(
        'Retrait demandé',
        `${formatGnf(amount)} vont être envoyés sur ton ${operator} (${formatGnPhone(phone)}). Tu peux l’annuler depuis ton portefeuille tant que l’envoi n’a pas commencé.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert('Retrait impossible', toToastMessage(e, 'Réessaie dans un instant.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen testID="withdraw-screen">
      <View className="flex-row items-center gap-3 pb-3 pt-4">
        <Pressable
          testID="withdraw-back"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted"
        >
          <ChevronLeft size={22} color={colors.ink} strokeWidth={2.25} />
        </Pressable>
        <AppText variant="display">Retirer</AppText>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-5 pb-8"
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="caption" testID="withdraw-available">
          Disponible : <AppText variant="label">{formatGnf(balance)}</AppText>
        </AppText>

        <View className="gap-2">
          <AppText variant="label">Montant</AppText>
          <View className="flex-row items-center gap-2">
            <TextField
              testID="withdraw-amount"
              value={amount > 0 ? amount.toLocaleString('fr-FR') : ''}
              onChangeText={(t) => setAmountText(t)}
              keyboardType="number-pad"
              placeholder="0"
              accessibilityLabel="Montant à retirer, en francs guinéens"
            />
            <Button
              testID="withdraw-all"
              label="Tout"
              variant="secondary"
              size="sm"
              disabled={balance <= 0}
              onPress={() => setAmountText(String(balance))}
            />
          </View>
          {tooMuch ? (
            <AppText variant="caption" className="text-danger">
              Ce montant dépasse ton solde ({formatGnf(balance)}).
            </AppText>
          ) : null}
        </View>

        <View className="gap-2">
          <AppText variant="label">Vers</AppText>
          <View className="flex-row gap-2">
            {OPERATORS.map((op) => {
              const on = operator === op.id;
              return (
                <Pressable
                  key={op.id}
                  testID={`withdraw-operator-${op.short}`}
                  onPress={() => setOperator(op.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  className={cn(
                    'h-12 flex-1 items-center justify-center rounded-control border',
                    on ? 'border-brand-600 bg-brand-50' : 'border-ink-faint/30 bg-surface-muted',
                  )}
                >
                  <AppText variant="label" className={on ? 'text-brand-700' : 'text-ink-muted'}>
                    {op.id}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-2">
          <AppText variant="label">
            Numéro {operator === 'Orange Money' ? 'Orange Money' : 'MTN'}
          </AppText>
          <TextField
            testID="withdraw-phone"
            className="flex-none"
            value={formatGnPhone(phone)}
            onChangeText={(t) => setPhone(normalizeGnPhone(t))}
            keyboardType="phone-pad"
            placeholder="6XX XX XX XX"
            accessibilityLabel="Numéro qui recevra l’argent"
          />
          {mismatch ? (
            <AppText variant="caption" className="text-danger">
              Ce numéro n’est pas un numéro {operator === 'Orange Money' ? 'Orange' : 'MTN'} :
              choisis l’autre opérateur ou corrige le numéro.
            </AppText>
          ) : null}
        </View>

        {ready ? (
          <Card className="bg-surface-muted">
            <AppText variant="caption">
              {formatGnf(amount)} vers {operator} · {formatGnPhone(phone)}
            </AppText>
          </Card>
        ) : null}

        <Button
          testID="withdraw-submit"
          label={amount > 0 ? `Retirer ${formatGnf(amount)}` : 'Retirer'}
          disabled={!ready}
          loading={sending}
          onPress={() => void submit()}
        />
      </ScrollView>
    </Screen>
  );
}
