import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { makeId } from '@/shared/lib/id';
import { colors } from '@/shared/theme/colors';
import { AppText, Button, Card, EmptyState, Screen, Skeleton } from '@/shared/ui';

import { confirmHandoff, getDelivery } from '../lib/deliveries-api';
import { parseOrderQr } from '../lib/qr';
import { type DeliveryDetail } from '../model/schema';
import { useDeliveriesStore } from '../model/store';
import { QrScanner } from './qr-scanner';

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Assignée',
  in_transit: 'En cours',
  delivered: 'Livrée',
};

function formatGnf(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} GNF`;
}

// The handoff flow as an explicit state machine: view detail → scan → review →
// confirm → success/error. A scan never releases money on its own (AC-3); only the
// Confirm tap in `review` calls the server, and the server is the sole authority on
// the token, assignment, and idempotency (AC-9). Failure phases are honest and
// recoverable: `mismatch` (wrong/forged QR, nothing released — AC-5), `already_done`
// (AC-8), `offline` (online-only money action, keeps the token to retry — AC-7).
type Phase =
  | { kind: 'loading' }
  | { kind: 'load_error' }
  | { kind: 'detail' }
  | { kind: 'scanning' }
  | { kind: 'review'; scanToken: string; idemKey: string }
  | { kind: 'confirming'; scanToken: string; idemKey: string }
  | { kind: 'success'; orderStatus: string }
  | { kind: 'mismatch' }
  | { kind: 'already_done' }
  | { kind: 'offline'; scanToken: string; idemKey: string }
  | { kind: 'error'; message: string };

type Action =
  | { type: 'load_error' }
  | { type: 'show_detail' }
  | { type: 'scan' }
  | { type: 'review'; scanToken: string; idemKey: string }
  | { type: 'confirming'; scanToken: string; idemKey: string }
  | { type: 'success'; orderStatus: string }
  | { type: 'mismatch' }
  | { type: 'already_done' }
  | { type: 'offline'; scanToken: string; idemKey: string }
  | { type: 'error'; message: string };

function reducer(_state: Phase, action: Action): Phase {
  switch (action.type) {
    case 'load_error':
      return { kind: 'load_error' };
    case 'show_detail':
      return { kind: 'detail' };
    case 'scan':
      return { kind: 'scanning' };
    case 'review':
      return { kind: 'review', scanToken: action.scanToken, idemKey: action.idemKey };
    case 'confirming':
      return { kind: 'confirming', scanToken: action.scanToken, idemKey: action.idemKey };
    case 'success':
      return { kind: 'success', orderStatus: action.orderStatus };
    case 'mismatch':
      return { kind: 'mismatch' };
    case 'already_done':
      return { kind: 'already_done' };
    case 'offline':
      return { kind: 'offline', scanToken: action.scanToken, idemKey: action.idemKey };
    case 'error':
      return { kind: 'error', message: action.message };
  }
}

export function DeliveryDetailScreen({ id }: { id: string }) {
  const [phase, dispatch] = useReducer(reducer, { kind: 'loading' });
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const removeDelivery = useDeliveriesStore((s) => s.removeDelivery);
  const refreshList = useDeliveriesStore((s) => s.refresh);
  // Synchronous single-flight guard: a money action must fire exactly once even if a
  // double-tap lands before the 'confirming' re-render disables the button (review P1).
  const submitting = useRef(false);

  const loadDetail = useCallback(async () => {
    try {
      const d = await getDelivery(id);
      setDetail(d);
      dispatch({ type: 'show_detail' });
    } catch {
      dispatch({ type: 'load_error' });
    }
  }, [id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  // A scan is parsed + compared to THIS delivery's order before anything else; a
  // junk/forged QR or one for a different order is rejected client-side (AC-5). A
  // valid match only advances to `review` — confirm is a separate explicit tap.
  const onScanned = useCallback(
    (raw: string) => {
      const parsed = parseOrderQr(raw);
      if (!parsed || !detail || parsed.orderId !== detail.orderId) {
        dispatch({ type: 'mismatch' });
        return;
      }
      // Mint the idempotency key ONCE per handoff (at scan time) so an offline retry
      // replays the same money action instead of minting a new key each attempt (review P2).
      dispatch({ type: 'review', scanToken: parsed.scanToken, idemKey: makeId() });
    },
    [detail],
  );

  const onConfirm = useCallback(
    async (scanToken: string, idemKey: string) => {
      if (!detail || submitting.current) return;
      submitting.current = true;
      dispatch({ type: 'confirming', scanToken, idemKey });
      const outcome = await confirmHandoff({
        orderId: detail.orderId,
        scanToken,
        idempotencyKey: idemKey,
      });
      submitting.current = false;
      switch (outcome.kind) {
        case 'success':
          // Delivered → drop it from the active list immediately, then reconcile with a
          // background refresh of the worklist (AC-4).
          removeDelivery(detail.id);
          void refreshList();
          dispatch({ type: 'success', orderStatus: outcome.orderStatus });
          break;
        case 'mismatch':
          dispatch({ type: 'mismatch' });
          break;
        case 'already_done':
          dispatch({ type: 'already_done' });
          break;
        case 'offline':
          dispatch({ type: 'offline', scanToken, idemKey });
          break;
        case 'error':
          dispatch({ type: 'error', message: outcome.message });
          break;
      }
    },
    [detail, removeDelivery, refreshList],
  );

  if (phase.kind === 'loading') {
    return (
      <Screen testID="delivery-detail-screen">
        <View className="gap-3 pt-4" testID="delivery-detail-loading">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-56" />
        </View>
      </Screen>
    );
  }

  if (phase.kind === 'load_error' || !detail) {
    return (
      <Screen testID="delivery-detail-screen">
        <EmptyState
          testID="delivery-detail-load-error"
          title="Impossible de charger cette livraison"
          description="Vérifie ta connexion et réessaie."
          action={
            <Button
              testID="delivery-detail-load-retry"
              label="Réessayer"
              onPress={() => void loadDetail()}
            />
          }
        />
      </Screen>
    );
  }

  if (phase.kind === 'scanning') {
    return <QrScanner onScanned={onScanned} onCancel={() => dispatch({ type: 'show_detail' })} />;
  }

  if (phase.kind === 'success') {
    return (
      <Screen testID="delivery-detail-screen">
        <EmptyState
          testID="delivery-detail-success"
          title="Livraison confirmée ✅"
          description={`La commande ${detail.orderRef} est confirmée livrée et le paiement du vendeur a été libéré.`}
          action={
            <Button testID="delivery-detail-done" label="Terminé" onPress={() => router.back()} />
          }
        />
      </Screen>
    );
  }

  const area =
    [detail.addressCity, detail.addressDistrict].filter(Boolean).join(' · ') || 'Zone indisponible';

  return (
    <Screen testID="delivery-detail-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-8 pt-4">
        <Card className="flex-row gap-3" testID="delivery-detail">
          <Image
            source={detail.itemPhoto ? { uri: detail.itemPhoto } : undefined}
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              backgroundColor: colors.surfaceMuted,
            }}
            contentFit="cover"
            transition={150}
            accessibilityLabel={detail.itemTitle || 'Article à livrer'}
            accessibilityIgnoresInvertColors
          />
          <View className="flex-1 gap-0.5">
            <AppText variant="caption" className="text-ink-muted" testID="delivery-detail-ref">
              {detail.orderRef}
            </AppText>
            <AppText variant="label" numberOfLines={2} testID="delivery-detail-item">
              {detail.itemTitle || 'Article'}
            </AppText>
            <AppText variant="caption" testID="delivery-detail-amount">
              {formatGnf(detail.amountGnf)}
            </AppText>
          </View>
        </Card>

        <View className="gap-1">
          <AppText variant="caption" className="text-ink-muted">
            Client
          </AppText>
          <AppText variant="body" testID="delivery-detail-buyer">
            {detail.buyerName}
          </AppText>
        </View>

        <View className="gap-1">
          <AppText variant="caption" className="text-ink-muted">
            Adresse de livraison
          </AppText>
          {/* Detail reveals the FULL street address, unlike the list (spec 001 AC-10). */}
          <AppText variant="body" testID="delivery-detail-address">
            {[detail.addressDetails, area].filter(Boolean).join('\n')}
          </AppText>
        </View>

        <View className="flex-row items-center gap-2">
          <AppText variant="caption" className="text-ink-muted">
            Statut
          </AppText>
          <AppText variant="caption" testID="delivery-detail-status">
            {STATUS_LABEL[detail.status] ?? detail.status}
          </AppText>
        </View>

        {phase.kind === 'mismatch' ? (
          <Card className="gap-3 bg-surface-muted" testID="delivery-detail-mismatch">
            <AppText variant="body">
              Ce QR code ne correspond pas à cette livraison. Rien n’a été libéré — scanne à nouveau
              le QR de la commande du client.
            </AppText>
            <Button
              testID="delivery-detail-mismatch-rescan"
              label="Scanner à nouveau"
              onPress={() => dispatch({ type: 'scan' })}
            />
          </Card>
        ) : null}

        {phase.kind === 'already_done' ? (
          <Card className="gap-3 bg-surface-muted" testID="delivery-detail-already-done">
            <AppText variant="body">
              Cette livraison est déjà terminée — son paiement a été libéré. Rien n’a été libéré à
              nouveau.
            </AppText>
            <Button
              testID="delivery-detail-already-done-back"
              label="Retour aux livraisons"
              onPress={() => router.back()}
            />
          </Card>
        ) : null}

        {phase.kind === 'error' ? (
          <Card className="gap-3 bg-surface-muted" testID="delivery-detail-error">
            <AppText variant="body">{phase.message || 'Une erreur est survenue.'}</AppText>
            <Button
              testID="delivery-detail-error-rescan"
              label="Scanner à nouveau"
              onPress={() => dispatch({ type: 'scan' })}
            />
          </Card>
        ) : null}

        {phase.kind === 'offline' ? (
          <Card className="gap-3 bg-surface-muted" testID="delivery-detail-offline">
            <AppText variant="body">
              Tu es hors ligne. Confirmer libère le paiement, une connexion est donc requise —
              reconnecte-toi et réessaie.
            </AppText>
            <Button
              testID="delivery-detail-offline-retry"
              label="Réessayer"
              onPress={() => void onConfirm(phase.scanToken, phase.idemKey)}
            />
          </Card>
        ) : null}

        {phase.kind === 'review' ? (
          <Card className="gap-3" testID="delivery-detail-review">
            <AppText variant="title">Confirmer cette remise ?</AppText>
            <AppText variant="body">
              Confirmer marque la commande {detail.orderRef} comme livrée et libère le paiement du
              vendeur. C’est irréversible.
            </AppText>
            <Button
              testID="delivery-detail-confirm-button"
              label="Confirmer la livraison"
              onPress={() => void onConfirm(phase.scanToken, phase.idemKey)}
            />
            <Button
              testID="delivery-detail-rescan"
              variant="ghost"
              label="Rescanner"
              onPress={() => dispatch({ type: 'scan' })}
            />
          </Card>
        ) : phase.kind === 'confirming' ? (
          // Same Card chrome as `review` so the highest-stakes transition (the money tap)
          // doesn't shift the layout; the Confirm button just swaps to a disabled loader.
          <Card className="gap-3" testID="delivery-detail-confirming">
            <AppText variant="title">Confirmer cette remise ?</AppText>
            <AppText variant="body">
              Confirmer marque la commande {detail.orderRef} comme livrée et libère le paiement du
              vendeur. C’est irréversible.
            </AppText>
            <Button
              testID="delivery-detail-confirm-button"
              label="Confirmation…"
              loading
              disabled
              onPress={() => {}}
            />
          </Card>
        ) : phase.kind === 'detail' ? (
          <Button
            testID="delivery-detail-scan-button"
            label="Scanner la livraison"
            onPress={() => dispatch({ type: 'scan' })}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
