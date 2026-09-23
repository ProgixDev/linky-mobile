-- TROIS CORRECTIONS DE GRAND LIVRE, issues de la relecture adversariale du
-- 2026-09-23 (8 defauts confirmes sur 16 signales).

-- ============================================================================
-- 1. LE SOLDE NE SE LIT PLUS DANS LA CHAINE balance_after, IL SE CALCULE.
--
-- post_transfer lisait le solde courant ainsi :
--     select balance_after from ledger_entries
--      where wallet_id = ? order by created_at desc, id desc limit 1
--
-- `created_at` a pour defaut now(), c'est-a-dire transaction_timestamp() :
-- l'instant de DEBUT de transaction, pas celui de l'INSERT. Une transaction
-- lente peut donc demarrer avant une rapide et n'ecrire qu'apres elle, avec un
-- horodatage ANTERIEUR. Les deux se serialisent bien sur le verrou du wallet --
-- ce n'est pas une course -- mais la ligne « la plus recente » selon cet ordre
-- est alors la mauvaise, et le montant de la seconde disparait DEFINITIVEMENT
-- du solde. Concretement : place_order (qui verrouille le produit, decremente
-- le stock et cree la commande avant de crediter le sequestre) demarre a
-- 10:00:00.000 ; confirm_booking_payment demarre a 10:00:00.020, prend le
-- verrou en premier, ecrit et commite ; place_order ecrit ensuite avec
-- created_at 10:00:00.000. Le prochain lecteur voit le solde de
-- confirm_booking_payment. Le sequestre est un wallet POOLE (commandes +
-- reservations + boosts) : il a exactement ce profil d'ecrivains concurrents.
--
-- `id desc` ne rattrape rien. uuidv7() est bien genere avec clock_timestamp()
-- (20260620_00:48), donc croissant dans l'ordre reel d'ecriture -- mais sa
-- resolution est la MILLISECONDE, suivie de 10 octets aleatoires. Deux
-- ecritures dans la meme milliseconde s'ordonnent au hasard. Ordonner par id
-- seul deplacerait donc le probleme sans le resoudre.
--
-- On derive le solde de la somme des ecritures, sous le meme verrou. C'est ce
-- que la table annonce depuis le premier jour (« balance_after is a
-- running-balance cache; it stays recomputable as sum(credits)-sum(debits) »),
-- et ce que fait deja order_escrow_balance (20260907_06). balance_after reste
-- ecrit -- l'historique et l'audit s'en servent -- mais plus AUCUNE decision
-- d'argent ne depend de l'ordre de la chaine.
create or replace function public.post_transfer(
  p_from_wallet  uuid,
  p_to_wallet    uuid,
  p_amount_minor bigint,
  p_ref_type     text,
  p_ref_id       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_from_currency text;
  v_to_currency   text;
  v_from_balance  bigint;
  v_to_balance    bigint;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_from_wallet = p_to_wallet then
    raise exception 'SAME_WALLET';
  end if;

  -- Verrou des deux wallets dans l'ordre des id, pour ne pas s'interbloquer.
  perform 1 from public.wallets where id in (p_from_wallet, p_to_wallet) order by id for update;

  select currency into v_from_currency from public.wallets where id = p_from_wallet;
  select currency into v_to_currency   from public.wallets where id = p_to_wallet;
  if v_from_currency is null then raise exception 'FROM_WALLET_NOT_FOUND'; end if;
  if v_to_currency   is null then raise exception 'TO_WALLET_NOT_FOUND'; end if;
  if v_from_currency <> v_to_currency then
    raise exception 'CURRENCY_MISMATCH';
  end if;

  -- Solde = somme des ecritures, sous verrou. Jamais le dernier balance_after.
  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
    into v_from_balance from public.ledger_entries where wallet_id = p_from_wallet;
  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
    into v_to_balance   from public.ledger_entries where wallet_id = p_to_wallet;

  if v_from_balance < p_amount_minor then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values (p_from_wallet, 'debit',  p_amount_minor, v_from_balance - p_amount_minor, p_ref_type, p_ref_id);
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values (p_to_wallet,   'credit', p_amount_minor, v_to_balance   + p_amount_minor, p_ref_type, p_ref_id);
end;
$fn$;

-- ============================================================================
-- 2. UN ENCAISSEMENT SUR UNE RESERVATION MORTE LAISSE DESORMAIS UNE TRACE.
--
-- confirm_booking_payment rendait 'noop' des que la reservation n'etait plus
-- 'accepted'. Deux situations radicalement differentes portaient le meme mot :
--   * elle est deja 'paid'   -> benin, le meme paiement confirme deux fois ;
--   * elle est 'cancelled' / 'rejected' / 'refunded' -> GRAVE, le rail a
--     encaisse et le sequestre ne sera jamais credite.
-- process_booking_intent_outcome ne journalisait que 'conflict' et 'unknown' :
-- le second cas ne laissait NI ligne de grand livre, NI avertissement, NI
-- statut d'intention distinctif. Un audit comptable ne pouvait meme pas
-- retrouver ces encaissements orphelins. On distingue donc les deux retours.
--
-- Au passage, 'disputed' rejoint la garde de conflit : un sejour gele par un
-- litige occupe toujours le bien, et laissait pourtant passer un second
-- paiement sur les memes nuits.
create or replace function public.confirm_booking_payment(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_booking       record;
  v_escrow_wallet uuid;
  v_escrow_bal    bigint;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then return 'unknown'; end if;
  if v_booking.status in ('paid', 'active', 'completed') then return 'noop_paid'; end if;
  if v_booking.status <> 'accepted' then return 'noop_dead'; end if;

  if exists (
    select 1 from public.bookings b
    where b.property_id = v_booking.property_id
      and b.id <> p_booking_id
      and b.status in ('paid', 'active', 'disputed')
      and (b.period in ('month','sale') or v_booking.period in ('month','sale')
           or (b.start_date < v_booking.end_date and v_booking.start_date < b.end_date))
  ) then
    return 'conflict';
  end if;

  select id into v_escrow_wallet
    from public.wallets
   where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF'
     for update;
  if v_escrow_wallet is null then
    raise exception 'ESCROW_WALLET_MISSING' using errcode = 'P0001';
  end if;

  -- Meme regle que post_transfer : la somme, pas le dernier balance_after.
  select coalesce(sum(case when direction = 'credit' then amount_minor else -amount_minor end), 0)
    into v_escrow_bal from public.ledger_entries where wallet_id = v_escrow_wallet;

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
$fn$;

-- ============================================================================
-- 3. LE CRON FAIT DU BRUIT QUAND DE L'ARGENT EST ENCAISSE SANS CONTREPARTIE.
create or replace function public.process_booking_intent_outcome(
  p_intent_id uuid, p_terminal_status text, p_rail_status text, p_error_code text, p_error_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_intent record;
  v_result text;
  v_code   text := p_error_code;
  v_msg    text := p_error_message;
  v_now    timestamptz := now();
begin
  if p_terminal_status not in ('completed','failed','cancelled') then
    raise exception 'INVALID_TERMINAL_STATUS';
  end if;

  select * into v_intent from public.payment_intents where id = p_intent_id for update;
  if not found then raise exception 'INTENT_NOT_FOUND'; end if;
  if v_intent.booking_id is null then raise exception 'NOT_A_BOOKING_INTENT'; end if;
  if v_intent.status <> 'pending' then
    raise notice 'process_booking_intent_outcome: intent % already %, skipping', p_intent_id, v_intent.status;
    return;
  end if;

  if p_terminal_status = 'completed' then
    v_result := public.confirm_booking_payment(v_intent.booking_id);
    -- 'confirmed' | 'noop_paid' = rien a signaler.
    -- 'conflict'  = encaisse mais un autre sejour a pris le creneau.
    -- 'noop_dead' = encaisse sur une reservation annulee/refusee/remboursee.
    -- 'unknown'   = la reservation a disparu (ne devrait pas arriver).
    -- Les trois derniers laissent de l'argent chez le rail sans contrepartie au
    -- grand livre : ils doivent etre bruyants ET retrouvables par requete.
    if v_result in ('conflict','unknown','noop_dead') then
      raise warning 'process_booking_intent_outcome: booking % captured but result=% -- manual refund needed (intent %)',
        v_intent.booking_id, v_result, p_intent_id;
      v_code := 'CAPTURED_WITHOUT_ESCROW';
      v_msg  := 'confirm_booking_payment=' || v_result || ' -- remboursement manuel requis';
    end if;
  end if;

  update public.payment_intents
    set status = p_terminal_status, rail_status = p_rail_status,
        last_error_code = v_code, last_error_message = v_msg,
        completed_at = v_now, updated_at = v_now
    where id = p_intent_id;
end;
$fn$;

-- Durcissement 2026-07-29 : Supabase re-accorde EXECUTE par defaut.
revoke all on function public.post_transfer(uuid, uuid, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.post_transfer(uuid, uuid, bigint, text, uuid) to service_role;
revoke all on function public.confirm_booking_payment(uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking_payment(uuid) to service_role;
revoke all on function public.process_booking_intent_outcome(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.process_booking_intent_outcome(uuid, text, text, text, text) to service_role;
