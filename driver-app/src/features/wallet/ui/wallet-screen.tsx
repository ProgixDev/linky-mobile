import { router, useFocusEffect, type Href } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { toToastMessage } from '@/shared/lib/api';
import { cn } from '@/shared/lib/cn';
import { colors } from '@/shared/theme/colors';
import { AppText, Button, Card, EmptyState, Screen, Skeleton } from '@/shared/ui';

import { formatGnf } from '../lib/money';
import { cancelWithdrawal } from '../lib/wallet-api';
import type { WalletEntry, Withdrawal, WithdrawalStatus } from '../model/schema';
import { useWalletStore } from '../model/store';

const STATUS_LABEL: Record<WithdrawalStatus, string> = {
  pending: 'En attente',
  approved: 'Envoi en cours',
  paid: 'Payé',
  rejected: 'Refusé',
  cancelled: 'Annulé',
};

const STATUS_TONE: Record<WithdrawalStatus, string> = {
  pending: 'bg-accent-soft text-ink',
  approved: 'bg-accent-soft text-ink',
  paid: 'bg-brand-50 text-brand-700',
  rejected: 'bg-danger/10 text-danger',
  cancelled: 'bg-surface-muted text-ink-muted',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString(
    'fr-FR',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

/** What a ledger line means for the courier, in his words. */
function entryLabel(e: WalletEntry): string {
  switch (e.ref_type) {
    case 'livreur_delivery_fee':
      return e.order_reference ? `Livraison ${e.order_reference}` : 'Livraison';
    case 'withdrawal_hold':
      return 'Retrait demandé';
    case 'withdrawal_release':
      return 'Retrait annulé — montant rendu';
    case 'withdrawal_payout':
      return 'Retrait versé';
    default:
      return 'Mouvement';
  }
}

function WithdrawalRow({ w, onCancelled }: { w: Withdrawal; onCancelled: () => void }) {
  const [busy, setBusy] = useState(false);
  const cancel = () => {
    Alert.alert(
      'Annuler ce retrait ?',
      `${formatGnf(w.amount_minor)} reviendront tout de suite sur ton solde.`,
      [
        { text: 'Non, garder', style: 'cancel' },
        {
          text: 'Annuler le retrait',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            cancelWithdrawal(w.id)
              .then(onCancelled)
              .catch((e: unknown) =>
                Alert.alert(
                  'Annulation impossible',
                  toToastMessage(e, 'Réessaie dans un instant.'),
                ),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };
  return (
    <Card testID={`withdrawal-${w.id}`} className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <AppText variant="title">{formatGnf(w.amount_minor)}</AppText>
        <View className={cn('rounded-full px-2.5 py-1', STATUS_TONE[w.status])}>
          <AppText variant="caption" className={cn('font-sans-medium', STATUS_TONE[w.status])}>
            {STATUS_LABEL[w.status]}
          </AppText>
        </View>
      </View>
      {w.destination ? <AppText variant="caption">{w.destination}</AppText> : null}
      {w.status === 'rejected' && w.reason ? (
        <AppText variant="caption" className="text-danger">
          {w.reason}
        </AppText>
      ) : null}
      <View className="flex-row items-center justify-between">
        <AppText variant="caption">{formatWhen(w.created_at)}</AppText>
        {w.cancellable ? (
          <Button
            testID={`withdrawal-cancel-${w.id}`}
            label="Annuler"
            variant="ghost"
            size="sm"
            loading={busy}
            onPress={cancel}
          />
        ) : null}
      </View>
    </Card>
  );
}

function EntryRow({ e }: { e: WalletEntry }) {
  const credit = e.direction === 'credit';
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-ink-faint/10 py-3">
      <View className="flex-1 gap-0.5">
        <AppText variant="label" numberOfLines={1}>
          {entryLabel(e)}
        </AppText>
        <AppText variant="caption">{formatWhen(e.created_at)}</AppText>
      </View>
      <AppText
        variant="label"
        className={cn('font-sans-semibold', credit ? 'text-success' : 'text-ink')}
      >
        {credit ? '+' : '−'} {formatGnf(e.amount_minor)}
      </AppText>
    </View>
  );
}

/**
 * The courier's wallet: what he can withdraw, his withdrawals (cancellable while
 * the money has not left), and where the money came from. Delivery fees land here
 * when he confirms a handoff (100 % of the order's delivery fee, paid-in-app orders
 * only — cash-on-delivery fees are already in his hand).
 */
export function WalletScreen() {
  const wallet = useWalletStore((s) => s.wallet);
  const status = useWalletStore((s) => s.status);
  const load = useWalletStore((s) => s.load);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const balance = wallet?.balance_minor ?? 0;
  const firstLoad = !wallet && (status === 'idle' || status === 'loading');

  return (
    <Screen testID="wallet-screen">
      <View className="flex-row items-center gap-3 pb-3 pt-4">
        <Pressable
          testID="wallet-back"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted"
        >
          <ChevronLeft size={22} color={colors.ink} strokeWidth={2.25} />
        </Pressable>
        <AppText variant="display">Mon portefeuille</AppText>
      </View>

      {firstLoad ? (
        <View className="gap-3 pt-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-20 w-full" />
        </View>
      ) : !wallet ? (
        <EmptyState
          testID="wallet-error"
          title="Impossible de charger ton portefeuille"
          description="Vérifie ta connexion et réessaie."
          action={<Button testID="wallet-retry" label="Réessayer" onPress={() => void load()} />}
        />
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={status === 'refreshing'} onRefresh={() => void load()} />
          }
          contentContainerClassName="gap-4 pb-8"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-1 rounded-card bg-brand-600 p-5">
            <AppText variant="caption" className="text-ink-inverse/80">
              Disponible pour retrait
            </AppText>
            <AppText testID="wallet-balance" variant="display" className="text-ink-inverse">
              {formatGnf(balance)}
            </AppText>
            <AppText variant="caption" className="text-ink-inverse/70">
              Tes frais de livraison arrivent ici dès que tu valides la remise d’un colis payé dans
              l’application.
            </AppText>
            <Button
              testID="wallet-withdraw"
              label="Retirer"
              variant="secondary"
              className="mt-3"
              disabled={balance <= 0}
              onPress={() => router.push('/wallet/withdraw' as Href)}
            />
          </View>

          {wallet.withdrawals.length > 0 ? (
            <View className="gap-3">
              <AppText variant="title">Mes retraits</AppText>
              {wallet.withdrawals.map((w) => (
                <WithdrawalRow key={w.id} w={w} onCancelled={() => void load()} />
              ))}
            </View>
          ) : null}

          <View>
            <AppText variant="title">Historique</AppText>
            {wallet.entries.length === 0 ? (
              <EmptyState
                testID="wallet-empty"
                title="Aucun gain pour l’instant"
                description="Les frais de chaque livraison arriveront ici dès ta première remise confirmée."
              />
            ) : (
              wallet.entries.map((e) => <EntryRow key={e.id} e={e} />)
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}
