// « Télécharger mes données » (client 2026-08-06). Replaces the honest
// "Bientôt — écris-nous" placeholder with a real, self-serve export : gathers
// the caller's own data across the main tables and emails it as a JSON
// attachment to their own registered address. Scoped to what the caller can
// see about themselves in the app already (profile, contacts, addresses,
// their own listings, their own orders, reviews/comments they wrote) — not
// every internal table (ledger internals, admin-only fields, etc).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { buildDataExportPdf } from '@shared/pdf-export.ts';

// No input beyond auth — the export is always "everything about ME".
interface Body { [key: string]: never }
function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/privacy/export-my-data', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);

  const [profile, emails, phones, addresses, shops, properties, ordersAsBuyer, reviewsWritten, commentsWritten] =
    await Promise.all([
      sb.from('users').select('id, display_name, city, roles, kyc_status, profile_public, created_at').eq('id', userId).maybeSingle(),
      sb.from('emails').select('address, is_primary, verified_at, created_at').eq('user_id', userId),
      sb.from('phones').select('e164, carrier, is_primary, verified_at, created_at').eq('user_id', userId),
      sb.from('addresses').select('label, city, district, is_default, created_at').eq('user_id', userId),
      sb.from('shops').select('id, name, city, created_at').eq('owner_id', userId),
      // properties carry owner_id directly ; products don't (ownership flows
      // through shop_id -> shops.owner_id), so those are fetched below once
      // we have this account's shop ids.
      sb.from('properties').select('id, title, type, price_minor, status, created_at').eq('owner_id', userId),
      sb.from('orders').select('reference, status, total_minor, currency, created_at').eq('buyer_id', userId),
      sb.from('reviews').select('shop_id, rating, comment, created_at').eq('reviewer_id', userId),
      sb.from('comments').select('listing_kind, listing_id, body, created_at').eq('author_id', userId),
    ]);

  const shopIds = ((shops.data as { id: string }[] | null) ?? []).map((s) => s.id);
  const products = shopIds.length
    ? await sb.from('products').select('id, title, price_minor, status, created_at').in('shop_id', shopIds)
    : { data: [] as unknown[], error: null };

  for (const [name, res] of Object.entries({
    profile, emails, phones, addresses, shops, products, properties, ordersAsBuyer, reviewsWritten, commentsWritten,
  })) {
    if (res.error) console.error(`[export-my-data] ${name} query error:`, res.error);
  }

  if (!profile.data) throwApi('INTERNAL_ERROR', 500, 'Erreur lecture profil');

  const primaryEmail =
    (emails.data as { address: string; is_primary: boolean }[] | null)?.find((e) => e.is_primary)?.address
    ?? (emails.data as { address: string }[] | null)?.[0]?.address;
  if (!primaryEmail) {
    throwApi('NO_EMAIL', 400, "Aucun email vérifié sur ce compte — impossible d'envoyer l'export.");
  }

  const bundle = {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    emails: emails.data ?? [],
    phones: phones.data ?? [],
    addresses: addresses.data ?? [],
    shops: shops.data ?? [],
    products: products.data ?? [],
    properties: properties.data ?? [],
    orders_as_buyer: ordersAsBuyer.data ?? [],
    reviews_written: reviewsWritten.data ?? [],
    comments_written: commentsWritten.data ?? [],
  };
  // PDF plutot que JSON (client 2026-08-11) : l'utilisateur recevait un dump
  // machine, illisible pour un non-developpeur. Genere cote serveur — rendre du
  // HTML en PDF sur le telephone demanderait un module NATIF, donc un nouveau
  // build, or le client teste par mises a jour a distance.
  const pdf = await buildDataExportPdf(bundle);

  // btoa attend une chaine ; String.fromCharCode(...bytes) sur un tableau de
  // plusieurs dizaines de milliers d'octets DEPASSE la pile d'arguments et
  // plante. On encode par tranches.
  let binaire = '';
  for (let i = 0; i < pdf.length; i += 8192) {
    binaire += String.fromCharCode(...pdf.subarray(i, i + 8192));
  }
  const attachmentBase64 = btoa(binaire);

  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0A5240;margin:0 0 8px">Linky</h2>
    <p>Voici l'export de tes données personnelles, en pièce jointe.</p>
    <p style="color:#666">Si tu n'as pas demandé cet export, ignore cet email.</p>
  </div>`;
  const nomFichier = 'linky-mes-donnees.pdf';

  // Resend needs RESEND_FROM (a domain-verified sender) which isn't configured
  // yet — falls through to the landing's Gmail relay, the SAME delivery path
  // already proven live for OTP emails. Flipping RESEND_FROM later switches
  // this over with no code change, exactly like otp-request's own fallback.
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const resendFrom = Deno.env.get('RESEND_FROM');
  if (resendKey && resendFrom) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: resendFrom,
          to: [primaryEmail],
          subject: 'Tes données Linky',
          html,
          attachments: [{ filename: nomFichier, content: attachmentBase64 }],
        }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[export-my-data] resend delivery failed:', r.status, detail.slice(0, 400));
        throwApi('EXPORT_DELIVERY_FAILED', 502, "Envoi de l'export impossible. Réessaie plus tard.");
      }
      return { body: { sent: true, to: primaryEmail } };
    } catch (e) {
      console.error('[export-my-data] resend fetch threw:', e);
      throwApi('EXPORT_DELIVERY_FAILED', 502, "Envoi de l'export impossible. Réessaie plus tard.");
    }
  }

  const landingUrl = Deno.env.get('LANDING_OTP_URL');
  const emailSecret = Deno.env.get('OTP_EMAIL_SECRET');
  if (!landingUrl || !emailSecret) {
    throwApi('EXPORT_UNAVAILABLE', 503, 'Export momentanément indisponible. Réessaie plus tard.');
  }
  try {
    const r = await fetch(`${landingUrl}/api/send-mail`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-otp-secret': emailSecret },
      body: JSON.stringify({
        to: primaryEmail,
        subject: 'Tes données Linky',
        html,
        attachmentFilename: nomFichier,
        attachmentContentBase64: attachmentBase64,
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('[export-my-data] landing relay delivery failed:', r.status, detail.slice(0, 400));
      throwApi('EXPORT_DELIVERY_FAILED', 502, "Envoi de l'export impossible. Réessaie plus tard.");
    }
  } catch (e) {
    console.error('[export-my-data] landing relay fetch threw:', e);
    throwApi('EXPORT_DELIVERY_FAILED', 502, "Envoi de l'export impossible. Réessaie plus tard.");
  }

  return { body: { sent: true, to: primaryEmail } };
}));
