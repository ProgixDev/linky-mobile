-- LE CHEMIN D'ARGENT DES RESERVATIONS ETAIT CASSE DE BOUT EN BOUT.
--
-- Signale par le client le 2026-09-09 : « c'est marque "En attente de paiement"
-- alors que c'est deja paye ». L'ecran disait vrai — aucune reservation n'etait
-- passee en 'paid'. Mais la cause etait bien plus grave que l'affichage.
--
-- CE QUE DISAIT LA BASE. Sur les 12 intentions de paiement de reservation
-- jamais creees, ZERO n'a abouti : 9 expirees, 4 echouees, 2 en attente. Les
-- commandes, sur le MEME rail Orange Money, aboutissent (3 completed, dont une
-- le jour meme). Le rail n'etait donc pas en cause.
--
-- L'intention du 2026-09-09 15:30 portait, apres 35 tentatives :
--   last_error_code    = RAIL_TRANSIENT
--   last_error_message = process_booking_intent_outcome failed: insert or
--                        update on table "ledger_entries" violates foreign key
--                        constraint "ledger_entries_wallet_id_fkey"
--
-- Autrement dit : Lengopay repondait SUCCES — le locataire etait debite — et
-- l'ecriture comptable echouait. Le cron rattrapait l'erreur comme un incident
-- reseau ("transient"), reessayait 35 fois, puis l'intention expirait. Silence
-- complet cote utilisateur.
--
-- LA CAUSE. Les deux fonctions ci-dessous ecrivaient l'identifiant de
-- l'UTILISATEUR systeme dans une colonne qui attend un identifiant de WALLET :
--
--   v_escrow_id uuid := '00000000-0000-0000-0000-000000000001';
--
-- '…0001' est bien l'utilisateur __system_escrow__, mais son wallet GNF porte
-- un tout autre identifiant (uuidv7). Aucun wallet ne s'appelle '…0001', d'ou
-- la violation de cle etrangere — a chaque fois, sans exception.
--
-- Le chemin des COMMANDES, lui, fait la recherche correctement depuis toujours
-- (confirm_order_receipt : « select id into v_escrow_wallet_id from wallets
-- where user_id = '…0001' and currency = 'GNF' »). C'est ce motif qui est
-- repris ici.
--
-- L'ERREUR ETAIT DANS LES DEUX ETAPES, pas seulement la premiere : corriger le
-- seul paiement aurait fait buter le locataire sur la remise des cles, avec la
-- meme violation. release_booking passait DEUX identifiants d'utilisateur a
-- post_transfer, alors qu'il cherchait correctement celui du proprietaire trois
-- lignes plus haut.
--
-- AU PASSAGE, LES LIBELLES D'EVENEMENT ETAIENT EN MOJIBAKE — « Contrat signÃ©
-- â paiement reÃ§u en sÃ©questre », de l'UTF-8 relu en Latin-1. Personne ne
-- l'avait vu : aucune reservation n'ayant jamais ete payee, ces evenements
-- n'ont jamais ete ecrits.
--
-- UN GARDE-FOU EST AJOUTE. Si le wallet du sequestre est introuvable, on leve
-- une exception nommee plutot que de laisser partir une violation de cle
-- etrangere. Une erreur qui se lit « ESCROW_WALLET_MISSING » se diagnostique ;
-- une violation de contrainte remontee comme « transient » se reessaie 35 fois
-- en silence.

create or replace function public.confirm_booking_payment(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking      record;
  v_escrow_wallet uuid;
  v_escrow_bal   bigint;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then return 'unknown'; end if;
  if v_booking.status <> 'accepted' then return 'noop'; end if;

  if exists (
    select 1 from public.bookings b
    where b.property_id = v_booking.property_id
      and b.id <> p_booking_id
      and b.status in ('paid', 'active')
      and (b.period in ('month','sale') or v_booking.period in ('month','sale')
           or (b.start_date < v_booking.end_date and v_booking.start_date < b.end_date))
  ) then
    return 'conflict';
  end if;

  -- LE WALLET, pas l'utilisateur. C'etait tout le bug.
  select id into v_escrow_wallet
    from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF'
     for update;
  if v_escrow_wallet is null then
    raise exception 'ESCROW_WALLET_MISSING' using errcode = 'P0001';
  end if;

  v_escrow_bal := coalesce((select balance_after from public.ledger_entries
                            where wallet_id = v_escrow_wallet
                            order by created_at desc, id desc limit 1), 0);
  -- Ecriture a sens unique, volontairement : l'argent vient du rail, pas d'un
  -- autre portefeuille. C'est le meme traitement qu'une recharge.
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values (v_escrow_wallet, 'credit', v_booking.total_minor,
            v_escrow_bal + v_booking.total_minor, 'booking_escrow', p_booking_id);

  update public.bookings
     set status = 'paid',
         tenant_signed_at = coalesce(tenant_signed_at, now()),
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(), 'label', 'Contrat signé — paiement reçu en séquestre')),
         updated_at = now()
   where id = p_booking_id;

  if v_booking.period = 'month' then
    update public.properties set status = 'reserved', updated_at = now()
     where id = v_booking.property_id and status = 'active';
  elsif v_booking.period = 'sale' then
    update public.properties set status = 'sold', updated_at = now()
     where id = v_booking.property_id and status = 'active';
  end if;

  return 'confirmed';
end;
$$;

revoke all on function public.confirm_booking_payment(uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking_payment(uuid) to service_role;

create or replace function public.release_booking(p_booking_id uuid, p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking          record;
  v_escrow_wallet    uuid;
  v_platform_wallet  uuid;
  v_landlord_wallet  uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.tenant_id <> p_tenant_id then raise exception 'FORBIDDEN'; end if;
  if v_booking.status <> 'paid' then raise exception 'INVALID_STATUS'; end if;

  select id into v_landlord_wallet from public.wallets
   where user_id = v_booking.landlord_id and currency = 'GNF';
  if v_landlord_wallet is null then
    insert into public.wallets (user_id, currency)
      values (v_booking.landlord_id, 'GNF')
      on conflict (user_id, currency) do update set updated_at = now()
      returning id into v_landlord_wallet;
  end if;

  -- LES DEUX AUTRES SE CHERCHENT AUSSI. C'est la meme erreur qu'a la
  -- confirmation, en double : post_transfer attend des identifiants de WALLET,
  -- il recevait ceux des utilisateurs systeme. Le wallet du proprietaire, lui,
  -- etait deja correctement resolu trois lignes plus haut — la preuve que le
  -- motif etait connu, juste pas applique partout.
  select id into v_escrow_wallet from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';
  if v_escrow_wallet is null then
    raise exception 'ESCROW_WALLET_MISSING' using errcode = 'P0001';
  end if;
  select id into v_platform_wallet from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';
  if v_platform_wallet is null then
    raise exception 'PLATFORM_WALLET_MISSING' using errcode = 'P0001';
  end if;

  perform public.post_transfer(v_escrow_wallet, v_landlord_wallet, v_booking.amount_minor,
                               'booking_release', p_booking_id);
  if v_booking.fees_minor > 0 then
    perform public.post_transfer(v_escrow_wallet, v_platform_wallet, v_booking.fees_minor,
                                 'booking_platform_fee', p_booking_id);
  end if;

  update public.bookings
     set status = 'active',
         events = events || jsonb_build_array(jsonb_build_object(
           'at', now(), 'label',
           case when v_booking.period = 'sale'
                then 'Remise du bien confirmée — montant versé au vendeur'
                else 'Emménagement confirmé — loyer versé au propriétaire'
           end)),
         updated_at = now()
   where id = p_booking_id;

  return 'released';
end;
$$;

revoke all on function public.release_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_booking(uuid, uuid) to service_role;
