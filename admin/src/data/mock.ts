// Centralized mock data for the admin. Replace each `[type]Data` array with
// a real fetcher when the backend lands.

export type UserRole = 'buyer' | 'seller' | 'agent';
export type UserStatus = 'active' | 'suspended' | 'pending';
export type ListingKind = 'product' | 'property';
export type ListingStatus =
  | 'live'
  | 'pending'
  | 'flagged'
  | 'paused'
  | 'rejected';
export type OrderStatus =
  | 'placed'
  | 'paid'
  | 'preparing'
  | 'delivered'
  | 'released'
  | 'disputed';
export type DisputeColumn = 'received' | 'reviewing' | 'refunded' | 'rejected';
export type KycStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  roles: UserRole[];
  status: UserStatus;
  kyc: KycStatus;
  joinedAt: string;
  ordersCount: number;
  listingsCount: number;
}

export interface Listing {
  id: string;
  ref: string;
  kind: ListingKind;
  title: string;
  category: string;
  priceGnf: number;
  city: string;
  shopName: string;
  status: ListingStatus;
  views: number;
  flags?: number;
  createdAt: string;
}

export interface Order {
  id: string;
  ref: string;
  buyer: string;
  seller: string;
  product: string;
  totalGnf: number;
  status: OrderStatus;
  createdAt: string;
}

export interface Dispute {
  id: string;
  orderRef: string;
  buyer: string;
  seller: string;
  amountGnf: number;
  reason: string;
  column: DisputeColumn;
  ago: string;
}

export interface KycSubmission {
  id: string;
  name: string;
  docType: 'CNI' | 'Passeport' | 'Carte électeur' | 'Registre commerce';
  submittedAt: string;
  status: KycStatus;
  role: UserRole;
}

export interface Banner {
  id: string;
  title: string;
  body: string;
  ctaLabel: string;
  audience: 'all' | 'buyers' | 'sellers' | 'agents';
  status: 'live' | 'scheduled' | 'draft';
  startsAt: string;
  endsAt: string;
}

export interface PushCampaign {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'buyers' | 'sellers' | 'agents';
  scheduled: string;
  sent?: number;
  opened?: number;
  status: 'scheduled' | 'sent' | 'draft';
}

const CITIES = ['Conakry', 'Kindia', 'Labé', 'Kankan', 'Nzérékoré', 'Mamou'];
const FIRST = [
  'Mariama',
  'Aïssatou',
  'Mamadou',
  'Ibrahima',
  'Fatou',
  'Ousmane',
  'Kadiatou',
  'Sékou',
  'Bineta',
  'Boubacar',
  'Hadja',
  'Thierno',
];
const LAST = [
  'Diallo',
  'Bah',
  'Camara',
  'Sow',
  'Touré',
  'Sylla',
  'Condé',
  'Keïta',
  'Barry',
  'Cissé',
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]!;
}
function rand(seed: number) {
  return Math.abs(Math.sin(seed * 9999) * 10000) % 1;
}

export const usersData: User[] = Array.from({ length: 28 }).map((_, i) => {
  const r = rand(i);
  const roles: UserRole[] =
    r < 0.55
      ? ['buyer']
      : r < 0.78
        ? ['buyer', 'seller']
        : r < 0.92
          ? ['seller']
          : ['agent'];
  return {
    id: `u_${i + 100}`,
    name: `${pick(FIRST, i)} ${pick(LAST, i + 3)}`,
    email: `user${i + 100}@linky.gn`,
    phone: `+224 6${(20 + (i % 8))}${String(1000 + i * 13).slice(0, 4)} ${String(
      10 + (i % 90),
    )} ${String(10 + ((i * 7) % 90))}`,
    city: pick(CITIES, i),
    roles,
    status: r > 0.92 ? 'suspended' : r > 0.85 ? 'pending' : 'active',
    kyc: r > 0.75 ? 'approved' : r > 0.65 ? 'pending' : r > 0.6 ? 'rejected' : 'approved',
    joinedAt: new Date(Date.now() - i * 86_400_000 * 3).toISOString(),
    ordersCount: Math.floor(rand(i + 1) * 28),
    listingsCount: Math.floor(rand(i + 2) * 42),
  };
});

const PRODUCT_TITLES = [
  'Eau de parfum édition limitée — 50ml',
  'iPhone 12 Pro 256Go',
  'Robe wax élégante taille M',
  'Sneakers Nike Air',
  'Canapé 3 places en cuir',
  'TV LED Samsung 55"',
  'MacBook Air M2',
  'Sac à main en cuir véritable',
  'Montre Casio rétro',
  'Vélo VTT 27.5"',
];
const PROPERTY_TITLES = [
  'Appartement 2 pièces lumineux, Kaloum',
  'Villa moderne 4 chambres — Lambanyi',
  'Studio meublé — Dixinn',
  'Terrain titré 600 m² — Ratoma',
  'Maison 3 chambres — Matoto',
];

export const listingsData: Listing[] = Array.from({ length: 32 }).map((_, i) => {
  const isProduct = i % 3 !== 0;
  const r = rand(i);
  return {
    id: `l_${i + 200}`,
    ref: `LK-LST-${String(2000 + i).padStart(5, '0')}`,
    kind: isProduct ? 'product' : 'property',
    title: pick(isProduct ? PRODUCT_TITLES : PROPERTY_TITLES, i),
    category: isProduct
      ? pick(['Mode', 'Électronique', 'Maison', 'Auto', 'Beauté'], i)
      : pick(['Location', 'Vente', 'Terrain'], i),
    priceGnf:
      (isProduct ? 100_000 : 1_000_000) *
      Math.max(1, Math.floor(r * 50)),
    city: pick(CITIES, i),
    shopName: pick(
      ['Maison Aïssatou', 'Conakry Tech', 'Agence Kaloum', 'Bijoux & Soie'],
      i,
    ),
    status:
      r > 0.9
        ? 'flagged'
        : r > 0.78
          ? 'pending'
          : r > 0.72
            ? 'paused'
            : r > 0.05
              ? 'live'
              : 'rejected',
    views: Math.floor(rand(i + 8) * 5000),
    flags: r > 0.9 ? Math.floor(rand(i + 9) * 4) + 1 : undefined,
    createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
  };
});

export const ordersData: Order[] = Array.from({ length: 24 }).map((_, i) => {
  const r = rand(i + 1);
  return {
    id: `o_${i + 300}`,
    ref: `LK-2026-${String(4800 + i).padStart(5, '0')}`,
    buyer: `${pick(FIRST, i)} ${pick(LAST, i + 1)}`,
    seller: pick(
      ['Maison Aïssatou', 'Conakry Tech', 'Bijoux & Soie', 'Agence Kaloum'],
      i,
    ),
    product: pick(PRODUCT_TITLES, i),
    totalGnf: 50_000 + Math.floor(r * 5_000_000),
    status:
      r > 0.92
        ? 'disputed'
        : r > 0.7
          ? 'released'
          : r > 0.4
            ? 'preparing'
            : r > 0.15
              ? 'paid'
              : 'placed',
    createdAt: new Date(Date.now() - i * 3600_000 * 8).toISOString(),
  };
});

export const disputesData: Dispute[] = [
  {
    id: 'd1',
    orderRef: 'LK-2026-04812',
    buyer: 'Mariama Diallo',
    seller: 'Maison Aïssatou',
    amountGnf: 420_000,
    reason: 'Article différent de la photo',
    column: 'received',
    ago: '2 h',
  },
  {
    id: 'd2',
    orderRef: 'LK-2026-04798',
    buyer: 'Ibrahima Sow',
    seller: 'Conakry Tech',
    amountGnf: 4_800_000,
    reason: 'Téléphone non reçu après 7 jours',
    column: 'received',
    ago: '5 h',
  },
  {
    id: 'd3',
    orderRef: 'LK-2026-04780',
    buyer: 'Fatou Camara',
    seller: 'Bijoux & Soie',
    amountGnf: 185_000,
    reason: 'Tissu déchiré à la réception',
    column: 'reviewing',
    ago: 'Hier',
  },
  {
    id: 'd4',
    orderRef: 'LK-2026-04766',
    buyer: 'Ousmane Touré',
    seller: 'Conakry Tech',
    amountGnf: 1_240_000,
    reason: 'Faux écran de remplacement',
    column: 'reviewing',
    ago: 'Hier',
  },
  {
    id: 'd5',
    orderRef: 'LK-2026-04701',
    buyer: 'Kadiatou Bah',
    seller: 'Maison Aïssatou',
    amountGnf: 320_000,
    reason: 'Parfum contrefait',
    column: 'refunded',
    ago: 'Il y a 3 j',
  },
  {
    id: 'd6',
    orderRef: 'LK-2026-04688',
    buyer: 'Sékou Condé',
    seller: 'Bijoux & Soie',
    amountGnf: 95_000,
    reason: 'Plainte non justifiée',
    column: 'rejected',
    ago: 'Il y a 5 j',
  },
];

export const kycData: KycSubmission[] = Array.from({ length: 12 }).map((_, i) => {
  const r = rand(i + 5);
  return {
    id: `k_${i + 400}`,
    name: `${pick(FIRST, i)} ${pick(LAST, i + 2)}`,
    docType: pick(
      ['CNI', 'Passeport', 'Carte électeur', 'Registre commerce'],
      i,
    ),
    submittedAt: new Date(Date.now() - i * 3600_000 * 4).toISOString(),
    status: r > 0.7 ? 'pending' : r > 0.4 ? 'approved' : 'rejected',
    role: r > 0.6 ? 'seller' : r > 0.3 ? 'agent' : 'buyer',
  };
});

export const bannersData: Banner[] = [
  {
    id: 'b1',
    title: 'Black Friday — -30 %',
    body: 'Jusqu\'à -30 % sur l\'électronique. Du 25 au 30 novembre.',
    ctaLabel: 'Voir les offres',
    audience: 'buyers',
    status: 'scheduled',
    startsAt: '25/11/2026',
    endsAt: '30/11/2026',
  },
  {
    id: 'b2',
    title: 'Nouveau : Wallet Linky',
    body: 'Recharge en Mobile Money, paye, retire — sans quitter l\'app.',
    ctaLabel: 'Activer mon wallet',
    audience: 'all',
    status: 'live',
    startsAt: '01/05/2026',
    endsAt: '31/05/2026',
  },
];

export const pushData: PushCampaign[] = [
  {
    id: 'p1',
    title: 'Tabaski : des promos limitées',
    body: 'Les meilleures boutiques ont préparé leurs offres. Découvre.',
    audience: 'buyers',
    scheduled: '17/05/2026 09:00',
    status: 'scheduled',
  },
  {
    id: 'p2',
    title: 'Tu as une nouvelle offre',
    body: 'Un acheteur a fait une offre sur ton bien Villa Lambanyi.',
    audience: 'agents',
    scheduled: '14/05/2026 14:32',
    status: 'sent',
    sent: 84,
    opened: 56,
  },
];

// KPI seed for the overview page
export const overviewKpis = {
  revenue: 184_240_000,
  revenueDelta: '+18 %',
  orders: 312,
  ordersDelta: '+24 %',
  users: 18_420,
  usersDelta: '+9 %',
  disputes: 6,
  disputesDelta: '−2',
};
