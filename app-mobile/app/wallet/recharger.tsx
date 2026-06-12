// Phase X.4 -- honest collapse.
//
// Pre-X4 this screen offered Orange Money / MTN Mobile Money / Carte
// bancaire pickers and quick-amount chips, then on tap called
// useRechargeWallet -> /wallet-topup-intent which only INSERTed a pending
// topup_intents row. **No money ever credited the wallet** : the Lengopay
// rail that would normally trigger confirm_topup is contract-blocked, and
// no Stripe card-topup path exists (Stripe is wired only at checkout
// today). The "Recharge effectuée" success toast was a lie ; the user
// went back to wallet with the same balance.
//
// Two design choices the prompt allowed :
//   (a) Build a Stripe card-topup end-to-end. Honest sizing was ~5 medium
//       pieces (schema migration + new fn + webhook branch + mobile flow
//       + stale-PI sweep) -- genuinely L-effort, not S. Tracked as a V1.1
//       item in linky-mobile/PHASE_K_V1_1_BACKLOG.md.
//   (b) Make the screen honest and point users to the working path.
//
// X.4 picks (b). Card payments ALREADY WORK at checkout today (Stripe TEST
// mode, the same 4242 card that powers the order rail), so the framing
// matches reality : "no balance needed -- pay by card at checkout."
//
// Demo wallets are seeded via the existing confirm_topup RPC (the SQL is
// documented in SMOKE_MATRIX_2026-06-12.md so the smoke run can demo a
// wallet-funded purchase without needing the Lengopay rail).
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Smartphone, ShoppingBag, CreditCard } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { Text } from '../../src/components/primitives/Text';
import { Button } from '../../src/components/primitives/Button';
import { TopBar } from '../../src/components/nav/TopBar';
import { Card } from '../../src/components/primitives/Card';

export default function RechargerRoute() {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Recharger" back />
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 14 }}>
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: colors.accentSoft,
            marginBottom: 4,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.accentText,
              letterSpacing: 0.6,
            }}
          >
            BIENTÔT DISPONIBLE
          </Text>
        </View>
        <Text variant="dispL" style={{ fontSize: 24, lineHeight: 30 }}>
          Recharge par Mobile Money
        </Text>
        <Text variant="bodyM" tone="muted" style={{ lineHeight: 21 }}>
          La recharge depuis ton compte Orange Money ou MTN Mobile Money arrive
          à l'activation du contrat Linky&nbsp;×&nbsp;Lengopay. On te préviendra
          dès que c'est prêt.
        </Text>

        <Card padding={14} style={{ marginTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CreditCard size={18} color={colors.primary} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="titleM" style={{ fontSize: 14 }}>
                En attendant
              </Text>
              <Text
                variant="micro"
                tone="muted"
                style={{
                  letterSpacing: 0,
                  textTransform: 'none',
                  marginTop: 4,
                  lineHeight: 18,
                }}
              >
                Tu peux payer par carte directement au moment de l'achat —
                pas besoin de solde Linky pour acheter.
              </Text>
            </View>
          </View>
        </Card>

        <Card padding={14}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: colors.bgSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Smartphone size={18} color={colors.textMuted} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="titleM" style={{ fontSize: 14 }}>
                À l'activation du contrat
              </Text>
              <Text
                variant="micro"
                tone="muted"
                style={{
                  letterSpacing: 0,
                  textTransform: 'none',
                  marginTop: 4,
                  lineHeight: 18,
                }}
              >
                Tu pourras créditer ton solde Linky depuis Orange Money ou
                MTN MoMo en quelques taps, puis l'utiliser pour payer ou
                envoyer.
              </Text>
            </View>
          </View>
        </Card>

        <View style={{ marginTop: 18 }}>
          <Button
            variant="dark"
            size="lg"
            block
            label="Voir le marché"
            leading={<ShoppingBag size={16} color={colors.bg} strokeWidth={2.25} />}
            onPress={() => router.replace('/(tabs)/marche')}
          />
          <Button
            variant="ghost"
            size="sm"
            block
            label="Retour au portefeuille"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/wallet'))}
            style={{ marginTop: 6 }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
