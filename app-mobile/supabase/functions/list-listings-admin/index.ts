// Final sprint §2 — admin listings moderation queue (products + properties).
//
// Body : { status?: 'active' | 'pending' | 'paused' | 'removed' | 'reserved' | 'sold' }
//        (omit = all). Response : { listings: AdminListing[] } — both kinds
//        merged, newest first, ≤100 per kind, each with owner + kyc_status so
//        the console can weigh moderation calls.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

const STATUSES = new Set(['active', 'pending', 'paused', 'removed', 'reserved', 'sold']);

interface Body {
  status?: string;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return x.status === undefined || (typeof x.status === 'string' && STATUSES.has(x.status));
}

interface Owner {
  id: string;
  display_name: string | null;
  kyc_status: string;
}

interface AdminListing {
  id: string;
  kind: 'product' | 'property';
  title: string;
  category: string;
  price_minor: number;
  city: string;
  status: string;
  view_count: number;
  created_at: string;
  shop_name: string | null;
  owner: Owner | null;
}

Deno.serve(makePost<Body>('/v1/admin/listings/list', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  let pq = sb.from('products').select(
    'id, title, category, price_minor, city, status, view_count, created_at, ' +
    'shops!inner(name, owner:users(id, display_name, kyc_status))',
  );
  let rq = sb.from('properties').select(
    'id, title, type, price_minor, city, status, view_count, created_at, ' +
    'owner:users(id, display_name, kyc_status)',
  );
  if (body.status) {
    pq = pq.eq('status', body.status);
    rq = rq.eq('status', body.status);
  }

  const [products, properties] = await Promise.all([
    pq.order('created_at', { ascending: false }).limit(100),
    rq.order('created_at', { ascending: false }).limit(100),
  ]);
  if (products.error || properties.error) {
    console.error('[list-listings-admin] select error:', products.error ?? properties.error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  /* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embed shapes */
  const fromProduct = (p: any): AdminListing => ({
    id: p.id,
    kind: 'product',
    title: p.title,
    category: p.category,
    price_minor: Number(p.price_minor),
    city: p.city,
    status: p.status,
    view_count: p.view_count,
    created_at: p.created_at,
    shop_name: p.shops?.name ?? null,
    owner: p.shops?.owner ?? null,
  });
  const fromProperty = (r: any): AdminListing => ({
    id: r.id,
    kind: 'property',
    title: r.title,
    category: r.type,
    price_minor: Number(r.price_minor),
    city: r.city,
    status: r.status,
    view_count: r.view_count,
    created_at: r.created_at,
    shop_name: null,
    owner: r.owner ?? null,
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const listings = [
    ...(products.data ?? []).map(fromProduct),
    ...(properties.data ?? []).map(fromProperty),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { body: { listings } };
}));
