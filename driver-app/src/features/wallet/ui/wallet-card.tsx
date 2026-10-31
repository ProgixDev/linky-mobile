import { router, useFocusEffect, type Href } from 'expo-router';
import { ChevronRight, Wallet as WalletIcon } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';

import { colors } from '@/shared/theme/colors';
import { AppText, Skeleton } from '@/shared/ui';

import { formatGnf } from '../lib/money';
import { useWalletStore } from '../model/store';

/**
 * The wallet on the courier's home (client 2026-10-31 : « add a wallet on the home
 * page like Linky to able deliver men to withdraw their delivery money »). Balance
 * at a glance, « Retirer » one tap away; the card itself opens the full wallet.
 * Reloads on every focus, so it is current after a delivery or a withdrawal.
 */
export function WalletCard() {
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
  const failed = !wallet && status === 'error';

  return (
    <Pressable
      testID="wallet-card"
      onPress={() => router.push('/wallet' as Href)}
      accessibilityRole="button"
      accessibilityLabel={
        wallet ? `Mon portefeuille : ${formatGnf(balance)} disponibles` : 'Mon portefeuille'
      }
      className="mb-3 rounded-card bg-brand-600 p-4 active:opacity-95"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <WalletIcon size={16} color={colors.accent} strokeWidth={2.25} />
          <AppText variant="caption" className="text-ink-inverse/80">
            Mon portefeuille
          </AppText>
        </View>
        <ChevronRight size={18} color={colors.inkInverse} strokeWidth={2} />
      </View>

      <View className="mt-2 flex-row items-end justify-between gap-3">
        <View className="flex-1">
          {firstLoad ? (
            <Skeleton className="h-8 w-40 bg-ink-inverse/20" />
          ) : failed ? (
            <AppText variant="body" className="text-ink-inverse">
              Solde indisponible — touche pour réessayer
            </AppText>
          ) : (
            <AppText
              testID="wallet-card-balance"
              variant="display"
              className="text-ink-inverse"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatGnf(balance)}
            </AppText>
          )}
          <AppText variant="caption" className="text-ink-inverse/70">
            Gains de livraison, disponibles pour retrait
          </AppText>
        </View>

        <Pressable
          testID="wallet-card-withdraw"
          onPress={() => router.push('/wallet/withdraw' as Href)}
          disabled={balance <= 0}
          accessibilityRole="button"
          accessibilityLabel="Retirer"
          accessibilityState={{ disabled: balance <= 0 }}
          hitSlop={6}
          className={
            balance > 0
              ? 'h-10 justify-center rounded-full bg-accent px-4 active:opacity-90'
              : 'h-10 justify-center rounded-full bg-ink-inverse/15 px-4'
          }
        >
          <AppText
            variant="label"
            className={balance > 0 ? 'font-sans-semibold text-ink' : 'text-ink-inverse/60'}
          >
            Retirer
          </AppText>
        </Pressable>
      </View>
    </Pressable>
  );
}
