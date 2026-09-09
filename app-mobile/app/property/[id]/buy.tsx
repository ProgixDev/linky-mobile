// Buyer purchase request — vente/terrain, one-time payment (client 2026-08-31:
// « active payment for vente ET terrain aussi »). No dates, no period : the
// full price once. Mirrors book.tsx's price-recap pattern but far simpler —
// there's nothing to schedule. La visite prealable, obligatoire jusqu'au
// 2026-09-09, a ete retiree cote client ET serveur : l'acheteur convient d'un
// rendez-vous physique par le chat, hors machine a etats.
import { useBuyerGate } from '../../../src/components/feedback/BuyerGate';
import { useState } from 'react';
import { Platform, ScrollView, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Button } from '../../../src/components/primitives/Button';
import { TopBar } from '../../../src/components/nav/TopBar';
import { StickyBottom } from '../../../src/components/nav/StickyBottom';
import { MicroLabel } from '../../../src/components/lists/SectionHeader';
import { TrustStrip } from '../../../src/components/primitives/TrustStrip';
import { DetailStateScreen } from '../../../src/components/feedback/DetailState';
import { useProperty, useRequestBooking } from '../../../src/data/queries';
import { useToast } from '../../../src/components/feedback/Toast';
import { toToastMessage } from '../../../src/lib/api';
import { platformFeeGnf, priceWithFeeGnf } from '../../../src/lib/fees';
import { formatGNF } from '../../../src/lib/format';
import { haptic } from '../../../src/lib/haptics';

export default function BuyPropertyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, radii } = useTheme();
  const { data: prop, isLoading, isError, refetch } = useProperty(id);
  const request = useRequestBooking();
  const { show } = useToast();
  const { requireBuyer } = useBuyerGate();

  const [note, setNote] = useState('');

  if (isLoading || isError || !prop) {
    return <DetailStateScreen loading={isLoading} title="Acheter" onRetry={() => void refetch()} />;
  }
  if (prop.type === 'location') {
    // Garde miroir de la garde serveur (NOT_A_RENTAL) — pas cense arriver
    // depuis l'UI, qui ne propose ce bouton que pour vente/terrain.
    return <DetailStateScreen loading={false} title="Acheter" onRetry={() => router.back()} />;
  }

  const price = prop.priceGnf;
  const total = price + platformFeeGnf(price);

  const submit = () => {
    if (request.isPending) return;
    // Filet pour l'arrivee directe sur cet ecran (lien profond, retour arriere).
    if (!requireBuyer()) return;
    haptic.medium();
    request.mutate(
      {
        propertyId: prop.id,
        period: 'sale',
        // Formalite : le serveur exige une date, elle ne sert a rien planifier
        // pour un achat (pas de sejour, pas de bail).
        startDate: new Date().toISOString().slice(0, 10),
        note,
      },
      {
        onSuccess: () => {
          show('Demande d\'achat envoyée au propriétaire ✅', 'success');
          router.replace('/bookings' as never);
        },
        onError: (e) => {
          show(toToastMessage(e, "Impossible d'envoyer la demande."), 'danger');
        },
      },
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Acheter ce bien" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 16 }}
        >
          <View style={{ padding: 14, borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{prop.title}</Text>
            <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
              {/* Prix ACHETEUR : la fiche d'ou vient l'utilisateur l'affiche deja frais
                  compris — le montrer brut ici ferait BAISSER le prix de 5 %
                  d'un ecran a l'autre. */}
              {[prop.district, prop.city].filter(Boolean).join(', ')} · {formatGNF(priceWithFeeGnf(price))}
            </Text>
          </View>

          <View>
            <MicroLabel label="Message au propriétaire (optionnel)" />
            <TextInput
              value={note}
              onChangeText={(t) => setNote(t.slice(0, 500))}
              placeholder="Présentez-vous en quelques mots…"
              placeholderTextColor={colors.textFaint}
              multiline
              style={{
                minHeight: 80,
                padding: 12,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                color: colors.text,
                fontSize: 14,
                textAlignVertical: 'top',
              }}
            />
          </View>

          <View style={{ padding: 14, borderRadius: radii.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 8 }}>
            {/* COMMISSION COMPRISE, PLUS DE LIGNE SEPAREE (client 2026-09-09) :
                le prix affiche ici est celui de l'annonce, pas le prix vendeur
                suivi d'un supplement. Exact par construction — `total` vient du
                meme calcul que le serveur. */}
            <RecapRow label="Prix du bien (frais inclus)" value={formatGNF(total)} />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <RecapRow label="Total à payer à la signature" value={formatGNF(total)} bold />
          </View>

          <TrustStrip tone="primary">
            <Text style={{ color: colors.primaryDeep, fontSize: 11.5 }}>
              <Text style={{ fontWeight: '700' }}>Paiement sécurisé. </Text>
              Ton argent reste en séquestre jusqu'à la confirmation de la remise du bien. Contacte le propriétaire pour visiter le bien avant de t'engager.
            </Text>
          </TrustStrip>
        </ScrollView>

        <StickyBottom>
          <Button
            size="lg"
            block
            label={`Envoyer la demande d'achat · ${formatGNF(total)}`}
            disabled={request.isPending}
            loading={request.isPending}
            onPress={submit}
          />
        </StickyBottom>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RecapRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: 13, color: bold ? colors.text : colors.textMuted, fontWeight: bold ? '700' : '500', letterSpacing: 0 }}>
        {label}
      </Text>
      <Text style={{ fontSize: bold ? 15 : 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}
