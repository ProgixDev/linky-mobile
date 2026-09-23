// Hard-delete a property the caller owns. property_photos rows cascade via FK on
// properties.id (ON DELETE CASCADE in the Phase E migration). visit_requests also
// cascade. Storage objects are NOT auto-removed — same future sweeper job as products.
//
// ⚠ LA CASCADE EMPORTE AUSSI LES RESERVATIONS, ET AVEC ELLES L'ARGENT DU
// LOCATAIRE. bookings.property_id est `on delete cascade` (20260706_01:18).
// Supprimer une annonce qui porte une reservation PAYEE effacait donc la
// reservation pendant que le sequestre gardait son credit, avec un ref_id
// pointant sur une ligne disparue — et ledger_entries n'a pas de cle etrangere
// vers bookings, ni de suppression possible (append-only). Les trois chemins qui
// rendent l'argent (cancel_paid_booking, admin_resolve_booking, release_booking)
// lisent tous la reservation d'abord : ils repondaient BOOKING_NOT_FOUND. Le
// bailleur pouvait ainsi annuler d'un geste la « securite pour le client »
// demandee le 2026-09-23, et l'equipe n'avait plus aucun bouton pour rembourser.
// La garde ci-dessous est le miroir exact de la Garde 3 de delete-account, qui
// refuse depuis toujours de supprimer un compte portant une reservation
// 'paid'/'active'/'disputed'. Doublee cote base par un trigger (20260923_02),
// pour qu'un autre chemin d'ecriture ne puisse pas la contourner.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { id: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.id === 'string' && /^[0-9a-f-]{36}$/i.test(x.id);
}

Deno.serve(makePost<Body>('/v1/properties/delete', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: own, error: eOwn } = await sb
    .from('properties').select('id, owner_id')
    .eq('id', body.id).maybeSingle();
  if (eOwn) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!own) throwApi('PROPERTY_NOT_FOUND', 404, 'Annonce introuvable.');
  if ((own as { owner_id: string }).owner_id !== userId) throwApi('FORBIDDEN', 403, 'Action refusée.');

  // Memes statuts que delete-account : ceux ou de l'argent dort en sequestre.
  const { count: openBookings, error: eBk } = await sb
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', body.id)
    .in('status', ['paid', 'active', 'disputed']);
  if (eBk) { console.error('[property-delete] bookings:', eBk); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if ((openBookings ?? 0) > 0) {
    throwApi('OPEN_BOOKINGS', 409,
      "Une réservation payée est en cours sur cette annonce. Elle doit se terminer — ou être annulée et remboursée — avant la suppression.");
  }

  const { error } = await sb.from('properties').delete().eq('id', body.id);
  if (error) {
    console.error('[property-delete] error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur suppression');
  }
  return { body: { deleted: true } };
}));
