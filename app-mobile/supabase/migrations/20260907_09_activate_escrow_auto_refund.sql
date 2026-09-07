-- Allumer le remboursement automatique du sequestre.
--
-- CE QUE CE FICHIER FAIT, ET RIEN D'AUTRE : il leve les deux verrous poses par
-- 20260907_06. Aucune logique nouvelle, aucun code. La machinerie est en place
-- et tourne a vide depuis son installation.
--
-- LES TROIS PREALABLES, TOUS REMPLIS :
--   1. Les CGU enoncent la regle. Section « Sequestre et delai de confirmation »
--      en ligne sur linkygroup.com/legal/terms depuis le 2026-09-07 (197b406).
--      Une regle que personne n'a lue n'est opposable a personne.
--   2. Le chemin qui deplace l'argent a ete EPROUVE sur la production, dans une
--      transaction volontairement avortee : statut -> refunded, sequestre
--      10 300 -> 0, acheteur 0 -> 10 300, ecritures appariees, rien commite.
--   3. Un filet manuel existe : admin_force_resolve_order, joignable depuis le
--      bouton « Debloquer » de la console admin (afe9b0b).
--
-- POURQUOI LA DATE EST POSEE A now() ET PAS DANS LE PASSE. Seules les commandes
-- dont le sequestre a ete credite APRES cet instant deviennent eligibles. Les
-- deux commandes encore bloquees (LK-2026-10065 du 21 aout, LK-2026-10067 du
-- 22 aout) en sont donc exclues DEFINITIVEMENT — leurs acheteurs n'ont jamais
-- su qu'un delai existait, et on n'applique pas retroactivement une regle
-- inconnue. Elles restent traitables a la main par le bouton « Debloquer ».
--
-- CE QUI SE PASSE ENSUITE, CONCRETEMENT. Le balayage tourne chaque nuit a 4h37.
-- Aucune commande ne pouvant avoir 7 jours avant le 14 septembre, il ne fera
-- rien pendant une semaine : d'abord silence, puis les premiers rappels au 3e
-- jour, puis les premiers remboursements. La montee est douce par construction,
-- ce qui laisse le temps de lire les rapports avant que le premier franc bouge.
--
-- IDEMPOTENTE. La date n'est posee que si elle est encore nulle : rejouer ce
-- fichier ne la repousse pas. La repousser reduirait le nombre de commandes
-- eligibles sans prevenir personne — un changement de politique silencieux.

update public.platform_settings
   set value = to_jsonb(now()::text),
       updated_at = now()
 where key = 'escrow_auto_refund_active_from'
   and (value is null or value = 'null'::jsonb);

update public.platform_settings
   set value = 'true'::jsonb,
       updated_at = now()
 where key = 'escrow_auto_refund_enabled';
