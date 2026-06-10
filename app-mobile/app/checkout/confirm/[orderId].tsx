import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, View, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { Text } from '../../../src/components/primitives/Text';
import { Card } from '../../../src/components/primitives/Card';
import { Button } from '../../../src/components/primitives/Button';
import { TopBar } from '../../../src/components/nav/TopBar';
import { formatGNF } from '../../../src/lib/format';
import { useToast } from '../../../src/components/feedback/Toast';
import { useOrderWithIntent, usePlaceOrder } from '../../../src/data/queries/orders';
import { useCancelPendingPayment } from '../../../src/data/queries/payments';
import type { PaymentMethod } from '../../../src/data/types';

const TTL_MS = 15 * 60 * 1000;
const PHONE_RE = /^\d{9}$/;

// P1 defensive: with the one-query design (useOrderWithIntent returns
// {order, intent} in a single payload), INVALID is structurally impossible
// during normal TanStack refetch. It's still possible during a sub-millisecond
// Postgres commit window between status updates - render a calm spinner rather
// than route away. If it persists > 10s (very unlikely), fall back to /checkout.
const INVALID_PERSISTENCE_TIMEOUT_MS = 10_000;

type StateClass = 'WAIT' | 'SUCCESS' | 'FAIL' | 'EXPIRED' | 'USER_CANCEL' | 'INVALID';
type TerminalState = 'FAIL' | 'EXPIRED' | 'USER_CANCEL';

// N1: hoisted to module scope to avoid recreating on every render.
const TERMINAL_COPY: Record<TerminalState, { title: string; message: string }> = {
  FAIL:        { title: 'Paiement échoué',       message: 'Une erreur est survenue lors du paiement.' },
  EXPIRED:     { title: 'Paiement non confirmé', message: "On n'a pas reçu de confirmation dans les 15 minutes. Aucun débit n'a été effectué." },
  USER_CANCEL: { title: 'Paiement annulé',       message: "Le paiement a été annulé. Aucun débit n'a été effectué." },
};

function classify(orderStatus: string, intentStatus?: string): StateClass {
  if (orderStatus === 'placed'    && intentStatus === 'pending')   return 'WAIT';
  if (orderStatus === 'paid'      && intentStatus === 'completed') return 'SUCCESS';
  if (orderStatus === 'cancelled' && intentStatus === 'failed')    return 'FAIL';
  if (orderStatus === 'cancelled' && intentStatus === 'expired')   return 'EXPIRED';
  if (orderStatus === 'cancelled' && intentStatus === 'cancelled') return 'USER_CANCEL';
  return 'INVALID';
}

function maskPhone(e164: string): string {
  // "+224622551288" -> "+224 622 •• 12 88"
  if (!e164.startsWith('+224') || e164.length !== 13) return e164;
  const local = e164.slice(4);
  return `+224 ${local.slice(0, 3)} •• ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

function formatLocalPhone(digits: string): string {
  // 9 digits -> "6XX XX XX XX"
  const d = digits.padEnd(9).slice(0, 9);
  return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`.trim();
}

export default function CheckoutConfirmRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { colors } = useTheme();
  const { show } = useToast();
  const { data, error, isLoading } = useOrderWithIntent(orderId);
  const cancel = useCancelPendingPayment();
  const place = usePlaceOrder();

  // Modifier UI state.
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhoneDigits, setNewPhoneDigits] = useState('');

  // Live countdown ticker (drives the mm:ss display only - no expiry trigger).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // S1 INVALID persistence tracker. Lives in effects, not render.
  const invalidSinceRef = useRef<number | null>(null);
  const [invalidExpired, setInvalidExpired] = useState(false);

  const order = data?.order;
  const intent = data?.intent ?? null;
  const stateClass: StateClass | null = order && intent ? classify(order.status, intent.status) : null;

  useEffect(() => {
    if (stateClass !== 'INVALID') {
      invalidSinceRef.current = null;
      setInvalidExpired(false);
      return;
    }
    if (invalidSinceRef.current === null) invalidSinceRef.current = Date.now();
    const elapsed = Date.now() - invalidSinceRef.current;
    if (elapsed >= INVALID_PERSISTENCE_TIMEOUT_MS) {
      setInvalidExpired(true);
      return;
    }
    const t = setTimeout(() => setInvalidExpired(true), INVALID_PERSISTENCE_TIMEOUT_MS - elapsed);
    return () => clearTimeout(t);
  }, [stateClass]);

  // S1: ALL router.replace calls live in effects.
  useEffect(() => {
    if (!data || !order) return;
    if (!intent) {
      // Wallet orders shouldn't reach this screen; defensively route to success.
      router.replace(`/checkout/success?orderId=${order.id}`);
      return;
    }
    if (stateClass === 'SUCCESS') {
      router.replace(`/checkout/success?orderId=${order.id}`);
      return;
    }
    if (stateClass === 'INVALID' && invalidExpired) {
      router.replace('/checkout');
    }
  }, [data, intent, stateClass, invalidExpired, order?.id]);

  // M2: error screen.
  if (error) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title="Erreur" back />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text variant="dispL" center style={{ fontSize: 18 }}>Commande introuvable</Text>
          <Text variant="bodyM" tone="muted" center style={{ marginTop: 8 }}>
            Cette commande n'existe pas ou tu n'y as pas accès.
          </Text>
          <Button
            variant="dark" size="lg" block
            style={{ marginTop: 24 }}
            label="Retour à l'accueil"
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      </SafeAreaView>
    );
  }

  // M2 + S1: loading/syncing screen.
  //  - isLoading: TanStack first-fetch
  //  - !data || !order || !intent: pre-effect window (wallet order or intent missing)
  //  - SUCCESS: brief window before the redirect effect fires
  //  - INVALID && !invalidExpired: P1 defensive sync state
  if (isLoading || !data || !order || !intent || stateClass === 'SUCCESS' ||
      (stateClass === 'INVALID' && !invalidExpired)) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title="Suivi du paiement" subtitle={order?.reference ? `#${order.reference}` : undefined} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="bodyM" tone="muted">Synchronisation…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Past this point: stateClass is WAIT | FAIL | EXPIRED | USER_CANCEL.
  // (INVALID-expired routed away via the effect above.)

  // Phase Q — card orders confirm via the Stripe webhook (1-3s typical), not
  // a buyer action on their phone : different WAIT copy, no phone row, no
  // 15-min countdown (stripe intents are excluded from the TTL sweep).
  const isCard = order.paymentMethod === 'card';

  // Countdown for WAIT state.
  const elapsedMs = now - new Date(intent.createdAt).getTime();
  const remainingMs = Math.max(0, TTL_MS - elapsedMs);
  const mm = String(Math.floor(remainingMs / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0');
  const cardSlow = isCard && elapsedMs > 30_000;

  async function handleCancel() {
    try {
      await cancel.mutateAsync({ orderId: order!.id });
      show('Paiement annulé', 'info');
      router.replace('/(tabs)');
    } catch {
      show("Erreur lors de l'annulation", 'danger');
    }
  }

  async function handleModifierConfirm() {
    if (!PHONE_RE.test(newPhoneDigits)) {
      show('Numéro invalide (9 chiffres après +224)', 'danger');
      return;
    }
    const newPhone = `+224${newPhoneDigits}`;
    try {
      await cancel.mutateAsync({ orderId: order!.id });
      const result = await place.mutateAsync({
        productId:     order!.productId,
        quantity:      order!.quantity,
        paymentMethod: order!.paymentMethod as PaymentMethod,
        payerPhone:    newPhone,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-router typed-routes regenerate on next `expo start`; route exists on disk.
      router.replace(`/checkout/confirm/${result.order.id}` as any);
    } catch {
      show("Erreur lors du changement de numéro", 'danger');
    }
  }

  // N2: only clear digits on the false→true transition.
  function openModifier() {
    if (!editingPhone) setNewPhoneDigits('');
    setEditingPhone(true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WAIT state
  // ─────────────────────────────────────────────────────────────────────────
  if (stateClass === 'WAIT') {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar title="Suivi du paiement" back subtitle={`#${order.reference}`} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          <Card padding={16} style={{ marginTop: 12 }}>
            <Row label="Méthode" value={isCard ? 'Carte bancaire' : order.paymentMethod === 'orange-money' ? 'Orange Money' : 'MTN Mobile Money'} />
            {!isCard && (
            <Row
              label="Numéro"
              value={editingPhone ? '' : (intent.payerPhone ? maskPhone(intent.payerPhone) : '—')}
              right={
                !editingPhone ? (
                  <Pressable onPress={openModifier} hitSlop={6}>
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Modifier</Text>
                  </Pressable>
                ) : undefined
              }
            />
            )}
            {!isCard && editingPhone && (
              <View style={{ marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: colors.bgSunken }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>+224</Text>
                  <TextInput
                    keyboardType="number-pad"
                    maxLength={9}
                    value={newPhoneDigits}
                    onChangeText={(t) => setNewPhoneDigits(t.replace(/\D/g, '').slice(0, 9))}
                    placeholder="6XX XX XX XX"
                    placeholderTextColor={colors.textFaint}
                    style={{
                      flex: 1, fontSize: 14, fontVariant: ['tabular-nums'],
                      color: colors.text, paddingVertical: 6,
                    }}
                  />
                </View>
                <Text variant="micro" tone="muted" style={{ marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>
                  Affiché : +224 {formatLocalPhone(newPhoneDigits)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Pressable
                    onPress={() => setEditingPhone(false)}
                    style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 13, color: colors.text }}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleModifierConfirm}
                    disabled={!PHONE_RE.test(newPhoneDigits) || cancel.isPending || place.isPending}
                    style={{
                      flex: 1, height: 40, borderRadius: 10,
                      backgroundColor: PHONE_RE.test(newPhoneDigits) ? colors.primary : colors.bgSunken,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Confirmer</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <Row label="Montant" value={formatGNF(order.totalGnf)} />
          </Card>

          {isCard ? (
            <Card padding={16} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
                ⏳  Confirmation en cours…
              </Text>
              <Text variant="bodyM" tone="muted" style={{ textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
                Ta banque confirme le paiement de{' '}
                <Text style={{ color: colors.text, fontWeight: '700' }}>{formatGNF(order.totalGnf)}</Text>
                {' '}— ça prend quelques secondes.
              </Text>
              {cardSlow && (
                <Text variant="bodyM" tone="muted" style={{ textAlign: 'center', marginTop: 12, lineHeight: 19 }}>
                  C'est plus long que prévu. Pas d'inquiétude : la commande se mettra à jour automatiquement dès que la confirmation arrive.
                </Text>
              )}
            </Card>
          ) : (
          <Card padding={16} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
              ⏳  Vérifie ton téléphone
            </Text>
            <Text variant="bodyM" tone="muted" style={{ textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
              Suis les instructions sur ton téléphone — accepte le paiement de{' '}
              <Text style={{ color: colors.text, fontWeight: '700' }}>{formatGNF(order.totalGnf)}</Text>
              {' '}pour confirmer.
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 16, fontVariant: ['tabular-nums'] }}>
              ⏱  Temps restant : <Text style={{ color: colors.text, fontWeight: '700' }}>{mm}:{ss}</Text>
            </Text>
          </Card>
          )}

          <Button
            variant="ghost"
            size="sm"
            block
            style={{ marginTop: 18 }}
            label={cancel.isPending ? 'Annulation…' : 'Annuler le paiement'}
            onPress={handleCancel}
            disabled={cancel.isPending}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Terminal states (FAIL / EXPIRED / USER_CANCEL)
  // ─────────────────────────────────────────────────────────────────────────
  const copy = TERMINAL_COPY[stateClass as TerminalState];
  const failMessage = stateClass === 'FAIL' && intent.lastErrorMessage ? intent.lastErrorMessage : copy.message;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar title="Suivi du paiement" back subtitle={`#${order.reference}`} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <Card padding={20} style={{ marginTop: 18, backgroundColor: 'rgba(209,79,60,0.06)', borderColor: 'rgba(209,79,60,0.2)' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.danger }}>
            ❌  {copy.title}
          </Text>
          <Text variant="bodyM" tone="muted" style={{ marginTop: 8, lineHeight: 19 }}>
            {failMessage}
          </Text>
        </Card>
        <Button
          variant="dark"
          size="lg"
          block
          style={{ marginTop: 18 }}
          label="Recommencer"
          onPress={() => router.replace('/checkout')}
        />
        <Button
          variant="ghost"
          size="sm"
          block
          style={{ marginTop: 8 }}
          label="Continuer mes achats"
          onPress={() => router.replace('/(tabs)')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, right }: { label: string; value: string; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}>
      <Text variant="bodyM" tone="muted" style={{ flex: 1 }}>{label}</Text>
      {value && <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] }}>{value}</Text>}
      {right}
    </View>
  );
}
