// Domain types shared between mock data and queries.
// When swapping to a real API, these should match the OpenAPI schema.

export type ID = string;

export type Condition = 'neuf' | 'occasion' | 'reconditionné';
export type ListingStatus = 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
export type PropertyType = 'location' | 'vente' | 'terrain';
export type OrderStatus =
  | 'placed'
  | 'paid'
  | 'preparing'
  | 'delivered'
  | 'released'
  | 'disputed'
  | 'cancelled'
  | 'refunded';
export type PaymentMethod = 'orange-money' | 'mtn-money' | 'card' | 'wallet';
export type DeliveryStatus =
  | 'unassigned'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export interface User {
  id: ID;
  name: string;
  photo: string;
  city: string;
  country: string;
  kycVerified: boolean;
  diaspora: boolean;
  phone?: string;
  email?: string;
  rating: number;
  roles: Array<'buyer' | 'seller' | 'agent' | 'livreur'>;
}

// Owner-configured storefront schedule. When alwaysOpen is true the shop is
// open 24/24h, 7/7 and days/open/close are ignored. days use lowercase 3-letter
// codes: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'.
export interface ShopHours {
  alwaysOpen: boolean;
  days: string[];
  open: string;  // 'HH:MM'
  close: string; // 'HH:MM'
}

export interface Shop {
  id: ID;
  ownerId: ID;
  name: string;
  cover: string;
  avatar: string;
  city: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  followerCount: number;
  productCount: number;
  responseTime: string;
  about: string;
  // null / undefined when the owner hasn't set a schedule — the storefront then
  // renders no hours section or badge.
  openingHours?: ShopHours | null;
  // Present on get-shop responses for authed callers ; absent / false on
  // list-shops and anonymous reads. Stays optional so existing mock data
  // (which doesn't set it) keeps typechecking.
  isFollowing?: boolean;
}

export interface Product {
  id: ID;
  shopId: ID;
  title: string;
  description: string;
  priceGnf: number;
  category: string;
  condition: Condition;
  status: ListingStatus;
  photos: string[];
  boosted: boolean;
  viewCount: number;
  favCount: number;
  city: string;
  district?: string;
  createdAt: string;
}

export interface Property {
  id: ID;
  ownerId: ID;
  shopId?: ID;
  title: string;
  description: string;
  type: PropertyType;
  priceGnf: number;
  perMonth: boolean;
  bedrooms?: number;
  areaSqm?: number;
  furnished?: boolean;
  city: string;
  district: string;
  distanceToRoadMeters: number;
  photos: string[];
  videoUrl?: string;
  status: ListingStatus;
  badge?: 'Nouveau' | 'Réservé';
  gps: { lat: number; lng: number };
  createdAt: string;
  viewCount: number;
  favCount: number;
}

export type DiscoverItem =
  | { kind: 'product'; item: Product }
  | { kind: 'property'; item: Property };

// A paid boost on one of the seller's products. `product` is embedded on
// list/get responses (title + cover + status) for display; absent on the
// create response, which returns the bare boost.
export interface Boost {
  id: ID;
  productId: ID;
  amountGnf: number;
  days: number;
  status: 'active' | 'expired' | 'cancelled';
  startsAt: string;
  endsAt: string;
  createdAt: string;
  product?: { title: string; photo: string | null; status: string };
}

export interface BoostTier {
  days: number;
  amountGnf: number;
}

export interface CartLine {
  productId: ID;
  quantity: number;
}

export interface Order {
  id: ID;
  reference: string;
  buyerId: ID;
  sellerId: ID;
  shopId: ID;
  productId: ID;
  productSnapshot: { title: string; photo: string; priceGnf: number };
  quantity: number;
  amountGnf: number;
  feesGnf: number;
  totalGnf: number;
  paymentMethod: PaymentMethod;
  currency: 'GNF' | 'EUR';
  status: OrderStatus;
  /** Secret printed inside the seller's QR. Populated ONLY when the caller is the
   *  seller of the order (get-order enforces this). Buyers never receive this
   *  field — that's what makes the QR scan an actual lock, not a navigation hint. */
  scanToken?: string;
  createdAt: string;
  events: Array<{ at: string; label: string }>;
  releaseAt?: string;
  /** Delivery summary — present on get-order responses for order participants.
   *  Name only (no livreur phone/PII). Drives the seller's pick/change UI. */
  delivery?: OrderDelivery | null;
  /** Whether the caller already reviewed this order (get-order) — gates the « Noter » CTA. */
  hasReviewed?: boolean;
}

export interface Review {
  id: ID;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string | null;
}

// Rental booking (location par jour / par mois) — tenant journey through to
// the in-app contract signature + escrow payment.
export type BookingStatus =
  | 'requested' | 'accepted' | 'rejected' | 'cancelled'
  | 'paid' | 'active' | 'completed' | 'disputed' | 'refunded';

export interface BookingContract {
  version: number;
  landlord_name: string;
  tenant_name: string;
  property_title: string;
  property_location: string;
  period: 'day' | 'month';
  start_date: string;
  end_date: string | null;
  months: number | null;
  rent_minor: number;
  amount_minor: number;
  fees_minor: number;
  total_minor: number;
  clauses: string[];
}

export interface Booking {
  id: ID;
  propertyId: ID;
  period: 'day' | 'month';
  startDate: string;
  endDate: string | null;
  months: number | null;
  rentGnf: number;
  amountGnf: number;
  feesGnf: number;
  totalGnf: number;
  status: BookingStatus;
  note: string;
  property: {
    title: string;
    city: string;
    district: string | null;
    cover_url: string | null;
    price_minor: number;
    per_month: boolean;
  };
  contract: BookingContract | null;
  landlordSignedAt: string | null;
  tenantSignedAt: string | null;
  events: { at: string; label: string }[];
  createdAt: string;
  // Tenant lists carry the landlord's name; landlord lists the tenant's.
  counterpartyName: string | null;
}

// A comment under a product or property listing (public discussion thread).
export interface Comment {
  id: ID;
  body: string;
  createdAt: string;
  authorId: ID;
  authorName: string | null;
  authorAvatarUrl: string | null;
}

export interface OrderDelivery {
  status: DeliveryStatus;
  /** Snapshotted delivery city (from the order's address snapshot), or null. */
  city: string | null;
  livreurId: ID | null;
  livreurName: string | null;
  /** Drop-off (client) coords for the buyer tracking map — quartier/ville-level. */
  clientLocation?: { lat: number; lng: number } | null;
  /** The courier's last live position (pushed every ~15s while en route), or null. */
  livreurLocation?: { lat: number; lng: number; at: string | null } | null;
}

export type PaymentIntentStatus = 'pending' | 'completed' | 'failed' | 'expired' | 'cancelled';

export interface PaymentIntent {
  id: ID;
  orderId: ID;
  rail: string;
  railIntentId: string;
  railStatus?: string;
  status: PaymentIntentStatus;
  method: 'orange-money' | 'mtn-money' | 'card';
  currency: 'GNF' | 'EUR';
  amountGnf: number;
  payerPhone?: string;
  attemptIndex: number;
  attemptsCount: number;
  lastPolledAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: string;
  completedAt?: string;
  /** Lengopay hosted payment page — present on the place-order response only.
   *  Reconstructable later as https://payment.lengopay.com/{railIntentId}. */
  paymentUrl?: string;
}

export interface WalletMovement {
  id: ID;
  direction: 'in' | 'out';
  label: string;
  amountGnf: number;
  date: string;
  status: 'received' | 'escrow' | 'completed' | 'pending';
}

export interface Wallet {
  balanceGnf: number;
  pendingGnf: number;
  movements: WalletMovement[];
}

export interface Message {
  id: ID;
  conversationId: ID;
  senderId: ID;
  body: string;
  at: string;
  seen: boolean;
}

export interface Conversation {
  id: ID;
  participants: ID[];
  otherUserId: ID;
  otherUserDisplayName: string | null;
  otherUserAvatarUrl: string | null;
  pinnedListingId: ID | null;
  pinnedListingKind: 'product' | 'property' | null;
  pinnedListingTitle: string | null;
  pinnedListingPhotoUrl: string | null;
  pinnedListingPriceGnf: number | null;
  lastMessage: string | null;
  lastAt: string | null;
  lastMessageSenderId: ID | null;
  unread: number;
}

export type NotificationCategory = 'order' | 'message' | 'visit' | 'promo' | 'system';

export interface AppNotification {
  id: ID;
  category: NotificationCategory;
  title: string;
  body: string;
  at: string;
  read: boolean;
  iconHint: string;
  // In-app route ('/order/xyz'). Server sends it; rows navigate on tap.
  deeplink?: string | null;
}
