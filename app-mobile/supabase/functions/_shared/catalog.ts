// Row → frontend shape mappers for catalog endpoints. Keeps every endpoint's response
// 1:1 with the Product / Shop types in src/data/types.ts so the existing screens consume
// the API output without translation. price_minor stays integer GNF (no float conversion).

export interface ProductRow {
  id: string;
  shop_id: string;
  title: string;
  description: string;
  price_minor: number | string; // bigint may arrive as string from PostgREST
  category: string;
  condition: 'neuf' | 'occasion' | 'reconditionné';
  status: 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
  photos: string[] | null;
  boosted: boolean;
  view_count: number;
  fav_count: number;
  city: string;
  district: string | null;
  created_at: string;
}

export interface OpeningHoursRow {
  always_open?: boolean;
  days?: string[];
  open?: string;
  close?: string;
}

export interface ShopRow {
  id: string;
  owner_id: string;
  name: string;
  about: string;
  city: string;
  cover_url: string | null;
  avatar_url: string | null;
  verified: boolean;
  rating: number | string;
  review_count: number;
  follower_count: number;
  response_time_text: string;
  opening_hours?: OpeningHoursRow | null;
  product_count?: number; // present on shops_with_counts view only
  created_at: string;
}

export function mapProduct(r: ProductRow) {
  return {
    id: r.id,
    shopId: r.shop_id,
    title: r.title,
    description: r.description,
    priceGnf: Number(r.price_minor),
    category: r.category,
    condition: r.condition,
    status: r.status,
    photos: r.photos ?? [],
    boosted: r.boosted,
    viewCount: r.view_count,
    favCount: r.fav_count,
    city: r.city,
    district: r.district ?? undefined,
    createdAt: r.created_at,
  };
}

export interface PropertyRow {
  id: string;
  owner_id: string;
  shop_id: string | null;
  type: 'location' | 'vente' | 'terrain';
  title: string;
  description: string;
  price_minor: number | string;
  per_month: boolean;
  bedrooms: number | null;
  area_sqm: number | null;
  furnished: boolean | null;
  amenities: string[];
  city: string;
  district: string | null;
  distance_to_road_m: number;
  lat: number | null;
  lng: number | null;
  video_url: string | null;
  status: 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
  view_count: number;
  fav_count: number;
  created_at: string;
}

// Property → frontend shape. Photos arrive separately from property_photos (the cover is
// position 0); mapper just receives the already-ordered URL list. district is required in
// the frontend Property type so we coalesce null → '' to keep the shape; gps coalesces
// null lat/lng → 0/0 (frontend treats {0,0} as "no pin").
export function mapProperty(r: PropertyRow, photos: string[]) {
  return {
    id: r.id,
    ownerId: r.owner_id,
    shopId: r.shop_id ?? undefined,
    title: r.title,
    description: r.description,
    type: r.type,
    priceGnf: Number(r.price_minor),
    perMonth: r.per_month,
    bedrooms: r.bedrooms ?? undefined,
    areaSqm: r.area_sqm ?? undefined,
    furnished: r.furnished ?? undefined,
    city: r.city,
    district: r.district ?? '',
    distanceToRoadMeters: r.distance_to_road_m,
    photos,
    videoUrl: r.video_url ?? undefined,
    status: r.status,
    viewCount: r.view_count,
    favCount: r.fav_count,
    gps: { lat: r.lat ?? 0, lng: r.lng ?? 0 },
    createdAt: r.created_at,
  };
}

export interface OrderRow {
  id: string;
  reference: string;
  buyer_id: string;
  seller_id: string;
  shop_id: string;
  product_id: string;
  product_snapshot: { title: string; photo: string; priceGnf: number };
  quantity: number;
  amount_minor: number | string;
  fees_minor: number | string;
  total_minor: number | string;
  payment_method: string;
  currency: 'GNF' | 'EUR';
  status: string;
  // Phase K adds richer event entries (kind, outcome, admin_id, reason, note)
  // alongside the original { at, label } shape. The widened type keeps the
  // base fields known while permitting arbitrary extras at runtime so PII
  // strip can walk + filter without needing a closed event union.
  events: Array<{ at: string; label?: string } & Record<string, unknown>>;
  release_at: string | null;
  created_at: string;
  // Only present when the SELECT clause asks for it (get-order, when caller
  // is seller). Other endpoints don't even include it in their SELECT, so
  // it's optional here.
  scan_token?: string;
}

// Two opt-in PII gates layered on top of the base mapper:
//
// includeScanToken — only the seller of an order may see scan_token (the QR
//   secret printed on the package). Buyer/agent callers MUST NOT receive it;
//   that's what makes the QR an actual lock, not a navigation hint. get-order
//   passes { includeScanToken: r.seller_id === userId }; seller-only endpoints
//   pass { includeScanToken: true }; buyer/public endpoints omit opts entirely.
//
// includeAdminMeta — only an admin caller may see admin_id inside the
//   dispute_resolved events that Phase K resolve_dispute appends. Buyer/seller
//   callers reading their own order detail must NOT learn which admin handled
//   the dispute (memo project_phase_k_mapper_pii). The strip applies only to
//   events where kind === 'dispute_resolved' — every other field on the event
//   (outcome, reason, note, label, at) stays visible because it's legitimate
//   information for the participants.
//
// Dev-time guard: if a caller defensively passes includeScanToken=true but
// the SELECT forgot scan_token, the warn surfaces the bug loud rather than
// silently returning scanToken=undefined as if the order had none.
export function mapOrder(
  r: OrderRow,
  opts?: { includeScanToken?: boolean; includeAdminMeta?: boolean },
) {
  if (opts?.includeScanToken && !r.scan_token) {
    console.warn('[mapOrder] includeScanToken=true but row has no scan_token — SELECT likely missing it');
  }
  const events = opts?.includeAdminMeta
    ? r.events
    : r.events.map((e) => {
        if (e && typeof e === 'object' && (e as { kind?: unknown }).kind === 'dispute_resolved') {
          const { admin_id: _admin_id, ...rest } = e as Record<string, unknown> & { admin_id?: unknown };
          return rest as typeof e;
        }
        return e;
      });
  return {
    id: r.id,
    reference: r.reference,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    shopId: r.shop_id,
    productId: r.product_id,
    productSnapshot: r.product_snapshot,
    quantity: r.quantity,
    amountGnf: Number(r.amount_minor),
    feesGnf: Number(r.fees_minor),
    totalGnf: Number(r.total_minor),
    paymentMethod: r.payment_method,
    currency: r.currency,
    status: r.status,
    events,
    createdAt: r.created_at,
    releaseAt: r.release_at ?? undefined,
    scanToken: opts?.includeScanToken ? r.scan_token : undefined,
  };
}

// Phase K admin_actions audit row → frontend shape. Snapshots stay as raw
// jsonb (the admin console renders them through a diff viewer); reason
// coalesces null → undefined to match the optional shape on the wire.
export interface AdminActionRow {
  id: string;
  admin_id: string;
  target_type: string;
  target_id: string;
  action: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export function mapAdminAction(r: AdminActionRow) {
  return {
    id: r.id,
    adminId: r.admin_id,
    targetType: r.target_type,
    targetId: r.target_id,
    action: r.action,
    reason: r.reason ?? undefined,
    metadata: r.metadata,
    beforeSnapshot: r.before_snapshot ?? undefined,
    afterSnapshot: r.after_snapshot ?? undefined,
    createdAt: r.created_at,
  };
}

export interface PaymentIntentRow {
  id: string;
  order_id: string;
  rail: string;
  rail_intent_id: string;
  rail_status: string | null;
  status: 'pending' | 'completed' | 'failed' | 'expired' | 'cancelled';
  method: 'orange-money' | 'mtn-money' | 'card';
  currency: 'GNF' | 'EUR';
  amount_minor: number | string;
  payer_phone: string | null;
  attempt_index: number;
  attempts_count: number;
  last_polled_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export function mapPaymentIntent(r: PaymentIntentRow) {
  return {
    id: r.id,
    orderId: r.order_id,
    rail: r.rail,
    railIntentId: r.rail_intent_id,
    railStatus: r.rail_status ?? undefined,
    status: r.status,
    method: r.method,
    currency: r.currency,
    amountGnf: Number(r.amount_minor),
    payerPhone: r.payer_phone ?? undefined,
    attemptIndex: r.attempt_index,
    attemptsCount: r.attempts_count,
    lastPolledAt: r.last_polled_at ?? undefined,
    lastErrorCode: r.last_error_code ?? undefined,
    lastErrorMessage: r.last_error_message ?? undefined,
    createdAt: r.created_at,
    completedAt: r.completed_at ?? undefined,
  };
}

export function mapShop(r: ShopRow) {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    cover: r.cover_url ?? '',
    avatar: r.avatar_url ?? '',
    city: r.city,
    verified: r.verified,
    rating: Number(r.rating),
    reviewCount: r.review_count,
    followerCount: r.follower_count,
    productCount: r.product_count ?? 0,
    responseTime: r.response_time_text,
    about: r.about,
    // jsonb → camelCase for the frontend. null (unset) stays null so the
    // storefront can decide to render no hours section at all.
    openingHours: r.opening_hours
      ? {
          alwaysOpen: !!r.opening_hours.always_open,
          days: Array.isArray(r.opening_hours.days) ? r.opening_hours.days : [],
          open: typeof r.opening_hours.open === 'string' ? r.opening_hours.open : '',
          close: typeof r.opening_hours.close === 'string' ? r.opening_hours.close : '',
        }
      : null,
  };
}

// Boost purchase row → frontend shape. `products` is present only when the
// SELECT embeds it (list-boosts / get-boost); the purchase_boost RPC returns
// the bare boosts row, so the embed is optional here.
export interface BoostRow {
  id: string;
  product_id: string;
  seller_id: string;
  amount_minor: number | string;
  days: number;
  status: 'active' | 'expired' | 'cancelled';
  starts_at: string;
  ends_at: string;
  created_at: string;
  products?: { title: string; photos: string[] | null; status: string } | null;
}

export function mapBoost(r: BoostRow) {
  return {
    id: r.id,
    productId: r.product_id,
    amountGnf: Number(r.amount_minor),
    days: r.days,
    status: r.status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    createdAt: r.created_at,
    product: r.products
      ? {
          title: r.products.title,
          photo: r.products.photos?.[0] ?? null,
          status: r.products.status,
        }
      : undefined,
  };
}
