// Public read for a single property. No JWT required, no status filter — direct links to
// reserved/sold listings still resolve so the frontend can render the badge. Photos are
// returned in full (ordered by position) since this is the detail screen's primary read.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { mapProperty, type PropertyRow } from '@shared/catalog.ts';

interface Body { id: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.id === 'string' && /^[0-9a-f-]{36}$/i.test(x.id);
}

Deno.serve(makePost<Body>('/v1/properties/get', valid, async ({ sb, body }) => {
  const { data: prop, error: propErr } = await sb
    .from('properties_with_cover')
    .select('id, owner_id, shop_id, type, title, description, price_minor, per_month, bedrooms, area_sqm, furnished, amenities, city, district, distance_to_road_m, lat, lng, video_url, status, view_count, fav_count, created_at, deposit_basis, deposit_value, deposit_kind, min_nights, min_months')
    .eq('id', body.id)
    .maybeSingle();
  if (propErr) {
    console.error('[get-property] fetch error:', propErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!prop) throwApi('PROPERTY_NOT_FOUND', 404, 'Annonce introuvable.');

  const { data: photoRows, error: photoErr } = await sb
    .from('property_photos')
    .select('url')
    .eq('property_id', body.id)
    .order('position', { ascending: true });
  if (photoErr) {
    console.error('[get-property] photos fetch error:', photoErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture photos');
  }

  const photoUrls = (photoRows ?? []).map((p) => p.url as string);
  // LA GRILLE DE PRIX — ici et NULLE PART AILLEURS. C'est une jointure sur une
  // table fille : la payer sur list-properties ou discover-feed, c'est la payer
  // 50 a 100 fois par page, sur 3G. L'ecran de reservation est le seul qui en
  // a besoin, et il n'ouvre qu'un bien a la fois.
  const { data: rates, error: eRates } = await sb
    .from('property_rates')
    .select('kind, units, price_minor')
    .eq('property_id', (prop as { id: string }).id)
    .order('units', { ascending: true });
  if (eRates) console.error('[get-property] rates error:', eRates);

  return {
    body: {
      property: {
        ...mapProperty(prop as PropertyRow, photoUrls),
        rates: ((rates as { kind: string; units: number; price_minor: number }[] | null) ?? []).map((r) => ({
          kind: r.kind as 'block' | 'tier',
          units: Number(r.units),
          priceMinor: Number(r.price_minor),
        })),
      },
    },
  };
}));
