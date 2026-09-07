// Kulu — saisie du code de validation reçu par SMS (client 2026-09-05).
//
// Kulu est le seul rail Lengopay à demander un aller-retour de plus : l'init
// renvoie requires_otp, l'opérateur envoie un code à l'acheteur, et il faut le
// renvoyer avant que le paiement puisse aboutir.
//
// CE QUE CET ÉCRAN N'ANNONCE JAMAIS : « payé ». Un code accepté veut seulement
// dire que Lengopay l'a reçu ; c'est le sondage qui tranche. On enchaîne donc
// sur la MÊME surface d'attente que tous les autres rails (confirmation de
// commande, fiche de réservation, historique des boosts), qui affichera le
// résultat réel. Dire « c'est payé » ici serait le mensonge d'écran corrigé le
// 2026-08-25 sur le panier.
//
// LIMITE ASSUMÉE : quitter cet écran sans saisir le code laisse l'intention
// expirer en 15 minutes, comme un paiement abandonné. Aucun état « OTP en
// attente » n'est stocké — une colonne pour ça ne se justifierait que si le cas
// devenait fréquent.
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Card } from '../../src/components/primitives/Card';
import { Button } from '../../src/components/primitives/Button';
import { Input } from '../../src/components/primitives/Input';
import { TopBar } from '../../src/components/nav/TopBar';
import { useToast } from '../../src/components/feedback/Toast';
import { useConfirmPaymentOtp } from '../../src/data/queries/payments';
import { toToastMessage } from '../../src/lib/api';

export default function CheckoutOtpRoute() {
  const { payId, orderId, bookingId, boostId } = useLocalSearchParams<{
    payId?: string; orderId?: string; bookingId?: string; boostId?: string;
  }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { show } = useToast();
  const confirm = useConfirmPaymentOtp();
  const [code, setCode] = useState('');

  // Le serveur accepte 3 à 12 caractères (la doc Lengopay ne fixe pas la
  // longueur du code). On borne pareil ici plutôt que d'exiger 6 chiffres :
  // refuser un code valide bloquerait un paiement pour rien.
  const trimmed = code.trim();
  const canSubmit = !!payId && trimmed.length >= 3 && trimmed.length <= 12 && !confirm.isPending;

  /** La surface d'attente propre à l'objet payé — celle qui sonde déjà. */
  const goWait = () => {
    if (boostId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`.
      router.replace({ pathname: '/pro/boost', params: { pending: '1' } } as any);
      return;
    }
    if (bookingId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`.
      router.replace(`/bookings/${bookingId}` as any);
      return;
    }
    if (orderId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-routes regenerate on next `expo start`.
      router.replace(`/checkout/confirm/${orderId}` as any);
      return;
    }
    router.replace('/(tabs)');
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    try {
      await confirm.mutateAsync({ payId: payId as string, code: trimmed });
      // Volontairement « envoyé », pas « payé » — voir l'en-tête.
      show(t('checkout.otpSent'), 'info');
      goWait();
    } catch (e) {
      // Un code faux revient en OTP_REJECTED : l'acheteur doit pouvoir retaper
      // sans quitter l'écran, donc on ne navigue pas. Le message du serveur est
      // déjà en français et dit quoi faire.
      show(toToastMessage(e, t('checkout.otpError')), 'danger');
      setCode('');
    }
  };

  // Sans payId l'écran ne peut rien faire (lien profond bricolé, paramètre
  // perdu). On le dit, plutôt que d'afficher un champ inerte.
  if (!payId) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title={t('checkout.otpTitle')} back />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text variant="bodyM" tone="muted" style={{ textAlign: 'center' }}>
            {t('checkout.otpMissing')}
          </Text>
          <Button
            variant="dark" size="lg" block style={{ marginTop: 24 }}
            label={t('checkout.confirmBackHome')}
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title={t('checkout.otpTitle')} back />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <Card padding={16} style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
            {t('checkout.otpHeading')}
          </Text>
          <Text variant="bodyM" tone="muted" style={{ marginTop: 8, lineHeight: 19 }}>
            {t('checkout.otpBody')}
          </Text>
        </Card>

        <View style={{ marginTop: 16 }}>
          <Input
            label={t('checkout.otpLabel')}
            leadingIcon="shield"
            keyboardType="number-pad"
            autoFocus
            maxLength={12}
            placeholder={t('checkout.otpPlaceholder')}
            value={code}
            onChangeText={setCode}
            helperText={t('checkout.otpHint')}
          />
        </View>

        <Button
          variant="dark"
          size="lg"
          block
          style={{ marginTop: 18 }}
          label={confirm.isPending ? t('checkout.otpSubmitting') : t('checkout.otpSubmit')}
          onPress={() => void onSubmit()}
          disabled={!canSubmit}
          loading={confirm.isPending}
        />

        {/* Sortie honnête : l'acheteur qui n'a pas reçu son code doit pouvoir
            partir sans croire qu'il a payé. L'intention expirera d'elle-même. */}
        <Button
          variant="ghost"
          size="sm"
          block
          style={{ marginTop: 8 }}
          label={t('checkout.otpLater')}
          onPress={goWait}
          disabled={confirm.isPending}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
