-- ============================================================================
-- Effacer les signatures de locataire apposees AVANT paiement.
-- Client 2026-08-22 : « il faut faire la signature apres le paiement du client,
-- pas avant ».
--
-- L'ORIGINE : booking-sign-pay tamponnait tenant_signed_at au moment ou la page
-- de paiement s'OUVRAIT, pas quand le paiement aboutissait. Un locataire qui
-- refermait la page sans payer laissait donc un contrat portant sa signature et
-- aucun paiement — visible a l'ecran comme « Signature locataire ✔ 21/08/2026 »
-- sous « en attente du paiement ». Un contrat signe engage ; il ne doit pas
-- exister avant l'encaissement.
--
-- Le code est corrige (le tampon anticipe est retire, seul
-- confirm_booking_payment appose desormais la signature). Cette migration
-- repare les lignes deja ecrites.
--
-- PERIMETRE VOLONTAIREMENT ETROIT : uniquement les reservations encore en
-- attente de paiement. On ne touche a AUCUNE reservation payee, active,
-- terminee, en litige ou remboursee — leur signature est legitime, elle a bien
-- suivi un paiement.
--
-- Idempotente : une seconde execution ne trouve plus rien a corriger.
--
-- Applique en prod (mkaddhcjneilvwqethjo) via l'editeur SQL.
-- ============================================================================

update public.bookings
   set tenant_signed_at = null,
       updated_at = now()
 where tenant_signed_at is not null
   and status in ('requested', 'accepted');
