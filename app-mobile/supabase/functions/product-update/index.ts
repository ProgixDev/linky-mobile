// Update a product the caller owns. Only the product owner (= shop owner) may edit.
// Any field except id/shop_id/created_at/view_count/fav_count is editable; counts/boosted
// are denormalized caches updated by other endpoints (favorite-toggle, boost flow, etc.).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapProduct, type ProductRow } from '@shared/catalog.ts';
import { isValidCategory, isValidCondition } from '@shared/categories.ts';

import { validVariants, variantsPayload, type VariantBody } from '@shared/variants.ts';

interface Body {
  id: string;
  title?: string;
  description?: string;
  price_minor?: number;
  is_gift?: boolean;
  variants?: VariantBody[];
  category?: string;
  condition?: 'neuf' | 'occasion' | 'reconditionné';
  photos?: string[];
  video_url?: string | null;
  city?: string;
  district?: string | null;
  status?: 'active' | 'reserved' | 'sold' | 'paused' | 'pending';
  stock?: number | null;
}

const URL_RE = /^https?:\/\/[^\s]{8,500}$/i;
const STATUSES = ['active','reserved','sold','paused','pending'] as const;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.id)) return false;
  if (x.title !== undefined && (typeof x.title !== 'string' || x.title.trim().length < 3 || x.title.length > 120)) return false;
  if (x.description !== undefined && (typeof x.description !== 'string' || x.description.length > 2000)) return false;
  if (x.is_gift !== undefined && typeof x.is_gift !== 'boolean') return false;
  if (!validVariants(x.variants)) return false;
  if (x.price_minor !== undefined && (typeof x.price_minor !== 'number' || !Number.isInteger(x.price_minor) || x.price_minor < 0 || x.price_minor > 1e12)) return false;
  if (x.category !== undefined && !isValidCategory(x.category)) return false;
  if (x.condition !== undefined && !isValidCondition(x.condition)) return false;
  if (x.photos !== undefined) {
    if (!Array.isArray(x.photos) || x.photos.length > 8) return false;
    if (!x.photos.every((p) => typeof p === 'string' && URL_RE.test(p))) return false;
  }
  if (x.video_url !== undefined && x.video_url !== null && (typeof x.video_url !== 'string' || !URL_RE.test(x.video_url))) return false;
  if (x.city !== undefined && (typeof x.city !== 'string' || x.city.trim().length < 2 || x.city.length > 80)) return false;
  if (x.district !== undefined && x.district !== null && (typeof x.district !== 'string' || x.district.length > 80)) return false;
  if (x.stock !== undefined && x.stock !== null &&
      (typeof x.stock !== 'number' || !Number.isInteger(x.stock) || x.stock < 0 || x.stock > 100000)) return false;
  if (x.status !== undefined && !(STATUSES as readonly string[]).includes(x.status as string)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/products/update', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Ownership check: product → shop → owner. Single join via the FK.
  const { data: own, error: eOwn } = await sb
    .from('products').select('id, shop_id, status, has_variants, shops!inner(owner_id)')
    .eq('id', body.id).maybeSingle();
  if (eOwn) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!own) throwApi('PRODUCT_NOT_FOUND', 404, 'Produit introuvable.');
  // Moderation takedown is admin-final : a removed listing accepts NO seller
  // edits (otherwise status could be flipped back to 'active'). Reinstatement
  // goes through the admin moderate-listing 'approve'.
  if ((own as { status?: string }).status === 'removed') {
    throwApi('LISTING_REMOVED', 403, 'Cette annonce a été retirée par la modération.');
  }
  // PostgREST hints: inner-joined column path is shops.owner_id; tolerate object or array shapes.
  const ownerId = Array.isArray((own as { shops: unknown }).shops)
    ? ((own as { shops: { owner_id: string }[] }).shops[0]?.owner_id)
    : (own as { shops: { owner_id: string } }).shops?.owner_id;
  if (ownerId !== userId) throwApi('FORBIDDEN', 403, 'Action refusée.');

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined)       patch.title = body.title.trim();
  if (body.description !== undefined) patch.description = body.description.trim();
  // ┌─ LA MISE A JOUR PARTIELLE, PIEGE LE PLUS BANAL ────────────────────────┐
  // Basculer une annonce existante en don, puis changer d'avis, est le geste
  // le plus courant du vendeur — et les deux sens cassent si on se contente de
  // recopier les champs recus.
  //
  //   is_gift=true sans prix  -> on FORCE 0, sinon l'ancien prix reste et la
  //                              contrainte de base rejette avec un 500 opaque.
  //   is_gift=false sans prix -> on refuse EXPLICITEMENT : sans nouveau prix
  //                              l'annonce resterait a 0, donc invendable, et
  //                              le vendeur ne saurait pas pourquoi.
  // └────────────────────────────────────────────────────────────────────────┘
  if (body.is_gift === true) {
    patch.is_gift = true;
    patch.price_minor = 0;
  } else if (body.is_gift === false) {
    if (body.price_minor === undefined || body.price_minor <= 0) {
      throwApi('PRICE_REQUIRED', 400,
        'Indique un prix pour remettre cet article en vente.');
    }
    patch.is_gift = false;
    patch.price_minor = body.price_minor;
  } else if (body.price_minor !== undefined) {
    // Le drapeau n'est pas touche : un prix nul n'a de sens que si l'annonce
    // est deja un don, et la base tranchera.
    patch.price_minor = body.price_minor;
  }
  if (body.category !== undefined)    patch.category = body.category;
  if (body.condition !== undefined)   patch.condition = body.condition;
  if (body.photos !== undefined)      patch.photos = body.photos;
  if (body.video_url !== undefined)   patch.video_url = body.video_url;
  // LE STOCK N'EST PAS ECRIVABLE SUR UNE ANNONCE A DECLINAISONS. Il y est
  // CALCULE — la somme des combinaisons actives, posee par la remontee. L'ecran
  // de modification envoie `stock` a CHAQUE enregistrement, y compris quand le
  // vendeur n'a change que le titre : sans cette garde, un simple changement de
  // photo ecraserait l'agregat par une valeur perimee, et le stock affiche
  // mentirait durablement sans que rien ne le signale.
  const willHaveVariants = body.variants !== undefined
    ? body.variants.length > 0
    : ((own as { has_variants?: boolean }).has_variants ?? false);
  if (body.stock !== undefined && !willHaveVariants) patch.stock = body.stock;
  if (body.city !== undefined)        patch.city = body.city.trim();
  if (body.district !== undefined)    patch.district = body.district === null ? null : body.district.trim() || null;
  if (body.status !== undefined)      patch.status = body.status;

  // ── LA MATRICE ET LE PATCH, DANS L'ORDRE QUE LE GESTE IMPOSE ─────────────
  // ┌─ POURQUOI CE N'EST PAS UNE QUESTION DE STYLE ──────────────────────────┐
  // La contrainte products_gift_has_no_variants refuse qu'une annonce soit A LA
  // FOIS un don et a declinaisons. Les deux gestes legitimes se croisent donc,
  // et ils exigent des ordres OPPOSES :
  //
  //   « cette annonce a tailles devient un don »  -> is_gift=true, variants=[]
  //     La MATRICE D'ABORD : sinon le patch pose is_gift alors que
  //     has_variants vaut encore true, et la contrainte le refuse.
  //
  //   « ce don redevient un article a tailles »   -> is_gift=false, variants=[...]
  //     LE PATCH D'ABORD : sinon replace_product_variants relit is_gift EN BASE,
  //     le trouve encore a true, et leve GIFT_HAS_NO_VARIANTS — un message qui
  //     reproche au vendeur un etat qu'il vient precisement de supprimer dans le
  //     meme formulaire. Et comme le refus interrompt tout, son nouveau prix et
  //     son nouveau titre etaient perdus avec.
  //
  // Ce second sens est le SEUL chemin que l'interface propose pour decliner un
  // article donne (la matrice n'apparait qu'une fois « A donner » decoche) : il
  // etait donc systematiquement refuse.
  // └────────────────────────────────────────────────────────────────────────┘
  async function writeVariants(): Promise<void> {
    if (body.variants !== undefined) {
      const { error: eVar } = await sb.rpc('replace_product_variants', {
        p_product_id: body.id,
        p_variants: variantsPayload(body.variants),
      });
      if (eVar) {
        const vm = (eVar as { message?: string } | null)?.message ?? '';
        console.error('[product-update] variants error:', eVar);
        if (vm.includes('LIVE_ORDERS')) {
          throwApi('LIVE_ORDERS', 409,
            "Des commandes sont en cours sur cet article. Tu pourras ajouter des tailles et des couleurs une fois qu'elles seront terminees.");
        }
        if (vm.includes('GIFT_HAS_NO_VARIANTS')) {
          throwApi('GIFT_HAS_NO_VARIANTS', 400,
            "Un article a donner ne se decline pas en tailles ni en couleurs.");
        }
        if (vm.includes('TOO_MANY_VARIANTS')) {
          throwApi('TOO_MANY_VARIANTS', 400, 'Vingt combinaisons au maximum.');
        }
        if (vm.includes('VARIANT_PRICE_PARTIAL')) {
          throwApi('INVALID_BODY', 400, 'Un prix doit etre indique sur toutes les combinaisons, ou sur aucune.');
        }
        throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement des declinaisons');
      }
    }
  }

  // Sortie du don : le patch d'abord, pour que la RPC lise le bon etat.
  const leavingGift = body.is_gift === false;
  if (!leavingGift) await writeVariants();

  const { data, error } = await sb
    .from('products').update(patch).eq('id', body.id)
    .select('id, shop_id, title, description, price_minor, category, condition, status, photos, video_url, boosted, view_count, fav_count, city, district, stock, is_gift, created_at')
    .single();
  if (error || !data) {
    console.error('[product-update] update error:', error);
    // Cocher « a donner » sans retirer la matrice : la contrainte de base tranche,
    // et son message ne veut rien dire pour un vendeur.
    const um = (error as { message?: string } | null)?.message ?? '';
    if (um.includes('products_gift_has_no_variants')) {
      throwApi('GIFT_HAS_NO_VARIANTS', 400,
        "Retire d'abord les tailles et les couleurs : un article a donner ne se decline pas.");
    }
    throwApi('INTERNAL_ERROR', 500, 'Erreur mise à jour');
  }

  if (leavingGift) await writeVariants();

  return { body: { product: mapProduct(data as ProductRow) } };
}));
