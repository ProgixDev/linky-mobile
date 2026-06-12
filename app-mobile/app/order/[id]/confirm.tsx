import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Card } from '../../../src/components/primitives/Card';
import { Button } from '../../../src/components/primitives/Button';
import { HoldToConfirmButton } from '../../../src/components/primitives/HoldToConfirmButton';
import { TrustStrip } from '../../../src/components/primitives/TrustStrip';
import { TopBar } from '../../../src/components/nav/TopBar';
import { I } from '../../../src/icons/Icon';
import { formatGNF } from '../../../src/lib/format';
import { useOrder, useConfirmReception } from '../../../src/data/queries';
import { useToast } from '../../../src/components/feedback/Toast';
import { useAuth } from '../../../src/stores/auth';

// Phase V.3c — strict UUID check on the token query param. The previous
// falsy `if (!token)` accepted ANY truthy string and also let a
// duplicate-query-param array slip through (useLocalSearchParams returns
// string | string[] | undefined per param). Narrowing to typeof === 'string'
// + UUID format rejects '?token=&token=evil' tampering at the client edge
// before the server-side INVALID_SCAN_TOKEN gate fires.
const SCAN_TOKEN_RE = /^[0-9a-f-]{36}$/i;

export default function OrderConfirmRoute() {
  // typedRoutes doesn't model query params on dynamic routes — cast to read
  // `token` alongside `id`. The token comes from the scanner (or a deep-link
  // tap) and is the QR-gate secret; without it we render the "scan required"
  // state instead of letting the buyer hold-confirm.
  const params = useLocalSearchParams() as { id?: string; token?: string | string[] };
  const id = params.id;
  const rawToken = params.token;
  const token = typeof rawToken === 'string' && SCAN_TOKEN_RE.test(rawToken) ? rawToken : undefined;
  const { colors } = useTheme();
  const { data: order, isLoading } = useOrder(id);
  const confirm = useConfirmReception();
  const { show } = useToast();
  const meId = useAuth((s) => s.user?.id ?? s.authUserId);

  if (isLoading || !order) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const isBuyer = !!meId && meId === order.buyerId;

  if (!isBuyer) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title="Confirmation" back />
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <I.warn size={36} color={colors.danger} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center' }}>
            Action non autorisée
          </Text>
          <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
            Seul l&apos;acheteur de cette commande peut confirmer la réception.
          </Text>
          <Button
            variant="primary"
            block
            label="Retour à l'accueil"
            onPress={() => router.replace('/(tabs)')}
            style={{ marginTop: 8 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Missing token → can't confirm. The buyer arrived here without scanning
  // (deep-link tampering, manual nav, or shared old URL). Show a clear scan-
  // required state with a CTA that opens the camera; don't render the hold
  // button. This is the client-side defense-in-depth before the server-side
  // INVALID_SCAN_TOKEN gate fires.
  if (!token) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title="Confirmer la réception" back subtitle={`#${order.reference}`} />
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 18 }}>
          <I.qr size={44} color={colors.primary} />
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
            Scanne le QR du colis
          </Text>
          <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 }}>
            Pour confirmer cette commande, scanne le QR code collé sur le colis avec l&apos;app. Cela garantit que tu as bien reçu ta commande.
          </Text>
          <Button
            variant="primary"
            block
            label="Scanner le QR"
            leading={<I.qr size={16} color="#FFFFFF" />}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- /scan typedRoute regenerates next start
            onPress={() => router.replace('/scan' as any)}
            style={{ marginTop: 4 }}
          />
          <Button
            variant="ghost"
            size="sm"
            block
            label="Signaler un problème"
            leading={<I.warn size={14} color={colors.danger} />}
            onPress={() => router.push(`/dispute/${order.id}`)}
          />
        </View>
      </SafeAreaView>
    );
  }

  const inHandoffWindow = order.status === 'paid' || order.status === 'delivered';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Confirmer la réception" back subtitle={`#${order.reference}`} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <Card padding={12}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Image
              source={order.productSnapshot.photo}
              style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.bgSunken }}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600' }} numberOfLines={2}>
                {order.productSnapshot.title}
              </Text>
              <Text variant="micro" tone="muted" style={{ letterSpacing: 0, textTransform: 'none' }}>
                Qté {order.quantity}
              </Text>
            </View>
            <Text style={{ fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] }}>
              {formatGNF(order.productSnapshot.priceGnf)}
            </Text>
          </View>
        </Card>

        {inHandoffWindow ? (
          <>
            <View style={{ marginTop: 16 }}>
              <TrustStrip tone="accent">
                <Text style={{ color: colors.accentText, fontSize: 11.5 }}>
                  Maintiens 5 secondes pour confirmer. Le paiement sera libéré vers le vendeur.{' '}
                  <Text style={{ fontWeight: '700' }}>Cette action est irréversible.</Text>
                </Text>
              </TrustStrip>
            </View>

            <View style={{ marginTop: 18 }}>
              <HoldToConfirmButton
                onConfirm={() => {
                  confirm.mutate(
                    { orderId: order.id, scanToken: token },
                    {
                      onSuccess: () => {
                        show('Paiement libéré au vendeur', 'success');
                        router.replace(`/order/${order.id}`);
                      },
                      onError: (e) => {
                        const msg = (e as { message_fr?: string; message?: string }).message_fr
                          ?? (e as { message?: string }).message
                          ?? 'Erreur de confirmation';
                        show(msg, 'danger');
                      },
                    },
                  );
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                block
                style={{ marginTop: 8 }}
                label="Signaler un problème"
                leading={<I.warn size={14} color={colors.danger} />}
                onPress={() => router.push(`/dispute/${order.id}`)}
              />
            </View>
          </>
        ) : (
          <View style={{ marginTop: 18 }}>
            <Card padding={20}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 }}>
                Confirmation indisponible
              </Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 19 }}>
                Cette commande n&apos;est pas en attente de confirmation. Ouvre le suivi pour voir
                son statut actuel.
              </Text>
              <Button
                variant="secondary"
                block
                label="Voir le suivi"
                onPress={() => router.replace(`/order/${order.id}`)}
                style={{ marginTop: 14 }}
              />
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
