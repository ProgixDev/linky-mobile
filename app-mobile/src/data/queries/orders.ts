// Wired to live edge functions: place-order / get-order / list-my-orders /
// confirm-receipt / dispute-order. All authed — list/get use the JWT to scope
// to the caller (buyer; participant for get). H2 escrow lifecycle is live:
// place_order debits the buyer's wallet into escrow, confirm-receipt splits
// the escrow (amount → seller, fees → platform), dispute-order parks the
// order at status='disputed' pending admin resolution (Phase K).
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Order, OrderStatus, PaymentIntent, PaymentMethod } from '../types';

interface Cursor {
  created_at: string;
  id: string;
}

export interface MyOrdersFilters {
  status?: OrderStatus;
}

export function useMyOrders(filters: MyOrdersFilters = {}) {
  return useQuery({
    queryKey: ['my-orders', filters],
    queryFn: async (): Promise<Order[]> => {
      const { orders } = await apiPost<{ orders: Order[]; next_cursor: Cursor | null }>({
        path: '/list-my-orders',
        body: { status: filters.status },
      });
      return orders;
    },
  });
}

export function useMyOrdersInfinite(filters: MyOrdersFilters = {}) {
  const query = useInfiniteQuery({
    queryKey: ['my-orders-infinite', filters],
    initialPageParam: undefined as Cursor | undefined,
    queryFn: async ({ pageParam }: { pageParam: Cursor | undefined }) =>
      apiPost<{ orders: Order[]; next_cursor: Cursor | null }>({
        path: '/list-my-orders',
        body: { status: filters.status, cursor: pageParam },
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
  const orders = query.data?.pages.flatMap((p) => p.orders) ?? [];
  return { ...query, orders };
}

export const useOrders = useMyOrders;

// Seller-side mirror of useMyOrders. Backend filters by JWT-derived seller_id
// (per project_list_seller_orders_scan_token_defense): never spoof-able from
// the body. The mapped rows include scanToken — the seller UI prints the QR
// strip on each card from this list to bypass a second round-trip.
export function useSellerOrders(filters: MyOrdersFilters = {}) {
  return useQuery({
    queryKey: ['seller-orders', filters],
    queryFn: async (): Promise<Order[]> => {
      const { orders } = await apiPost<{ orders: Order[]; next_cursor: Cursor | null }>({
        path: '/list-seller-orders',
        body: { status: filters.status },
      });
      return orders;
    },
  });
}

interface OrderEnvelope {
  order: Order;
  intent: PaymentIntent | null;
}

// /get-order now returns BOTH the order and its latest payment_intent (null
// for wallet orders). useOrder uses TanStack `select` to project just the
// order so the existing 4 callers (dispute, success, order detail,
// confirm-receipt) stay backward-compat. useOrderWithIntent shares the same
// queryKey + cache, so the confirmation screen and other screens reading the
// same orderId issue ONE HTTP call per polling cycle (not two).
async function fetchOrderEnvelope(id: string | undefined): Promise<OrderEnvelope> {
  return apiPost<OrderEnvelope>({ path: '/get-order', body: { id } });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    enabled: !!id,
    queryFn: () => fetchOrderEnvelope(id),
    select: (env) => env.order,
    // Phase U.6 — live dispute banner. The OrderResolutionBanner only
    // updates when useOrder refetches ; pre-U6 a buyer staring at the
    // detail screen at the moment of resolution saw nothing until they
    // navigated back or pulled to refresh. Cheap fix : poll the order
    // envelope every 20s while it's actively contested. No interval on
    // terminal states (released / refunded / cancelled / paid /
    // delivered / preparing / placed) so the typical case is unaffected
    // and the 3G bill stays flat. Payload is tiny.
    refetchInterval: (query) => {
      const env = query.state.data;
      return env?.order?.status === 'disputed' ? 20_000 : false;
    },
    refetchIntervalInBackground: false,
  });
}

/** Buyer courier-tracking poll — same ['order', id] cache as useOrder, but refetches
 *  the envelope every 12s WHILE the delivery is en route (assigned/in_transit) so the
 *  live driver position on the tracking map keeps moving. Stops on any terminal state. */
export function useOrderTracking(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    enabled: !!id,
    queryFn: () => fetchOrderEnvelope(id),
    select: (env) => env.order,
    refetchInterval: (query) => {
      const s = query.state.data?.order?.delivery?.status;
      return s === 'assigned' || s === 'in_transit' ? 12_000 : false;
    },
    refetchIntervalInBackground: false,
  });
}

/** Confirmation-screen hook. Same query+cache as useOrder; returns both pieces. */
export function useOrderWithIntent(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    enabled: !!id,
    queryFn: () => fetchOrderEnvelope(id),
    refetchOnWindowFocus: true,
    // Stripe confirmations land via webhook in ~1-3s — poll a pending stripe
    // intent at 2s so the buyer sees « payé » fast ; everything else stays at
    // the 5s Lengopay cadence.
    refetchInterval: (query) => {
      const env = query.state.data;
      return env?.intent?.rail === 'stripe' && env.intent.status === 'pending' ? 2000 : 5000;
    },
    refetchIntervalInBackground: false,
  });
}

export interface PlaceOrderInput {
  /** Every article of the cart — all from the SAME shop (client 2026-08-05).
   *  The server re-checks that rule and recomputes every amount itself. */
  items: { productId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  /** Mode de réception (2026-07-30). 'delivery' facture le frais forfaitaire
   *  Linky ; 'pickup' est gratuit. Omis → 'delivery' côté serveur. */
  deliveryMode?: 'pickup' | 'delivery';
  /** Optional Q6 override; omit to use the user's primary phone from /phones. */
  payerPhone?: string;
}

export interface PlaceOrderResult {
  order: Order;
  intent?: PaymentIntent; // present for rail methods, absent for wallet
  /** Stripe payment-sheet bundle — present only for paymentMethod 'card'. */
  payment?: { client_secret: string; publishable_key: string };
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      items,
      paymentMethod,
      deliveryMode,
      payerPhone,
    }: PlaceOrderInput): Promise<PlaceOrderResult> => {
      return apiPost<PlaceOrderResult>({
        path: '/place-order',
        body: {
          items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
          payment_method: paymentMethod,
          ...(deliveryMode ? { delivery_mode: deliveryMode } : {}),
          ...(payerPhone ? { payer_phone: payerPhone } : {}),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      // Phase U.3 — DO NOT clear the cart here. Order creation precedes
      // payment for both the card rail (Stripe payment sheet) and the
      // mobile-money rail (cron poll / Lengopay webhook flips status to
      // 'paid' later). Clearing at creation meant a sheet cancel or rail
      // failure left the buyer at /checkout with an empty cart and no
      // way to retry. Callers now clear at the moment the order is
      // actually paid (wallet branch in app/checkout/index.tsx,
      // SUCCESS state in app/checkout/confirm/[orderId].tsx).
    },
  });
}

// ─── Panier multi-boutiques : UN paiement, N commandes ──────────────────────
// Client 2026-08-21 : « un seul bouton dans le panier ». Le serveur cree les N
// commandes dans UNE transaction (place_orders_batch) puis ouvre UNE intention
// de paiement qui les couvre toutes. On ne poste jamais de montant : le total
// encaisse est relu en base cote serveur.
export interface PlaceOrdersBatchInput {
  /** Le panier ENTIER, toutes boutiques confondues. Le serveur regroupe. */
  items: { productId: string; quantity: number }[];
  /** Pas de 'card' ici : Stripe est abandonne (2026-07-26). */
  paymentMethod: 'wallet' | 'orange-money' | 'mtn-money';
  deliveryMode?: 'pickup' | 'delivery';
  payerPhone?: string;
}

export interface PlaceOrdersBatchResult {
  batch_id: string;
  /** Une entree par boutique, dans l'ordre de creation. */
  orders: { id: string; total_minor: number; status: string }[];
  /** Portefeuille : true, les commandes naissent deja payees. */
  paid?: boolean;
  /** Rail mobile money : montant total du lot + page hebergee Lengopay. */
  total_minor?: number;
  payment_url?: string;
}

export function usePlaceOrdersBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      items,
      paymentMethod,
      deliveryMode,
      payerPhone,
    }: PlaceOrdersBatchInput): Promise<PlaceOrdersBatchResult> => {
      return apiPost<PlaceOrdersBatchResult>({
        path: '/place-orders-batch',
        body: {
          items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
          payment_method: paymentMethod,
          ...(deliveryMode ? { delivery_mode: deliveryMode } : {}),
          ...(payerPhone ? { payer_phone: payerPhone } : {}),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      // Meme regle que usePlaceOrder : on ne vide PAS le panier ici. Le rail
      // peut encore echouer ou etre annule ; le vidage se fait au moment ou le
      // paiement est reellement acquis.
    },
  });
}

// scanToken is the QR-gate secret (per migration 20260601_03_qr_scan_gate). The
// buyer learns it ONLY by scanning the seller's QR — it's never delivered to
// the buyer via /get-order. Without it, the server raises INVALID_SCAN_TOKEN
// and the confirm fails fast (400 with explanatory French message). Caller is
// the post-scan confirm route, which reads ?token=X from useLocalSearchParams.
export interface ConfirmReceptionInput {
  orderId: string;
  scanToken: string;
}

// Phase X.6b — seller marks an order as shipped. Atomic transition
// status='paid' -> 'preparing' server-side ; tracking + carrier are optional
// (many Guinea deliveries are hand-carried). On success the buyer gets a push
// "Commande expédiée" with the tracking number in the body when set.
export interface SetOrderTrackingInput {
  orderId: string;
  trackingNumber?: string;
  carrier?: string;
}
export function useSetOrderTracking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetOrderTrackingInput): Promise<Order> => {
      const body: Record<string, unknown> = { order_id: input.orderId };
      if (input.trackingNumber) body.tracking_number = input.trackingNumber;
      if (input.carrier) body.carrier = input.carrier;
      const { order } = await apiPost<{ order: Order }>({
        path: '/set-order-tracking',
        body,
      });
      return order;
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['order', order.id] });
      qc.invalidateQueries({ queryKey: ['seller-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
    },
  });
}

export function useConfirmReception() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConfirmReceptionInput): Promise<Order> => {
      const { order } = await apiPost<{ order: Order }>({
        path: '/confirm-receipt',
        body: { order_id: input.orderId, scan_token: input.scanToken },
      });
      return order;
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['order', order.id] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

// Le VENDEUR confirme une remise en scannant le QR affiche par l'acheteur.
// Client 2026-08-22 : l'acheteur ne scanne plus jamais rien. Ce chemin couvre
// les remises SANS livreur (retrait en boutique, portage a la main) ; quand un
// livreur est assigne, c'est lui qui confirme depuis l'app livreur, et le
// serveur refuse ici avec LIVREUR_ASSIGNED.
export function useSellerConfirmPickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConfirmReceptionInput): Promise<void> => {
      await apiPost<{ order_status: string }>({
        path: '/seller-confirm-pickup',
        body: { order_id: input.orderId, scan_token: input.scanToken },
      });
    },
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: ['order', input.orderId] });
      qc.invalidateQueries({ queryKey: ['seller-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

export type DisputeReason = 'damaged' | 'wrong' | 'not_received';

export interface DisputeOrderInput {
  orderId: string;
  reason: DisputeReason;
  note?: string;
}

export function useDisputeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason, note }: DisputeOrderInput): Promise<Order> => {
      const { order } = await apiPost<{ order: Order }>({
        path: '/dispute-order',
        body: { order_id: orderId, reason, note },
      });
      return order;
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['order', order.id] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}
