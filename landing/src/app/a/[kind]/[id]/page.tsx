import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OpenInApp } from './OpenInApp';

// Public share landing (client 2026-08-05 — sharing a listing used to send bare
// text, so the recipient had no way to reach it).
//
// This page is the target of the links the app now shares
// (https://linkygroup.com/a/<kind>/<id>). It does three jobs:
//   1. renders Open Graph tags so WhatsApp/Facebook unfurl a real preview
//      (photo + title + price) instead of a naked URL ;
//   2. deep-links straight into the app (linky://…) when it is installed ;
//   3. sends everyone else to the store — the "oblige l'installation" ask.
//
// Data comes from the SAME public edge functions the app uses (no auth), so no
// service key and no Supabase SDK are involved.

const KINDS = ['product', 'property', 'shop'] as const;
type Kind = (typeof KINDS)[number];

// Publishable/anon values — public by design (already shipped inside the mobile
// bundle). Overridable per-environment so a staging deploy can point elsewhere.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://mkaddhcjneilvwqethjo.supabase.co';
const SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_imvOZli1yEDOhQ0xjOkBug_SGi_j9M2';

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.linkygroup.app';

interface Listing {
  title: string;
  photo: string | null;
  priceGnf: number | null;
  subtitle: string | null;
}

const FN: Record<Kind, { path: string; key: string }> = {
  product: { path: 'get-product', key: 'product' },
  property: { path: 'get-property', key: 'property' },
  shop: { path: 'get-shop', key: 'shop' },
};

function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

/** UUID guard — refuse junk before spending a network call. */
function isId(v: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(v);
}

async function fetchListing(kind: Kind, id: string): Promise<Listing | null> {
  const fn = FN[kind];
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SUPABASE_ANON,
        authorization: `Bearer ${SUPABASE_ANON}`,
        // Every edge function behind makePost requires an idempotency key.
        'idempotency-key': `share-${kind}-${id}`,
      },
      body: JSON.stringify({ id }),
      // Listings change (price, photos, status) — revalidate rather than
      // freezing the preview at build/first-hit forever.
      next: { revalidate: 300 },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, Record<string, unknown> | undefined>;
    const row = j[fn.key];
    if (!row) return null;
    // products/properties expose `photos[]` ; a shop exposes `cover` + `avatar`.
    const photos = Array.isArray(row.photos) ? (row.photos as string[]) : [];
    const cover =
      photos[0] ||
      (typeof row.cover === 'string' && row.cover ? row.cover : '') ||
      (typeof row.avatar === 'string' && row.avatar ? row.avatar : '') ||
      null;
    return {
      title:
        (typeof row.title === 'string' && row.title) ||
        (typeof row.name === 'string' && row.name) ||
        'Annonce Linky',
      photo: cover,
      priceGnf: typeof row.priceGnf === 'number' ? row.priceGnf : null,
      subtitle:
        (typeof row.city === 'string' && row.city) ||
        (typeof row.district === 'string' && row.district) ||
        null,
    };
  } catch {
    return null;
  }
}

function formatGNF(n: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(n)} GNF`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}): Promise<Metadata> {
  const { kind, id } = await params;
  if (!isKind(kind) || !isId(id)) return { title: 'Annonce introuvable — Linky' };
  const listing = await fetchListing(kind, id);
  if (!listing) return { title: 'Annonce introuvable — Linky' };

  const price = listing.priceGnf ? formatGNF(listing.priceGnf) : null;
  const description = [price, listing.subtitle, 'Voir sur Linky.']
    .filter(Boolean)
    .join(' · ');

  return {
    title: `${listing.title} — Linky`,
    description,
    openGraph: {
      title: listing.title,
      description,
      type: 'website',
      images: listing.photo ? [{ url: listing.photo }] : undefined,
    },
    twitter: {
      card: listing.photo ? 'summary_large_image' : 'summary',
      title: listing.title,
      description,
      images: listing.photo ? [listing.photo] : undefined,
    },
  };
}

export default async function SharedListingPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isKind(kind) || !isId(id)) notFound();
  const listing = await fetchListing(kind, id);
  if (!listing) notFound();

  // expo-router resolves linky://product/<id> to the in-app route of the same
  // shape, so this opens the listing itself, not just the app.
  const deepLink = `linky://${kind}/${id}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
        {listing.photo ? (
          // Remote listing photos come from Supabase storage; next/image would
          // need each bucket host whitelisted, so a plain img keeps this page
          // dependency-free.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.photo}
            alt={listing.title}
            className="aspect-square w-full object-cover"
          />
        ) : null}
        <div className="p-5">
          <h1 className="text-xl font-bold leading-tight tracking-tight">{listing.title}</h1>
          {listing.priceGnf ? (
            <p className="mt-2 text-lg font-bold">{formatGNF(listing.priceGnf)}</p>
          ) : null}
          {listing.subtitle ? (
            <p className="mt-1 text-sm text-black/60">{listing.subtitle}</p>
          ) : null}
        </div>
      </div>

      <OpenInApp deepLink={deepLink} storeUrl={PLAY_STORE_URL} />

      <p className="mt-6 text-center text-xs text-black/45">
        Linky — la marketplace et l&apos;immobilier de Guinée.
      </p>
    </main>
  );
}
