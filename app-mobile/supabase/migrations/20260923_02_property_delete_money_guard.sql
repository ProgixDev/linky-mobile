-- UNE ANNONCE QUI PORTE DE L'ARGENT EN SEQUESTRE NE SE SUPPRIME PAS.
--
-- Trouve par la relecture adversariale du 2026-09-23, en marge de la
-- fonctionnalite « annuler jusqu'a 48 h avant » (20260923_01).
--
-- LE SCENARIO. Un locataire reserve au mois, paie : confirm_booking_payment
-- credite le sequestre de total_minor, la reservation passe 'paid', le bien
-- passe 'reserved'. Le lendemain, le bailleur supprime son annonce depuis son
-- tableau de bord. property-delete ne verifiait que owner_id ; la ligne
-- properties partait, et avec elle la reservation — bookings.property_id est
-- `on delete cascade` (20260706_01:18) — ainsi que la payment_intent
-- (20260729_05:16). Le credit restait sur le wallet du sequestre avec un ref_id
-- pointant dans le vide : ledger_entries n'a aucune cle etrangere vers bookings
-- et interdit la suppression (append-only). Les trois fonctions capables de
-- rendre l'argent — cancel_paid_booking, admin_resolve_booking, release_booking —
-- lisent toutes la reservation d'abord et repondaient BOOKING_NOT_FOUND. Plus
-- aucun chemin produit ne rendait l'argent, pas meme pour l'equipe.
--
-- POURQUOI UN TRIGGER EN PLUS DE LA GARDE APPLICATIVE. La garde vit desormais
-- dans property-delete, en miroir de la Garde 3 de delete-account. Mais c'est
-- precisement l'ABSENCE de cette garde a un seul endroit qui a cree le trou :
-- la meme suppression peut venir d'une console d'administration, d'un script de
-- reprise, d'une future fonction. La regle appartient donc aussi a la base.
--
-- POURQUOI PAS `on delete restrict` SUR LA CLE ETRANGERE. Ce serait plus simple
-- mais trop large : la contrainte porterait sur TOUTE reservation, y compris une
-- annulee ou terminee il y a six mois. Un bailleur ne pourrait plus jamais
-- supprimer une annonce ayant eu la moindre reservation, et delete-account —
-- qui supprime les biens d'un compte apres avoir verifie qu'aucune reservation
-- n'est ouverte — echouerait sur ces lignes historiques. Le trigger ne bloque
-- que les trois statuts ou de l'argent dort : exactement OPEN_BOOKING_STATUSES.
create or replace function public.forbid_delete_property_with_escrow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  select count(*) into v_n
    from public.bookings b
   where b.property_id = old.id
     and b.status in ('paid', 'active', 'disputed');
  if v_n > 0 then
    raise exception
      'PROPERTY_HAS_ESCROW_BOOKINGS: % réservation(s) avec de l''argent en séquestre sur le bien %',
      v_n, old.id
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke all on function public.forbid_delete_property_with_escrow() from public, anon, authenticated;

drop trigger if exists trg_forbid_delete_property_with_escrow on public.properties;
create trigger trg_forbid_delete_property_with_escrow
  before delete on public.properties
  for each row execute function public.forbid_delete_property_with_escrow();
