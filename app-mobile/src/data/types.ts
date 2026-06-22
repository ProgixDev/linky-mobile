// Domain types shared between mock data and queries.
// When swapping to a real API, these should match the OpenAPI schema.

export type ID = string;

export type Condition = 'neuf' | 'occasion' | 'reconditionné';
export type ListingStatus = 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
export type PropertyType = 'location' | 'vente' | 'terrain';
export type OrderStatus = 'placed' | 'paid' | 'preparing' | 'delivered' | 'released' | 'disputed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'orange-money' | 'mtn-money' | 'card' | 'wallet';

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
}
