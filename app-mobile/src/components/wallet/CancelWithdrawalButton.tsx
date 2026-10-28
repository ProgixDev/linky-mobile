import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../primitives/Text';
import { formatGNF } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { toToastMessage } from '../../lib/api';
import { useToast } from '../feedback/Toast';
import { useCancelWithdrawal, type WithdrawalRequestItem } from '../../data/queries/wallet';

// « Annuler » sur un retrait validé (demande du client, 2026-10-28).
//
// Le bouton n'apparaît que si le serveur dit `cancellable` — validée et aucun
// virement parti ni réservé. Mais ce n'est qu'un affichage : si l'admin réserve
// la demande entre le chargement de la liste et l'appui, la base refuse
// (PAYOUT_IN_PROGRESS) et la liste se recharge sans le bouton. C'est cette
// garde-là qui empêche de récupérer un argent déjà envoyé, pas celle-ci.
//
// Partagé par les deux écrans qui listent les retraits : Portefeuille →
// Retraits et l'espace pro « Retraits ».
export function CancelWithdrawalButton({ item }: { item: WithdrawalRequestItem }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { show } = useToast();
  const cancel = useCancelWithdrawal();

  if (!item.cancellable) return null;
  const amount = formatGNF(Number(item.amount_minor));

  const confirm = () => {
    haptic.light();
    Alert.alert(
      t('wallet.cancelWithdrawal.title'),
      t('wallet.cancelWithdrawal.body', { amount }),
      [
        { text: t('wallet.cancelWithdrawal.keep'), style: 'cancel' },
        {
          text: t('wallet.cancelWithdrawal.confirm'),
          style: 'destructive',
          onPress: () =>
            cancel.mutate(item.id, {
              onSuccess: () => {
                haptic.success();
                show(t('wallet.cancelWithdrawal.success', { amount }), 'success');
              },
              onError: (e) => show(toToastMessage(e, t('wallet.cancelWithdrawal.error')), 'danger'),
            }),
        },
      ],
    );
  };

  // Style OBJET : NativeWind ignore `style={({ pressed }) => …}` sur Pressable.
  return (
    <Pressable
      onPress={confirm}
      disabled={cancel.isPending}
      hitSlop={8}
      android_ripple={{ color: 'rgba(209,79,60,0.15)', borderless: false }}
      accessibilityRole="button"
      accessibilityLabel={t('wallet.cancelWithdrawal.a11y', { amount })}
      accessibilityState={{ disabled: cancel.isPending, busy: cancel.isPending }}
      style={{
        minHeight: 30,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: cancel.isPending ? 0.6 : 1,
      }}
    >
      {cancel.isPending ? (
        <ActivityIndicator size="small" color={colors.danger} />
      ) : (
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger, letterSpacing: 0 }}>
          {t('wallet.cancelWithdrawal.cta')}
        </Text>
      )}
    </Pressable>
  );
}
