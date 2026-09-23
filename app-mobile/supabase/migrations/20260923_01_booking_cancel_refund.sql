-- ANNULER UNE RESERVATION DEJA PAYEE, JUSQU'A 48 H AVANT L'EMMENAGEMENT.
--
-- Demande du client, 2026-09-23 : « Après la réservation confirmée par les 2
-- parties, ajouter un bouton "Annuler la réservation" jusqu'à 48h avant la date
-- d'emménagement. C'est une sécurité pour le client. »
--
-- CE QUI EXISTAIT, ET CE QUI MANQUAIT. booking-cancel ne couvre que les
-- reservations dont l'argent n'a PAS bouge (requested/accepted) ; son en-tete le
-- dit : « Paid bookings can't be cancelled here — that's the dispute/refund path
-- (V1.1) ». Une fois le sequestre constitue, seul un administrateur pouvait
-- rendre l'argent (admin_resolve_booking, action 'refund'). Le locataire n'avait
-- donc aucune sortie : il devait ouvrir un litige et attendre.
--
-- CETTE FONCTION EST LE MEME REMBOURSEMENT, DECLENCHE PAR LE LOCATAIRE. Elle
-- reprend admin_resolve_booking au caractere pres — resolution des wallets
-- systeme par user_id (jamais les litteraux '…0001' en guise d'id de wallet, la
-- confusion qui avait casse tous les paiements de reservation le 2026-09-09),
-- creation du wallet du locataire s'il n'en a pas, meme ref_type
-- 'booking_refund', meme liberation d'un bien loue au mois. Ce qui change, c'est
-- QUI decide et SOUS QUELLE CONDITION.
--
-- LE TOTAL EST RENDU, frais de service compris : l'annulation intervient avant
-- le sejour, la plateforme n'a rien a facturer. C'est deja le choix fait pour le
-- remboursement administratif.
--
-- LA LIMITE DES 48 H SE MESURE EN HEURE DE CONAKRI, explicitement. start_date
-- est une date : le sejour commence a minuit, heure locale. La fenetre se ferme
-- donc 48 h avant ce minuit — un emmenagement le 10 ne s'annule plus passe le 8
-- a 00:00. Laisser le fuseau de la session Postgres en decider ferait varier la
-- date butoir selon la machine qui appelle.
--
-- LA VENTE EST EXCLUE. Un achat n'a pas de date d'emmenagement, donc pas de
-- fenetre a mesurer ; s'en retirer apres paiement est une autre decision, qui
-- reste entre les mains de l'equipe.
--
-- LE STATUT DEVIENT 'refunded', PAS 'cancelled' : de l'argent a bouge, et le
-- grand livre doit pouvoir le lire. Les deux tombent de toute facon dans la
-- meme pastille « Annulées » cote application (src/lib/bookingFilters.ts).
create or replace function public.cancel_paid_booking(
  p_booking_id uuid,
  p_tenant_id  uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking        record;
  v_escrow_wallet  uuid;
  v_tenant_wallet  uuid;
  v_deadline       timestamptz;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.tenant_id <> p_tenant_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_booking.status <> 'paid' then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  if v_booking.period = 'sale' then
    raise exception 'NOT_CANCELLABLE' using errcode = 'P0001';
  end if;

  -- Minuit du premier jour, heure de Conakry, moins 48 h.
  v_deadline := (v_booking.start_date::timestamp at time zone 'Africa/Conakry')
                - interval '48 hours';
  if now() >= v_deadline then
    raise exception 'CANCEL_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  select id into v_escrow_wallet from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF'
     for update;
  if v_escrow_wallet is null then
    raise exception 'ESCROW_WALLET_MISSING' using errcode = 'P0001';
  end if;

  select id into v_tenant_wallet from public.wallets
   where user_id = v_booking.tenant_id and currency = 'GNF';
  if v_tenant_wallet is null then
    insert into public.wallets (user_id, currency)
      values (v_booking.tenant_id, 'GNF')
      on conflict (user_id, currency) do update set updated_at = now()
      returning id into v_tenant_wallet;
  end if;

  perform public.post_transfer(v_escrow_wallet, v_tenant_wallet, v_booking.total_minor,
                               'booking_refund', p_booking_id);

  -- Un bail au mois libere le bien (miroir du passage en 'reserved' au paiement).
  if v_booking.period = 'month' then
    update public.properties set status = 'active', updated_at = now()
     where id = v_booking.property_id and status = 'reserved';
  end if;

  update public.bookings
     set status = 'refunded',
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(),
           'label', 'Réservation annulée par le locataire — montant remboursé')),
         updated_at = now()
   where id = p_booking_id;

  return 'refunded';
end;
$$;

-- Comme les autres fonctions SECURITY DEFINER (durcissement du 2026-07-29) :
-- Supabase re-accorde EXECUTE par defaut, on revoque.
revoke all on function public.cancel_paid_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_paid_booking(uuid, uuid) to service_role;
