-- Le frais de livraison ne quittait JAMAIS le sequestre.
--
-- Trouve le 2026-09-07 en concevant la liberation automatique, puis VERIFIE sur
-- la production : sur les quatre chemins qui sortent l'argent d'une commande,
-- trois ne transferaient pas delivery_fee_minor. Ils ne le SELECTionnaient meme
-- pas.
--
--   confirm_order_receipt    delivery_fee_minor traite : NON
--   livreur_confirm_handoff  delivery_fee_minor traite : NON
--   resolve_dispute          delivery_fee_minor traite : NON
--   seller_confirm_pickup    delivery_fee_minor traite : oui  (ecrite le 2026-08-22)
--
-- POURQUOI CE TROU EXISTE. La migration 20260730_01 introduisait le frais de
-- livraison ET corrigeait confirm_order_receipt pour le verser a la plateforme.
-- Elle n'a ete appliquee qu'A MOITIE : son place_order est bien en prod (les
-- commandes portent un delivery_fee_minor), son confirm_order_receipt ne l'est
-- pas. Les deux autres fonctions, elles, n'ont jamais ete mises a jour.
--
-- LA PREUVE, CHIFFREE, LE JOUR DE L'ECRITURE :
--   solde reel du sequestre ............... 37 660 GNF
--   du aux 3 commandes vivantes ........... 22 660 GNF
--   ecart, orphelin ....................... 15 000 GNF
-- Ces 15 000 GNF sont le frais de livraison de LK-2026-10070, une commande deja
-- 'released' : l'argent n'appartient plus a personne et personne ne le reclamera.
-- A chaque commande livree, la meme somme se serait ajoutee.
--
-- CE QUE FAIT CETTE MIGRATION : elle reprend les corps DEPLOYES tels quels et
-- n'y change que deux choses par fonction — le SELECT, et le montant verse.
-- Rien d'autre ne bouge, volontairement : ces fonctions portent de l'argent et
-- une reecriture complete aurait pu emporter une garde au passage.
--
--   liberation (acheteur confirme, livreur remet, litige tranche pour le
--   vendeur) -> la plateforme recoit frais de service + frais de livraison,
--   puisque c'est Linky qui opere la livraison.
--   remboursement (litige tranche pour l'acheteur) -> l'acheteur recoit aussi
--   le frais de livraison : il l'avait paye, la livraison n'a pas eu lieu.
--
-- CE QU'ELLE NE FAIT PAS : elle ne touche pas aux 15 000 GNF deja orphelins.
-- Corriger le code et deplacer de l'argent existant sont deux gestes
-- differents ; le second se fait a part, en connaissance de cause.


CREATE OR REPLACE FUNCTION public.confirm_order_receipt(p_order_id uuid, p_caller_id uuid, p_scan_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

declare

  v_order               record;

  v_seller_wallet_id    uuid;

  v_escrow_wallet_id    uuid;

  v_platform_wallet_id  uuid;

  v_now                 timestamptz := now();

begin

  select id, buyer_id, seller_id, amount_minor, fees_minor, delivery_fee_minor, status, events, scan_token

    into v_order

    from public.orders

    where id = p_order_id

    for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;



  if v_order.buyer_id <> p_caller_id then

    raise exception 'ORDER_NOT_BUYER';

  end if;



  -- Widened gate (X.9) : 'preparing' = seller marked the package shipped.

  if v_order.status not in ('paid', 'preparing', 'delivered') then

    raise exception 'INVALID_STATUS';

  end if;



  -- QR verrou (20260601_03) : sans le bon scan_token, pas de libération.

  -- Après buyer + status checks pour ne pas leak la validité du token ;

  -- avant les wallet lookups pour ne pas créer de wallet seller au passage.

  if v_order.scan_token <> p_scan_token then

    raise exception 'INVALID_SCAN_TOKEN';

  end if;



  insert into public.wallets (user_id, currency)

    values (v_order.seller_id, 'GNF')

    on conflict (user_id, currency) do nothing;



  select id into v_seller_wallet_id

    from public.wallets

    where user_id = v_order.seller_id and currency = 'GNF';



  select id into v_escrow_wallet_id

    from public.wallets

    where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';



  select id into v_platform_wallet_id

    from public.wallets

    where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';



  perform public.post_transfer(

    v_escrow_wallet_id, v_seller_wallet_id, v_order.amount_minor,

    'order_release', v_order.id

  );

  perform public.post_transfer(

    v_escrow_wallet_id, v_platform_wallet_id, v_order.fees_minor + coalesce(v_order.delivery_fee_minor, 0),

    'order_platform_fee', v_order.id

  );



  update public.orders

    set status = 'released',

        events = v_order.events || jsonb_build_array(

                   jsonb_build_object('at', v_now, 'label', 'Réception confirmée')

                 ),

        updated_at = v_now

    where id = v_order.id;

end;

$function$;

CREATE OR REPLACE FUNCTION public.livreur_confirm_handoff(p_order_id uuid, p_livreur_id uuid, p_scan_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

declare

  v_order               record;

  v_delivery            record;

  v_seller_wallet_id    uuid;

  v_escrow_wallet_id    uuid;

  v_platform_wallet_id  uuid;

  v_now                 timestamptz := now();

begin

  select id, buyer_id, seller_id, amount_minor, fees_minor, delivery_fee_minor, status, events, scan_token

    into v_order

    from public.orders

    where id = p_order_id

    for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;



  select id, livreur_id, status

    into v_delivery

    from public.deliveries

    where order_id = p_order_id

    for update;

  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;



  if v_delivery.livreur_id is null or v_delivery.livreur_id <> p_livreur_id then

    raise exception 'NOT_ASSIGNED_LIVREUR';

  end if;



  -- Defense in depth for LINKY-ESCROW-SELF-RELEASE: refuse to release escrow if

  -- the confirming livreur is the order's own seller or buyer, even if a bad

  -- assignment somehow slipped past assign_delivery / admin_assign_delivery.

  if v_delivery.livreur_id = v_order.seller_id or v_delivery.livreur_id = v_order.buyer_id then

    raise exception 'LIVREUR_IS_COUNTERPARTY';

  end if;



  if v_order.status not in ('paid', 'preparing') then

    raise exception 'INVALID_STATUS';

  end if;



  if v_delivery.status not in ('assigned', 'in_transit') then

    raise exception 'INVALID_DELIVERY_STATUS';

  end if;



  if v_order.scan_token is null or v_order.scan_token <> p_scan_token then

    raise exception 'INVALID_SCAN_TOKEN';

  end if;



  insert into public.wallets (user_id, currency)

    values (v_order.seller_id, 'GNF')

    on conflict (user_id, currency) do nothing;



  select id into v_seller_wallet_id

    from public.wallets

    where user_id = v_order.seller_id and currency = 'GNF';



  select id into v_escrow_wallet_id

    from public.wallets

    where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';



  select id into v_platform_wallet_id

    from public.wallets

    where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';



  perform public.post_transfer(

    v_escrow_wallet_id, v_seller_wallet_id, v_order.amount_minor,

    'order_release', v_order.id

  );

  perform public.post_transfer(

    v_escrow_wallet_id, v_platform_wallet_id, v_order.fees_minor + coalesce(v_order.delivery_fee_minor, 0),

    'order_platform_fee', v_order.id

  );



  update public.deliveries

    set status       = 'delivered',

        delivered_at = v_now,

        updated_at   = v_now

    where id = v_delivery.id;



  update public.orders

    set status = 'released',

        events = v_order.events || jsonb_build_array(

                   jsonb_build_object('at', v_now, 'kind', 'delivered',

                                       'label', 'Livraison confirmée',

                                       'livreur_id', p_livreur_id),

                   jsonb_build_object('at', v_now, 'label', 'Réception confirmée')

                 ),

        updated_at = v_now

    where id = v_order.id;

end;

$function$;

CREATE OR REPLACE FUNCTION public.resolve_dispute(p_order_id uuid, p_admin_id uuid, p_outcome text, p_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order               record;
  v_before              jsonb;
  v_after               jsonb;
  v_new_status          text;
  v_buyer_wallet_id     uuid;
  v_seller_wallet_id    uuid;
  v_escrow_wallet_id    uuid;
  v_platform_wallet_id  uuid;
  v_event               jsonb;
  v_now                 timestamptz := now();
  v_buyer_id            uuid;
  v_seller_id           uuid;
begin
  -- Guard: admin?
  perform public.assert_admin(p_admin_id);

  -- Guard: outcome valid?
  if p_outcome not in ('refund', 'release') then
    raise exception 'invalid_outcome'
      using errcode = '22023', detail = 'expected refund or release';
  end if;

  -- Phase V.4 — self-deal guard. Cheap pre-read so we can fail fast
  -- BEFORE locking the order row (locks held across a self-deal abort
  -- would still complete the assertion, but a no-lock fast-fail is
  -- friendlier to concurrent legitimate resolutions).
  select buyer_id, seller_id into v_buyer_id, v_seller_id
    from public.orders
    where id = p_order_id;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_admin_id = v_buyer_id or p_admin_id = v_seller_id then
    raise exception 'self_deal_forbidden' using errcode = 'P0001';
  end if;

  -- Lock the order
  select id, buyer_id, seller_id, amount_minor, fees_minor, delivery_fee_minor, total_minor, status, events
    into v_order
    from public.orders
    where id = p_order_id
    for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status <> 'disputed' then
    raise exception 'invalid_status'
      using errcode = '22023', detail = 'order must be in disputed status, got ' || v_order.status;
  end if;

  -- Snapshot avant mutation (full row so audit replays bit-for-bit).
  select to_jsonb(o.*) into v_before
    from public.orders o
    where o.id = p_order_id;

  -- Resolve wallet ids common to both branches.
  select id into v_escrow_wallet_id
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

  if p_outcome = 'refund' then
    v_new_status := 'refunded';

    insert into public.wallets (user_id, currency)
      values (v_order.buyer_id, 'GNF')
      on conflict (user_id, currency) do nothing;

    select id into v_buyer_wallet_id
      from public.wallets
      where user_id = v_order.buyer_id and currency = 'GNF';

    perform public.post_transfer(
      v_escrow_wallet_id, v_buyer_wallet_id, v_order.amount_minor,
      'order_refund', v_order.id
    );
    perform public.post_transfer(
      v_escrow_wallet_id, v_buyer_wallet_id, v_order.fees_minor + coalesce(v_order.delivery_fee_minor, 0),
      'order_fee_refund', v_order.id
    );

  else
    v_new_status := 'released';

    insert into public.wallets (user_id, currency)
      values (v_order.seller_id, 'GNF')
      on conflict (user_id, currency) do nothing;

    select id into v_seller_wallet_id
      from public.wallets
      where user_id = v_order.seller_id and currency = 'GNF';

    select id into v_platform_wallet_id
      from public.wallets
      where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';

    perform public.post_transfer(
      v_escrow_wallet_id, v_seller_wallet_id, v_order.amount_minor,
      'order_release', v_order.id
    );
    perform public.post_transfer(
      v_escrow_wallet_id, v_platform_wallet_id, v_order.fees_minor + coalesce(v_order.delivery_fee_minor, 0),
      'order_platform_fee', v_order.id
    );
  end if;

  v_event := jsonb_build_object(
    'at',       v_now,
    'label',    'Litige résolu',
    'kind',     'dispute_resolved',
    'outcome',  p_outcome,
    'admin_id', p_admin_id,
    'reason',   nullif(p_reason, ''),
    'note',     nullif(p_note, '')
  );

  update public.orders
    set status = v_new_status,
        events = v_order.events || jsonb_build_array(v_event),
        updated_at = v_now
    where id = v_order.id;

  select to_jsonb(o.*) into v_after
    from public.orders o
    where o.id = p_order_id;

  insert into public.admin_actions (
    admin_id, target_type, target_id, action, reason, metadata,
    before_snapshot, after_snapshot
  ) values (
    p_admin_id,
    'order',
    p_order_id,
    'dispute.resolve',
    nullif(p_reason, ''),
    jsonb_build_object('outcome', p_outcome, 'note', nullif(p_note, '')),
    v_before,
    v_after
  );
end;
$function$;


-- On repose le durcissement du 2026-07-29 sur les trois fonctions touchees.
-- CREATE OR REPLACE conserve normalement les droits, mais le reaffirmer ne
-- coute rien et protege du cas ou il ne les conserverait pas.
--
-- La signature est LUE dans le catalogue plutot qu'ecrite a la main :
-- resolve_dispute a cinq parametres dont deux avec valeur par defaut, et une
-- signature mal recopiee ferait echouer toute la migration — donc annulerait
-- aussi la correction des trois fonctions. Le durcissement ne doit jamais
-- pouvoir faire tomber le correctif qu'il accompagne.
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('confirm_order_receipt', 'livreur_confirm_handoff', 'resolve_dispute')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $grants$;
