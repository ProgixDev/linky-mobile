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
/** 'card' = Stripe (profils étranger uniquement — Stripe refuse les cartes
 *  guinéennes). 'lengopay-card' / 'kulu' / 'soutramoney' = les rails Lengopay
 *  guinéens ouverts le 2026-09-07. Les deux cartes sont des valeurs DISTINCTES
 *  parce que le serveur ne devine pas le pays : c'est le moyen choisi qui
 *  décide du rail. */
export type PaymentMethod =
  | 'orange-money' | 'mtn-money' | 'card' | 'wallet'
  | 'kulu' | 'soutramoney' | 'lengopay-card' | 'paycard';

/** Ce qu'il reste à faire à l'acheteur après l'initialisation du paiement.
 *  'poll' = rien, il confirme sur son téléphone et le cron tranche. */
export type PaymentNextStep =
  | { kind: 'poll'; fallbackUrl?: string }
  /** Kulu : `payId` est ce que l'écran de saisie renverra pour confirmer. Il
   *  voyage dans l'étape parce que toutes les surfaces n'exposent pas
   *  l'intention (le panier multi-boutiques ne rend que ses commandes). */
  | { kind: 'otp'; payId: string }
  | { kind: 'webview'; url: string }
  /** Portefeuille Linky : le virement est deja fait quand la reponse arrive.
   *  Aucune intention, rien a sonder — l'ecran n'a qu'a se rafraichir. */
  | { kind: 'paid' };
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
  /** Boutique (articles) or agence immobilière (biens). A seller who does both
   *  owns two separate profiles since 2026-08-07, each with its own name, logo,
   *  cover and city. Older payloads without the field read as 'shop'. */
  kind: 'shop' | 'agency';
  name: string;
  cover: string;
  avatar: string;
  city: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  followerCount: number;
  productCount: number;
  /** Listings on an agency profile (the immobilier counterpart of productCount). */
  propertyCount: number;
  responseTime: string;
  about: string;
  // null / undefined when the owner hasn't set a schedule — the storefront then
  // renders no hours section or badge.
  openingHours?: ShopHours | null;
  // Present on get-shop responses for authed callers ; absent / false on
  // list-shops and anonymous reads. Stays optional so existing mock data
  // (which doesn't set it) keeps typechecking.
  isFollowing?: boolean;
  // Owner-only (shop-get-mine) — the exact point stays private otherwise, so
  // these are null/false on the public get-shop/list-shops responses.
  lat?: number | null;
  lng?: number | null;
  /** True once lat/lng are a real point, not the city-centroid fallback. */
  pinned?: boolean;
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
  videoUrl?: string;
  boosted: boolean;
  viewCount: number;
  favCount: number;
  commentCount?: number;
  /** Whether the CALLING user has hearted this listing (server truth, so the
      heart and the count can never disagree). Absent for anonymous callers. */
  favorited?: boolean;
  city: string;
  district?: string;
  /** Quantité disponible déclarée par le vendeur. `null` = non renseignée
   *  (annonces publiées avant le stock) : aucun plafond au panier. */
  stock?: number | null;
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
  commentCount?: number;
  /** Whether the CALLING user has hearted this listing (server truth, so the
      heart and the count can never disagree). Absent for anonymous callers. */
  favorited?: boolean;
}

export type DiscoverItem =
  | { kind: 'product'; item: Product }
  | { kind: 'property'; item: Property };

// A paid boost on one of the seller's products. `product` is embedded on
// list/get responses (title + cover + status) for display; absent on the
// create response, which returns the bare boost.
export interface Boost {
  id: ID;
  kind?: 'product' | 'property';
  productId?: ID;
  propertyId?: ID;
  amountGnf: number;
  days: number;
  status: 'active' | 'expired' | 'cancelled';
  startsAt: string;
  endsAt: string;
  createdAt: string;
  // Unified listing snapshot (product OR property). `product` kept for back-compat.
  listing?: { title: string; photo: string | null; status: string };
  product?: { title: string; photo: string | null; status: string };
}

export interface BoostTier {
  days: number;
  amountGnf: number;
}

export interface CartLine {
  productId: ID;
  quantity: number;
  /** Boutique de l'article. Depuis 2026-08-13 le panier peut contenir plusieurs
   *  boutiques ; c'est ce champ qui permet de les regrouper et de commander
   *  boutique par boutique. Optionnel a la lecture : les paniers enregistres
   *  avant cette version n'en ont pas. */
  shopId?: ID;
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
  /** Mode de réception (2026-07-30). 'delivery' = Linky livre (frais forfaitaire
   *  deliveryFeeGnf) ; 'pickup' = retrait boutique (gratuit). Défaut 'delivery'
   *  pour les commandes historiques. */
  deliveryMode?: 'pickup' | 'delivery';
  /** Frais de livraison facturé (0 en retrait sur place). */
  deliveryFeeGnf?: number;
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
  /** Non nul => panier multi-boutiques (2026-08-21) : cette commande est l'une
   *  de plusieurs payees en un seul geste. Seul get-order le renvoie. */
  batchId?: string | null;
  /** Montant total du LOT quand batchId est pose — a utiliser a la place de
   *  totalGnf partout ou l'ecran ne montre qu'UNE commande d'un panier qui en
   *  contient plusieurs (succes, suivi). null si batchId est nul, ou si le
   *  calcul a echoue cote serveur (repli sur totalGnf dans ce cas). */
  batchTotalGnf?: number | null;
  /** Delivery summary — present on get-order responses for order participants.
   *  Name only (no livreur phone/PII). Drives the seller's pick/change UI. */
  delivery?: OrderDelivery | null;
  /** Whether the caller already reviewed this order (get-order) — gates the « Noter » CTA. */
  hasReviewed?: boolean;
  /** Every article of the order (same shop). Present from get-order; the legacy
      productSnapshot fields still describe the PRIMARY article. */
  items?: {
    productId: string;
    title: string;
    photo: string;
    quantity: number;
    unitPriceGnf: number;
    amountGnf: number;
  }[];
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
  period: 'day' | 'month' | 'sale';
  start_date: string;
  end_date: string | null;
  months: number | null;
  rent_minor: number;
  deposit_minor?: number; // monthly caution (1 month); absent/0 for daily
  amount_minor: number;
  fees_minor: number;
  total_minor: number;
  clauses: string[];
}

export interface Booking {
  id: ID;
  propertyId: ID;
  period: 'day' | 'month' | 'sale';
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
  /** Bail au mois que cette reservation prolonge, s'il y en a un. Change ce que
   *  l'ecran demande de confirmer : on n'emmenage pas deux fois. */
  extendsBookingId?: string | null;
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
  parentId: ID | null;
  likeCount: number;
  likedByMe: boolean;
  /** Present on top-level comments only; oldest-first. */
  replies?: Comment[];
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
  /** Page où l'acheteur finit de payer (Soutra Money, carte Lengopay).
   *  Persistée côté serveur pour survivre à un écran fermé — une URL v2 ne se
   *  reconstruit pas à partir du pay_id, contrairement à la page hébergée v1. */
  railActionUrl?: string;
  status: PaymentIntentStatus;
  method: Exclude<PaymentMethod, 'wallet'>;
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

/** D'ou vient l'argent d'un portefeuille — voir la migration
 *  20260909_01_wallet_origin_breakdown. La somme des origines EGALE le solde. */
export type WalletOrigin =
  | 'products'    // ventes d'articles encaissees
  | 'properties'  // locations et ventes immobilieres encaissees
  | 'topup'       // recharges
  | 'refund'      // remboursements recus
  | 'purchase'    // achats payes depuis le portefeuille
  | 'boost'       // mises en avant payees
  | 'withdrawal'  // retraits
  | 'other';

export interface Wallet {
  balanceGnf: number;
  pendingGnf: number;
  movements: WalletMovement[];
  /** Net par origine. Une origine qui se solde a zero est absente. */
  originsGnf: Partial<Record<WalletOrigin, number>>;
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
