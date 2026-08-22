-- ============================================================================
-- Panier multi-boutiques : UN paiement, PLUSIEURS commandes.
-- Client 2026-08-21 : « un seul bouton dans le panier, le client valide tout
-- en une fois, meme avec des produits de boutiques differentes ».
--
-- CE QUI RENDAIT CELA POSSIBLE, ET QUE J'AVAIS MAL JUGE : l'argent ne va JAMAIS
-- directement au vendeur. Il entre en sequestre, sur un portefeuille de la
-- plateforme, et n'en sort qu'a la confirmation de reception. Un paiement
-- unique peut donc alimenter plusieurs sequestres — ce qui etait impossible,
-- c'etait de repartir un paiement mobile money entre deux BENEFICIAIRES, et ce
-- n'est pas ce qui se passe ici.
--
-- CE QUI NE CHANGE PAS, et c'est deliberé : chaque boutique reste UNE commande,
-- avec son sequestre, sa livraison, son code de retrait, son litige. Les
-- fusionner rendrait impossible de savoir qui doit quoi a qui.
--
-- Applique en prod (mkaddhcjneilvwqethjo) via l'editeur SQL — `db push` est
-- inutilisable sur ce projet.
-- ============================================================================

-- ─── 1. Le lot ──────────────────────────────────────────────────────────────
-- Pas de table dediee : un identifiant partage suffit et reduit la surface a
-- securiser. Les commandes d'un meme panier portent le meme batch_id, et
-- l'intention de paiement aussi. NULL partout ailleurs = commande isolee,
-- comportement d'avant inchange.
alter table public.orders
  add column if not exists batch_id uuid;
create index if not exists orders_batch_idx
  on public.orders (batch_id) where batch_id is not null;

alter table public.payment_intents
  add column if not exists batch_id uuid;
alter table public.payment_intents drop constraint if exists payment_intents_one_target;
alter table public.payment_intents
  add constraint payment_intents_one_target
  check (num_nonnulls(order_id, booking_id, boost_id, batch_id) = 1);
create index if not exists payment_intents_batch_idx
  on public.payment_intents (batch_id) where batch_id is not null;

-- ─── 2. Cloisonner les balayeurs existants ──────────────────────────────────
-- Ils ne filtraient que booking_id / boost_id. Une intention de LOT (order_id
-- nul) y tomberait et serait servie a process_intent_outcome, qui exige une
-- commande unique et leverait ORDER_NOT_FOUND. Corps inchanges par ailleurs.
create or replace function public.pick_intents_to_poll(p_limit integer default 200)
 returns setof public.payment_intents
 language sql security definer set search_path to ''
as $function$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.booking_id is null
    and pi.boost_id is null
    and pi.batch_id is null
    and pi.created_at > now() - interval '15 minutes'
    and (
      (pi.created_at > now() - interval '60 seconds'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '5 seconds'))
      or
      (pi.created_at <= now() - interval '60 seconds'
        and pi.created_at > now() - interval '5 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '15 seconds'))
      or
      (pi.created_at <= now() - interval '5 minutes'
        and pi.created_at > now() - interval '15 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '30 seconds'))
    )
  order by pi.created_at
  limit p_limit
  for update skip locked;
$function$;

create or replace function public.expire_stale_intents()
 returns integer
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_count  int := 0;
  v_intent record;
  v_now    timestamptz := now();
begin
  for v_intent in
    select id, order_id from public.payment_intents
    where status = 'pending'
      and rail = 'lengopay'
      and booking_id is null
      and boost_id is null
      and batch_id is null
      and created_at < v_now - interval '15 minutes'
      and (last_polled_at is null or last_error_code is null)
    for update skip locked
  loop
    update public.payment_intents
      set status = 'expired', completed_at = v_now, updated_at = v_now
      where id = v_intent.id;
    update public.orders
      set status = 'cancelled',
          events = events || jsonb_build_array(jsonb_build_object('at', v_now, 'label', 'Paiement expiré')),
          updated_at = v_now
      where id = v_intent.order_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

-- ─── 3. place_orders_batch — N commandes, un seul montant ───────────────────
-- Decalque de place_order_multi, avec UNE difference de fond : plusieurs
-- vendeurs sont acceptes, et chacun recoit sa propre commande.
--
-- Gardes de securite, dans l'ordre ou elles s'appliquent :
--   * bornes de taille (articles, boutiques) — un panier n'est pas un vecteur
--     de deni de service ;
--   * verrou de ligne sur chaque produit, comme aujourd'hui ;
--   * article en double refuse SUR TOUT LE LOT, pas seulement par boutique ;
--   * l'acheteur ne peut acheter chez lui-meme, verifie pour CHAQUE boutique ;
--   * stock controle et decremente sous le meme verrou ;
--   * prix, frais et total derives du serveur — le client n'envoie aucun
--     montant, jamais ;
--   * livraison facturee UNE fois pour le lot.
--
-- Atomicite : tout se passe dans une seule transaction. Une exception sur le
-- dernier article annule la creation des precedents. Il ne peut donc pas
-- exister de lot a moitie constitue qu'un paiement viendrait regler.
create or replace function public.place_orders_batch(
  p_buyer_id           uuid,
  p_items              jsonb,   -- [{"product_id":"<uuid>","quantity":2}, ...]
  p_payment_method     text,
  p_delivery_mode      text default 'delivery',
  p_delivery_fee_minor bigint default 0
) returns uuid                  -- l'identifiant du LOT
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item             jsonb;
  v_product          record;
  v_qty              integer;
  v_line_amount      bigint;
  v_delivery_fee     bigint;
  v_batch_id         uuid := public.uuidv7();
  v_now              timestamptz := now();
  v_seen             uuid[] := '{}';
  v_shops            uuid[] := '{}';
  v_lines            jsonb := '[]'::jsonb;
  v_shop             uuid;
  v_shop_amount      bigint;
  v_shop_fees        bigint;
  v_shop_total       bigint;
  v_shop_delivery    bigint;
  v_first_shop       boolean := true;
  v_order_id         uuid;
  v_seller_id        uuid;
  v_primary          jsonb;
  v_batch_total      bigint := 0;
  v_buyer_wallet_id  uuid;
  v_escrow_wallet_id uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_ITEMS';
  end if;
  if jsonb_array_length(p_items) > 40 then
    raise exception 'TOO_MANY_ITEMS';
  end if;
  if p_delivery_mode is null or p_delivery_mode not in ('pickup', 'delivery') then
    raise exception 'INVALID_DELIVERY_MODE';
  end if;
  if p_payment_method is null then raise exception 'INVALID_PAYMENT_METHOD'; end if;

  if p_delivery_mode = 'pickup' then
    v_delivery_fee := 0;
  else
    v_delivery_fee := coalesce(p_delivery_fee_minor, 0);
    if v_delivery_fee < 0 then raise exception 'INVALID_DELIVERY_FEE'; end if;
  end if;

  -- ── Passe 1 : verrouiller, valider, decrementer le stock, collecter ──────
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 0);
    if v_qty <= 0 or v_qty > 100 then raise exception 'INVALID_QUANTITY'; end if;

    select p.id, p.shop_id, p.title, p.photos, p.price_minor, p.status, p.stock, s.owner_id
      into v_product
      from public.products p
      join public.shops s on s.id = p.shop_id
      where p.id = (v_item ->> 'product_id')::uuid
      for update of p;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if v_product.status <> 'active' then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

    -- Le meme article deux fois facturerait deux fois en silence. Le controle
    -- porte sur TOUT le lot, pas seulement sur une boutique.
    if v_product.id = any(v_seen) then raise exception 'DUPLICATE_ITEM'; end if;
    v_seen := v_seen || v_product.id;

    -- Verifie pour CHAQUE boutique : un lot ne doit pas permettre de glisser
    -- un article de sa propre boutique parmi ceux des autres.
    if v_product.owner_id = p_buyer_id then raise exception 'BUYER_IS_SELLER'; end if;

    -- Stock : meme regle que place_order_multi. NULL = non renseigne, aucune
    -- limite. Le decrement se fait sous le verrou pose ci-dessus, donc deux
    -- acheteurs simultanes sur le dernier exemplaire ne peuvent pas passer.
    if v_product.stock is not null then
      if v_product.stock <= 0 then raise exception 'OUT_OF_STOCK'; end if;
      if v_qty > v_product.stock then raise exception 'INSUFFICIENT_STOCK'; end if;
      update public.products set stock = stock - v_qty where id = v_product.id;
    end if;

    if not (v_product.shop_id = any(v_shops)) then
      v_shops := v_shops || v_product.shop_id;
    end if;

    v_line_amount := v_product.price_minor * v_qty;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',       v_product.id,
      'shop_id',          v_product.shop_id,
      'owner_id',         v_product.owner_id,
      'quantity',         v_qty,
      'unit_price_minor', v_product.price_minor,
      'amount_minor',     v_line_amount,
      'snapshot', jsonb_build_object(
        'title',    v_product.title,
        'photo',    coalesce(v_product.photos[1], ''),
        'priceGnf', v_product.price_minor
      )
    ));
  end loop;

  if array_length(v_shops, 1) > 10 then
    raise exception 'TOO_MANY_SHOPS';
  end if;

  -- ── Passe 2 : une commande par boutique ─────────────────────────────────
  foreach v_shop in array v_shops
  loop
    select sum((l ->> 'amount_minor')::bigint)
      into v_shop_amount
      from jsonb_array_elements(v_lines) as l
      where (l ->> 'shop_id')::uuid = v_shop;

    select (l ->> 'owner_id')::uuid, l
      into v_seller_id, v_primary
      from jsonb_array_elements(v_lines) as l
      where (l ->> 'shop_id')::uuid = v_shop
      limit 1;

    v_shop_fees := round(v_shop_amount * 0.03);

    -- Livraison facturee UNE SEULE FOIS pour le lot, portee entierement par la
    -- premiere commande. Une repartition au prorata introduirait des arrondis,
    -- et la somme des totaux ne retomberait plus exactement sur le montant
    -- paye — or c'est cette egalite qui protege le sequestre (voir la garde
    -- dans process_batch_intent_outcome).
    if v_first_shop then
      v_shop_delivery := v_delivery_fee;
      v_first_shop := false;
    else
      v_shop_delivery := 0;
    end if;

    v_shop_total  := v_shop_amount + v_shop_fees + v_shop_delivery;
    v_batch_total := v_batch_total + v_shop_total;

    insert into public.orders (
      reference, buyer_id, seller_id, shop_id, product_id,
      product_snapshot, quantity, amount_minor, fees_minor, total_minor,
      delivery_mode, delivery_fee_minor,
      payment_method, status, events, batch_id
    ) values (
      public.generate_order_reference(), p_buyer_id, v_seller_id, v_shop,
      (v_primary ->> 'product_id')::uuid,
      v_primary -> 'snapshot',
      (v_primary ->> 'quantity')::int,
      v_shop_amount, v_shop_fees, v_shop_total,
      p_delivery_mode, v_shop_delivery,
      p_payment_method,
      case when p_payment_method = 'wallet' then 'paid' else 'placed' end,
      case when p_payment_method = 'wallet' then
        jsonb_build_array(
          jsonb_build_object('at', v_now, 'label', 'Commande passée'),
          jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')
        )
      else
        jsonb_build_array(jsonb_build_object('at', v_now, 'label', 'Commande passée'))
      end,
      v_batch_id
    )
    returning id into v_order_id;

    insert into public.order_items (order_id, product_id, product_snapshot, quantity, unit_price_minor, amount_minor)
    select
      v_order_id,
      (l ->> 'product_id')::uuid,
      l -> 'snapshot',
      (l ->> 'quantity')::int,
      (l ->> 'unit_price_minor')::bigint,
      (l ->> 'amount_minor')::bigint
    from jsonb_array_elements(v_lines) as l
    where (l ->> 'shop_id')::uuid = v_shop;

    -- Portefeuille : le sequestre est alimente commande par commande, comme
    -- aujourd'hui. Une insuffisance de solde leve INSUFFICIENT_FUNDS et annule
    -- TOUT le lot, y compris les commandes deja inserees — c'est le
    -- comportement voulu, un panier ne se paie pas a moitie.
    if p_payment_method = 'wallet' then
      insert into public.wallets (user_id, currency)
        values (p_buyer_id, 'GNF')
        on conflict (user_id, currency) do nothing;

      select id into v_buyer_wallet_id
        from public.wallets where user_id = p_buyer_id and currency = 'GNF';
      select id into v_escrow_wallet_id
        from public.wallets
        where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';
      -- Sans ce garde, un sequestre absent partirait en NULL dans post_transfer
      -- et echouerait sur une contrainte NOT NULL — meme resultat (rollback),
      -- mais un message illisible dans les journaux le jour ou ca arrive.
      if v_buyer_wallet_id is null then raise exception 'BUYER_WALLET_NOT_FOUND'; end if;
      if v_escrow_wallet_id is null then raise exception 'ESCROW_WALLET_NOT_FOUND'; end if;

      perform public.post_transfer(
        v_buyer_wallet_id, v_escrow_wallet_id, v_shop_total,
        'order_escrow', v_order_id
      );
    end if;
  end loop;

  return v_batch_id;
end;
$$;
revoke all on function public.place_orders_batch(uuid, jsonb, text, text, bigint) from public, anon, authenticated;
grant execute on function public.place_orders_batch(uuid, jsonb, text, text, bigint) to service_role;

-- ─── 4. Montant du lot, pour l'intention de paiement ────────────────────────
-- Lu en base, JAMAIS calcule par l'appelant : c'est la meme source que celle
-- qui sera verifiee au reglement.
create or replace function public.batch_total_minor(p_batch_id uuid)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select coalesce(sum(total_minor), 0) from public.orders where batch_id = p_batch_id;
$$;
revoke all on function public.batch_total_minor(uuid) from public, anon, authenticated;
grant execute on function public.batch_total_minor(uuid) to service_role;

-- ─── 5. Reglement du lot ────────────────────────────────────────────────────
-- LA GARDE ESSENTIELLE est ici : avant de creer la moindre ecriture, on
-- verifie que la somme des totaux des commandes vaut EXACTEMENT le montant de
-- l'intention. Si les deux divergent — commande annulee entre-temps, montant
-- altere, bogue futur — on refuse tout plutot que d'alimenter le sequestre a
-- partir d'un montant qui n'a pas ete encaisse.
--
-- Idempotente : la garde sur status = 'pending' fait qu'un second passage du
-- cron ne credite rien.
create or replace function public.process_batch_intent_outcome(
  p_intent_id uuid, p_terminal_status text, p_rail_status text,
  p_error_code text, p_error_message text)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_intent   record;
  v_order    record;
  v_sum      bigint;
  v_balance  bigint;
  v_escrow   uuid;
  v_now      timestamptz := now();
begin
  if p_terminal_status not in ('completed','failed','cancelled') then
    raise exception 'INVALID_TERMINAL_STATUS';
  end if;

  select * into v_intent from public.payment_intents where id = p_intent_id for update;
  if not found then raise exception 'INTENT_NOT_FOUND'; end if;
  if v_intent.batch_id is null then raise exception 'NOT_A_BATCH_INTENT'; end if;
  if v_intent.status <> 'pending' then
    raise notice 'process_batch_intent_outcome: intent % already %, skipping', p_intent_id, v_intent.status;
    return;
  end if;

  if p_terminal_status = 'completed' then
    -- Verrouiller les lignes AVANT de les sommer. Postgres refuse FOR UPDATE
    -- avec une fonction d agregation, donc les deux etapes sont separees ; sans
    -- le verrou, une commande du lot pourrait etre modifiee entre la somme et
    -- le credit, et la garde d egalite deviendrait sans valeur.
    perform 1 from public.orders where batch_id = v_intent.batch_id for update;
    select coalesce(sum(total_minor), 0) into v_sum
      from public.orders where batch_id = v_intent.batch_id;

    -- Egalite comptable. Sans elle, un lot dont une commande aurait ete
    -- modifiee apres coup pourrait faire entrer en sequestre plus — ou moins —
    -- que ce que l'acheteur a reellement paye.
    if v_sum <> v_intent.amount_minor then
      raise exception 'BATCH_AMOUNT_MISMATCH: orders=% intent=%', v_sum, v_intent.amount_minor;
    end if;

    select id into v_escrow
      from public.wallets
      where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF'
      for update;
    if v_escrow is null then raise exception 'ESCROW_WALLET_NOT_FOUND'; end if;

    -- Une ecriture de sequestre PAR COMMANDE, avec sa reference propre : c'est
    -- ce qui permettra a chaque liberation de retrouver son ecriture d'origine.
    -- Ecriture a un seul cote : l'argent vient de l'exterieur (Lengopay), il
    -- n'a jamais transite par le grand livre.
    for v_order in
      select id, total_minor, events from public.orders
      where batch_id = v_intent.batch_id and status = 'placed'
      order by created_at
    loop
      v_balance := coalesce(
        (select balance_after from public.ledger_entries
          where wallet_id = v_escrow
          order by created_at desc, id desc limit 1), 0);

      insert into public.ledger_entries
        (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
      values
        (v_escrow, 'credit', v_order.total_minor,
         v_balance + v_order.total_minor, 'order_escrow', v_order.id);

      update public.orders
        set status = 'paid',
            events = v_order.events || jsonb_build_array(
                       jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')),
            updated_at = v_now
        where id = v_order.id;
    end loop;
  else
    update public.orders
      set status = 'cancelled',
          events = events || jsonb_build_array(
                     jsonb_build_object(
                       'at', v_now,
                       'label', case p_terminal_status
                         when 'failed'    then 'Paiement échoué'
                         when 'cancelled' then 'Paiement annulé'
                       end,
                       'error_code', p_error_code,
                       'error_message', p_error_message)),
          updated_at = v_now
      where batch_id = v_intent.batch_id and status = 'placed';
  end if;

  update public.payment_intents
    set status = p_terminal_status, rail_status = p_rail_status,
        last_error_code = p_error_code, last_error_message = p_error_message,
        completed_at = v_now, updated_at = v_now
    where id = p_intent_id;
end;
$$;

-- ─── 6. Sondage et expiration des intentions de lot ─────────────────────────
create or replace function public.pick_batch_intents_to_poll(p_limit integer default 200)
 returns setof public.payment_intents
 language sql security definer set search_path to ''
as $function$
  select *
  from public.payment_intents pi
  where pi.status = 'pending'
    and pi.rail = 'lengopay'
    and pi.batch_id is not null
    and pi.created_at > now() - interval '15 minutes'
    and (
      (pi.created_at > now() - interval '60 seconds'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '5 seconds'))
      or
      (pi.created_at <= now() - interval '60 seconds'
        and pi.created_at > now() - interval '5 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '15 seconds'))
      or
      (pi.created_at <= now() - interval '5 minutes'
        and pi.created_at > now() - interval '15 minutes'
        and (pi.last_polled_at is null or pi.last_polled_at < now() - interval '30 seconds'))
    )
  order by pi.created_at
  limit p_limit
  for update skip locked;
$function$;

create or replace function public.expire_stale_batch_intents()
 returns integer
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_count  int := 0;
  v_intent record;
  v_now    timestamptz := now();
begin
  for v_intent in
    select id, batch_id from public.payment_intents
    where status = 'pending'
      and rail = 'lengopay'
      and batch_id is not null
      and created_at < v_now - interval '15 minutes'
      and (last_polled_at is null or last_error_code is null)
    for update skip locked
  loop
    update public.payment_intents
      set status = 'expired', completed_at = v_now, updated_at = v_now
      where id = v_intent.id;
    -- Aucun mouvement de fonds : rien n'a ete encaisse, les commandes du lot
    -- sont simplement annulees.
    update public.orders
      set status = 'cancelled',
          events = events || jsonb_build_array(
                     jsonb_build_object('at', v_now, 'label', 'Paiement expiré')),
          updated_at = v_now
      where batch_id = v_intent.batch_id and status = 'placed';
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

-- ─── 7. Verrouillage (durcissement 2026-07-29) ──────────────────────────────
-- Supabase re-accorde EXECUTE a anon/authenticated sur toute nouvelle fonction
-- SECURITY DEFINER : il faut le retirer a chaque fois, sans quoi la routine est
-- appelable depuis Internet.
revoke all on function public.process_batch_intent_outcome(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.process_batch_intent_outcome(uuid, text, text, text, text) to service_role;
revoke all on function public.pick_batch_intents_to_poll(integer) from public, anon, authenticated;
grant execute on function public.pick_batch_intents_to_poll(integer) to service_role;
revoke all on function public.expire_stale_batch_intents() from public, anon, authenticated;
grant execute on function public.expire_stale_batch_intents() to service_role;
revoke all on function public.pick_intents_to_poll(integer) from public, anon, authenticated;
grant execute on function public.pick_intents_to_poll(integer) to service_role;
revoke all on function public.expire_stale_intents() from public, anon, authenticated;
grant execute on function public.expire_stale_intents() to service_role;

-- ─── 8. Restitution du stock a l'annulation ─────────────────────────────────
-- Defaut trouve en construisant le lot (2026-08-21), mais ANTERIEUR a lui : le
-- stock est decremente a la creation de la commande (migration 20260813_01) et
-- n'etait jamais rendu quand le paiement echouait, expirait ou etait annule.
-- Un acheteur qui ouvrait la page Lengopay puis fermait l'application retirait
-- donc definitivement les articles du stock du vendeur.
--
-- Un declencheur plutot qu'une correction dans process_intent_outcome : il
-- couvre d'un coup TOUS les chemins d'annulation — expiration par le cron,
-- annulation par l'acheteur, echec du rail, lot ou commande simple — presents
-- comme a venir, et il est l'exact inverse du decrement.
--
-- La transition surveillee est 'placed' -> 'cancelled' uniquement. 'placed'
-- signifie « paiement jamais encaisse » ; une commande payee qui serait
-- remboursee plus tard suit un autre chemin et ne doit pas repasser par ici.
create or replace function public.restore_stock_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products p
    set stock = p.stock + agg.qty,
        updated_at = now()
    from (
      select oi.product_id, sum(oi.quantity)::int as qty
        from public.order_items oi
       where oi.order_id = new.id
       group by oi.product_id
    ) agg
   where p.id = agg.product_id
     -- stock null = quantite non declaree : rien n'avait ete decremente, donc
     -- rien a rendre. Sans ce filtre on inventerait du stock.
     and p.stock is not null;
  return new;
end;
$$;
revoke all on function public.restore_stock_on_order_cancel() from public, anon, authenticated;

drop trigger if exists trg_restore_stock_on_order_cancel on public.orders;
create trigger trg_restore_stock_on_order_cancel
  after update of status on public.orders
  for each row
  when (old.status = 'placed' and new.status = 'cancelled')
  execute function public.restore_stock_on_order_cancel();
