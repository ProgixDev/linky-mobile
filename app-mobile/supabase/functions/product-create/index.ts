// Create a product owned by one of the caller's shops. If no shop_id is provided AND the
// caller has no shop, auto-create a default "Ma boutique" so the create wizard works
// without a separate "set up your shop first" step. The shop can be renamed later via shop-upsert.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapProduct, type ProductRow } from '@shared/catalog.ts';
import { isValidCategory, isValidCondition } from '@shared/categories.ts';
import { diditConfig, kycRequiredToPublish } from '@shared/didit.ts';

interface Body {
  shop_id?: string;
  /** Étape 1 du tunnel. Optionnel : les bundles antérieurs ne l'envoient pas. */
  seller_type?: 'particular' | 'merchant';
  title: string;
  description?: string;
  price_minor: number;
  /** « A donner » : l'article est cede gratuitement. Force price_minor a 0. */
  is_gift?: boolean;
  /** Declinaisons taille / couleur. Absentes = annonce simple. */
  variants?: VariantBody[];
  category: string;
  condition: 'neuf' | 'occasion' | 'reconditionné';
  photos: string[];
  video_url?: string;
  city: string;
  district?: string;
  stock?: number | null;
  // Only meaningful the first time a seller publishes (no shop yet) — the
  // pin picked on the new create/product/location step, threaded through so
  // the auto-created shop doesn't land on the city centroid.
  shop_lat?: number;
  shop_lng?: number;
}

import { validVariants, variantsPayload, type VariantBody } from '@shared/variants.ts';

const URL_RE = /^https?:\/\/[^\s]{8,500}$/i;

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.shop_id !== undefined && !isUuid(x.shop_id)) return false;
  if (x.seller_type !== undefined && x.seller_type !== 'particular' && x.seller_type !== 'merchant') return false;
  if (typeof x.title !== 'string' || x.title.trim().length < 3 || x.title.length > 120) return false;
  if (x.description !== undefined && (typeof x.description !== 'string' || x.description.length > 2000)) return false;
  if (x.is_gift !== undefined && typeof x.is_gift !== 'boolean') return false;
  if (!validVariants(x.variants)) return false;
  // UN DON A UN PRIX DE ZERO, et c'est le SEUL cas ou zero est accepte. La
  // base pose la meme regle dans les deux sens (products_gift_price_check) :
  // ici on refuse tot, avec un message, plutot que de laisser remonter une
  // violation de contrainte que le vendeur ne comprendrait pas.
  if (typeof x.price_minor !== 'number' || !Number.isInteger(x.price_minor) || x.price_minor > 1e12) return false;
  if (x.is_gift === true ? x.price_minor !== 0 : x.price_minor <= 0) return false;
  if (!isValidCategory(x.category)) return false;
  if (!isValidCondition(x.condition)) return false;
  if (!Array.isArray(x.photos) || x.photos.length > 8) return false;
  if (!x.photos.every((p) => typeof p === 'string' && URL_RE.test(p))) return false;
  if (x.video_url !== undefined && (typeof x.video_url !== 'string' || !URL_RE.test(x.video_url))) return false;
  if (typeof x.city !== 'string' || x.city.trim().length < 2 || x.city.length > 80) return false;
  if (x.district !== undefined && (typeof x.district !== 'string' || x.district.length > 80)) return false;
  // Quantite disponible. null/absent = non renseignee, donc sans plafond.
  if (x.stock !== undefined && x.stock !== null &&
      (typeof x.stock !== 'number' || !Number.isInteger(x.stock) || x.stock < 0 || x.stock > 100000)) return false;
  if (x.shop_lat !== undefined && (typeof x.shop_lat !== 'number' || x.shop_lat < -90 || x.shop_lat > 90)) return false;
  if (x.shop_lng !== undefined && (typeof x.shop_lng !== 'number' || x.shop_lng < -180 || x.shop_lng > 180)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/products/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Phase T.1 — gate on role + KYC BEFORE the (auto-creating) shop work, so
  // a pure buyer probing this endpoint can never end up with a phantom
  // "Ma boutique" row. Both checks are pulled in a single read.
  const { data: caller, error: eCaller } = await sb
    .from('users')
    .select('roles, kyc_status, display_name')
    .eq('id', userId)
    .single();
  if (eCaller || !caller) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  const roles: string[] = Array.isArray(caller.roles) ? (caller.roles as string[]) : [];
  if (!roles.includes('seller')) {
    throwApi('ROLE_REQUIRED', 403, 'Active le rôle vendeur dans ton profil pour publier.');
  }
  // Publishing no longer requires ID verification by default (client
  // 2026-08-05 — most sellers in Guinea have no ID document, which blocked
  // them from listing at all). Re-enable with LINKY_KYC_REQUIRED_TO_PUBLISH=1.
  if (kycRequiredToPublish() && diditConfig() && caller.kyc_status !== 'approved') {
    throwApi('KYC_REQUIRED', 403, "Vérifie ton identité pour publier — c'est rapide.");
  }

  let shopId = body.shop_id;
  if (shopId) {
    // Verify ownership: the shop must belong to the caller.
    const { data: owned, error } = await sb
      .from('shops').select('id').eq('id', shopId).eq('owner_id', userId)
      .eq('kind', 'shop').maybeSingle();
    if (error) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    if (!owned) throwApi('SHOP_NOT_FOUND', 404, 'Boutique introuvable.');
  } else {
    // The caller's BOUTIQUE specifically — boutique and agence are separate
    // profiles since 2026-08-07 (shops.kind), so this must never fall back to
    // their agency.
    const { data: existing, error: eList } = await sb
      .from('shops').select('id').eq('owner_id', userId).eq('kind', 'shop')
      .maybeSingle();
    if (eList) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    if (existing) {
      shopId = existing.id as string;
    } else {
      // Personalize the auto-created shop from the owner's first name so buyers
      // never see a generic « Ma boutique » (which read like « my shop » on
      // every listing). Falls back to « Ma boutique » when the name is unset.
      // UN PARTICULIER N'EST PAS UNE BOUTIQUE. Il vend son propre canape, une
      // fois ; l'afficher sous « Boutique de Mamadou » ment a l'acheteur sur
      // ce qu'il a en face de lui, et la confiance est precisement ce que
      // Linky vend. Il parait donc sous son NOM.
      const fullName = String(caller.display_name ?? '').trim();
      const firstName = fullName.split(/\s+/)[0];
      const shopName = body.seller_type === 'particular'
        ? (fullName || 'Mes annonces')
        : (firstName ? `Boutique de ${firstName}` : 'Ma boutique');
      const { data: created, error: eIns } = await sb
        .from('shops')
        .insert({
          owner_id: userId, name: shopName, city: body.city.trim(), about: '', kind: 'shop',
          lat: body.shop_lat ?? null, lng: body.shop_lng ?? null,
        })
        .select('id').single();
      if (eIns || !created) {
        console.error('[product-create] auto-shop insert error:', eIns);
        throwApi('INTERNAL_ERROR', 500, 'Erreur création boutique');
      }
      shopId = created.id as string;
    }
  }

  // ┌─ PUBLIER EN DEUX TEMPS, ET SEULEMENT SI LA MATRICE SUIT ──────────────┐
  // Une annonce a declinaisons s'ecrit en DEUX appels : la ligne produit, puis
  // la matrice. Les inserer tous les deux `active` rendait le premier temps
  // publiable a lui seul : si le second echouait, le vendeur lisait une erreur
  // pendant que son annonce etait EN LIGNE et ACHETABLE sans aucune taille — et
  // chaque reessai en publiait une de plus, la reservation d'idempotence etant
  // annulee sur exception.
  //
  // `pending` est la reponse, et elle ne coute rien a inventer : `get-product`
  // et `place_order_multi` exigent tous deux `status = 'active'`, donc la
  // fenetre est invisible ET incommandable de bout en bout. Le vendeur, lui,
  // voit tous ses status dans son propre stock (`list-products`), donc rien ne
  // disparait a ses yeux.
  //
  // On ne le fait QUE s'il y a vraiment une matrice a ecrire : une annonce
  // simple n'a pas de second temps, et la mettre en attente ajouterait une
  // fenetre d'echec la ou il n'y en avait aucune.
  // └──────────────────────────────────────────────────────────────────────┘
  const stageInactive = body.variants !== undefined && body.variants.length > 0;

  const insert = {
    shop_id: shopId,
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    price_minor: body.is_gift ? 0 : body.price_minor,
    is_gift: body.is_gift ?? false,
    category: body.category,
    condition: body.condition,
    photos: body.photos,
    video_url: body.video_url ?? null,
    city: body.city.trim(),
    district: body.district?.trim() || null,
    stock: body.stock ?? null,
    status: stageInactive ? 'pending' : 'active',
  };
  const { data, error } = await sb
    .from('products')
    .insert(insert)
    .select('id, shop_id, title, description, price_minor, category, condition, status, photos, video_url, boosted, view_count, fav_count, city, district, stock, is_gift, created_at')
    .single();
  if (error || !data) {
    console.error('[product-create] insert error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur création produit');
  }

  // ── LE SECOND TEMPS : LA MATRICE ──────────────────────────────────────────
  // replace_product_variants fait un DIFF : elle pose ce qui arrive, MASQUE ce
  // qui disparait mais a deja ete commande (sinon order_items.variant_id
  // pointerait dans le vide), et supprime le reste. Elle REFUSE de convertir
  // une annonce qui retient encore des unites : products.stock deviendrait un
  // agregat, et la reservation d'un acheteur qui a deja paye s'evaporerait.
  //
  // ET ON NE L'APPELLE PAS POUR RIEN. Tout le monde envoie `variants` : une
  // annonce simple comme un don en envoient un tableau VIDE. Sur une annonce qui
  // vient de naitre, la fonction n'a alors litteralement rien a faire — pas une
  // ligne a poser, a masquer ni a supprimer — elle ne prend qu'un verrou.
  // L'appeler quand meme coutait un aller-retour a chaque publication (3G) et,
  // surtout, ouvrait une fenetre d'echec la ou il n'y en avait aucune.
  if (stageInactive) {
    const { error: eVar } = await sb.rpc('replace_product_variants', {
      p_product_id: (data as { id: string }).id,
      p_variants: variantsPayload(body.variants),
    });
    if (eVar) {
      const vm = (eVar as { message?: string } | null)?.message ?? '';
      console.error('[product-create] variants error:', eVar);
      // RIEN NE DOIT SURVIVRE A CET ECHEC. La ligne est encore `pending`, donc
      // deja invisible et incommandable ; on la retire quand meme, sinon chaque
      // reessai du vendeur empilerait un brouillon de plus dans son stock. La
      // cle etrangere des declinaisons est en ON DELETE CASCADE, et la fonction
      // ayant echoue est atomique : il n'y a de toute facon aucune combinaison a
      // emporter.
      //
      // Au pire, la suppression echoue a son tour : la ligne reste `pending`,
      // c'est-a-dire exactement l'etat sur : pas de client, pas de commande.
      // C'est pour cela que l'invisibilite vient du status et non de ce nettoyage.
      const { error: eDel } = await sb.from('products').delete().eq('id', (data as { id: string }).id);
      if (eDel) console.error('[product-create] rollback delete error:', eDel);
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

  // MAINTENANT l'annonce existe en entier : on la publie. Un echec ici laisse
  // une annonce complete mais invisible ; on la retire et on echoue, pour que le
  // vendeur reessaie une fois plutot que de croire avoir publie.
  if (stageInactive) {
    const { error: ePub } = await sb
      .from('products').update({ status: 'active' }).eq('id', (data as { id: string }).id);
    if (ePub) {
      console.error('[product-create] publish error:', ePub);
      const { error: eDel } = await sb.from('products').delete().eq('id', (data as { id: string }).id);
      if (eDel) console.error('[product-create] rollback delete error:', eDel);
      throwApi('INTERNAL_ERROR', 500, "Erreur publication de l'annonce");
    }
  }

  // RELECTURE : la remontee declenchee par la matrice vient de poser
  // has_variants et de recalculer le stock. Renvoyer la ligne d'avant ferait
  // afficher au vendeur une annonce « sans declinaison » qu'il vient pourtant
  // de creer avec.
  if (stageInactive) {
    const { data: fresh } = await sb
      .from('products')
      .select('id, shop_id, title, description, price_minor, category, condition, status, photos, video_url, boosted, view_count, fav_count, city, district, stock, is_gift, has_variants, variant_sizes, variant_colors, created_at')
      .eq('id', (data as { id: string }).id)
      .maybeSingle();
    if (fresh) return { body: { product: mapProduct(fresh as ProductRow) } };
  }

  return { body: { product: mapProduct(data as ProductRow) } };
}));
