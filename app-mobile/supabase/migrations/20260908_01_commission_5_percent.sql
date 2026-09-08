-- La commission passe de 3 % a 5 %.
--
-- Demande du client du 2026-09-08 : « On va finalement mettre 5% et integrer
-- directement au prix des annonces. Si le vendeur met 10 000 GNF, l'appli
-- rajoute les +5% et affiche 10 500 GNF. Le client lui voit 10 500 GNF. »
--
-- CE FICHIER NE FAIT QUE LE TAUX. L'affichage — montrer 10 500 sur l'annonce
-- au lieu de 10 000, avec la mention « Frais inclus » — se joue cote
-- application, sur les ecrans qui affichent un prix. Les deux vont ensemble
-- mais ne vivent pas au meme endroit.
--
-- CE QUI NE CHANGE PAS, ET C'EST L'ESSENTIEL. Le modele reste identique :
--   amount_minor  ce que le VENDEUR touche, entier          10 000
--   fees_minor    ce que LINKY prend, en plus                  500
--   total_minor   ce que l'ACHETEUR paie                    10 500
-- La commission etait deja portee par l'acheteur et ajoutee au prix ; elle
-- passe simplement de 3 a 5 % et devient visible plus tot, des l'annonce.
-- Aucune ecriture comptable ne change de forme, aucun vendeur ne touche moins.
--
-- LES QUATRE ENDROITS QUI CALCULENT UNE COMMISSION, releves sur la production :
--   place_order         (SQL)   -- ce fichier
--   place_order_multi   (SQL)   -- ce fichier
--   place_orders_batch  (SQL)   -- ce fichier
--   booking-request     (edge)  -- modifie a cote, meme commit
-- Il n'y en a pas d'autre : l'achat d'un bien immobilier passe par une demande
-- et ne preleve rien.
--
-- Les corps sont repris DEPLOYES tels quels et un seul nombre y change. Ces
-- fonctions portent de l'argent ; une reecriture complete pourrait emporter une
-- garde au passage, comme l'a montre le trou du frais de livraison le 2026-09-07.


CREATE OR REPLACE FUNCTION public.place_order(p_buyer_id uuid, p_product_id uuid, p_quantity integer, p_payment_method text, p_delivery_mode text DEFAULT 'delivery'::text, p_delivery_fee_minor bigint DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

declare

  v_product           record;

  v_seller_id         uuid;

  v_amount_minor      bigint;

  v_fees_minor        bigint;

  v_delivery_fee      bigint;

  v_total_minor       bigint;

  v_order_id          uuid;

  v_reference         text;

  v_now               timestamptz := now();

  v_buyer_wallet_id   uuid;

  v_escrow_wallet_id  uuid;

begin

  if p_quantity is null or p_quantity <= 0 then

    raise exception 'INVALID_QUANTITY';

  end if;



  if p_delivery_mode is null or p_delivery_mode not in ('pickup', 'delivery') then

    raise exception 'INVALID_DELIVERY_MODE';

  end if;



  -- Le serveur est autoritaire sur le frais : un retrait est toujours gratuit,

  -- un frais négatif est refusé. L'edge fn passe le forfait pour 'delivery'.

  if p_delivery_mode = 'pickup' then

    v_delivery_fee := 0;

  else

    v_delivery_fee := coalesce(p_delivery_fee_minor, 0);

    if v_delivery_fee < 0 then raise exception 'INVALID_DELIVERY_FEE'; end if;

  end if;



  select p.id, p.shop_id, p.title, p.photos, p.price_minor, p.status, s.owner_id

    into v_product

    from public.products p

    join public.shops s on s.id = p.shop_id

    where p.id = p_product_id

    for update of p;

  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if v_product.status <> 'active' then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;



  v_seller_id := v_product.owner_id;

  if v_seller_id = p_buyer_id then raise exception 'BUYER_IS_SELLER'; end if;



  v_amount_minor := v_product.price_minor * p_quantity;

  v_fees_minor   := round(v_amount_minor * 0.05);

  v_total_minor  := v_amount_minor + v_fees_minor + v_delivery_fee;

  v_reference    := public.generate_order_reference();



  if p_payment_method = 'wallet' then

    -- WALLET BRANCH : transfert atomique buyer -> escrow du total (frais de

    -- livraison inclus).

    insert into public.wallets (user_id, currency)

      values (p_buyer_id, 'GNF')

      on conflict (user_id, currency) do nothing;



    select id into v_buyer_wallet_id

      from public.wallets

      where user_id = p_buyer_id and currency = 'GNF';



    select id into v_escrow_wallet_id

      from public.wallets

      where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';



    insert into public.orders (

      reference, buyer_id, seller_id, shop_id, product_id,

      product_snapshot, quantity, amount_minor, fees_minor, total_minor,

      delivery_mode, delivery_fee_minor,

      payment_method, status, events

    ) values (

      v_reference, p_buyer_id, v_seller_id, v_product.shop_id, v_product.id,

      jsonb_build_object('title', v_product.title, 'photo', coalesce(v_product.photos[1], ''), 'priceGnf', v_product.price_minor),

      p_quantity, v_amount_minor, v_fees_minor, v_total_minor,

      p_delivery_mode, v_delivery_fee,

      p_payment_method,

      'paid',

      jsonb_build_array(

        jsonb_build_object('at', v_now, 'label', 'Commande passée'),

        jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')

      )

    )

    returning id into v_order_id;



    perform public.post_transfer(

      v_buyer_wallet_id, v_escrow_wallet_id, v_total_minor,

      'order_escrow', v_order_id

    );

  else

    -- RAIL BRANCH : insertion à 'placed', aucun mouvement de fonds. Les intents

    -- Lengopay passent à 'paid' via cron-poll-intents (process_intent_outcome

    -- crédite l'escrow avec total_minor, frais de livraison inclus) ; les intents

    -- stripe via stripe-webhook.

    insert into public.orders (

      reference, buyer_id, seller_id, shop_id, product_id,

      product_snapshot, quantity, amount_minor, fees_minor, total_minor,

      delivery_mode, delivery_fee_minor,

      payment_method, status, events

    ) values (

      v_reference, p_buyer_id, v_seller_id, v_product.shop_id, v_product.id,

      jsonb_build_object('title', v_product.title, 'photo', coalesce(v_product.photos[1], ''), 'priceGnf', v_product.price_minor),

      p_quantity, v_amount_minor, v_fees_minor, v_total_minor,

      p_delivery_mode, v_delivery_fee,

      p_payment_method,

      'placed',

      jsonb_build_array(jsonb_build_object('at', v_now, 'label', 'Commande passée'))

    )

    returning id into v_order_id;

  end if;



  return v_order_id;

end;

$function$;

CREATE OR REPLACE FUNCTION public.place_order_multi(p_buyer_id uuid, p_items jsonb, p_payment_method text, p_delivery_mode text DEFAULT 'delivery'::text, p_delivery_fee_minor bigint DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

declare

  v_item             jsonb;

  v_product          record;

  v_first            record;

  v_seller_id        uuid;

  v_shop_id          uuid;

  v_qty              integer;

  v_line_amount      bigint;

  v_amount_minor     bigint := 0;

  v_fees_minor       bigint;

  v_delivery_fee     bigint;

  v_total_minor      bigint;

  v_order_id         uuid;

  v_reference        text;

  v_now              timestamptz := now();

  v_buyer_wallet_id  uuid;

  v_escrow_wallet_id uuid;

  v_lines            jsonb := '[]'::jsonb;

  v_seen             uuid[] := '{}';

begin

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then

    raise exception 'INVALID_ITEMS';

  end if;

  if jsonb_array_length(p_items) > 20 then

    raise exception 'TOO_MANY_ITEMS';

  end if;

  if p_delivery_mode is null or p_delivery_mode not in ('pickup', 'delivery') then

    raise exception 'INVALID_DELIVERY_MODE';

  end if;



  -- Delivery is charged once per ORDER, not per article (one seller, one drop).

  if p_delivery_mode = 'pickup' then

    v_delivery_fee := 0;

  else

    v_delivery_fee := coalesce(p_delivery_fee_minor, 0);

    if v_delivery_fee < 0 then raise exception 'INVALID_DELIVERY_FEE'; end if;

  end if;



  -- Pass 1 — lock every product, validate, and total up.

  for v_item in select * from jsonb_array_elements(p_items)

  loop

    v_qty := coalesce((v_item ->> 'quantity')::int, 0);

    if v_qty <= 0 or v_qty > 100 then raise exception 'INVALID_QUANTITY'; end if;



    select p.id, p.shop_id, p.title, p.photos, p.price_minor, p.status, s.owner_id

      into v_product

      from public.products p

      join public.shops s on s.id = p.shop_id

      where p.id = (v_item ->> 'product_id')::uuid

      for update of p;

    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

    if v_product.status <> 'active' then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;



    -- The same article twice in one payload would double-charge silently.

    if v_product.id = any(v_seen) then raise exception 'DUPLICATE_ITEM'; end if;

    v_seen := v_seen || v_product.id;



    if v_shop_id is null then

      v_shop_id  := v_product.shop_id;

      v_seller_id := v_product.owner_id;

      v_first    := v_product;

    elsif v_product.shop_id <> v_shop_id then

      -- Enforced here too, not only in the app: one order can never mix sellers,

      -- otherwise a single escrow would owe money to two people.

      raise exception 'MULTIPLE_SELLERS';

    end if;



    if v_seller_id = p_buyer_id then raise exception 'BUYER_IS_SELLER'; end if;



    v_line_amount  := v_product.price_minor * v_qty;

    v_amount_minor := v_amount_minor + v_line_amount;



    v_lines := v_lines || jsonb_build_array(jsonb_build_object(

      'product_id', v_product.id,

      'quantity', v_qty,

      'unit_price_minor', v_product.price_minor,

      'amount_minor', v_line_amount,

      'snapshot', jsonb_build_object(

        'title', v_product.title,

        'photo', coalesce(v_product.photos[1], ''),

        'priceGnf', v_product.price_minor

      )

    ));

  end loop;



  v_fees_minor  := round(v_amount_minor * 0.05);

  v_total_minor := v_amount_minor + v_fees_minor + v_delivery_fee;

  v_reference   := public.generate_order_reference();



  -- orders.* keep the PRIMARY article so every existing reader stays valid.

  insert into public.orders (

    reference, buyer_id, seller_id, shop_id, product_id,

    product_snapshot, quantity, amount_minor, fees_minor, total_minor,

    delivery_mode, delivery_fee_minor,

    payment_method, status, events

  ) values (

    v_reference, p_buyer_id, v_seller_id, v_shop_id, v_first.id,

    jsonb_build_object('title', v_first.title, 'photo', coalesce(v_first.photos[1], ''), 'priceGnf', v_first.price_minor),

    coalesce(((p_items -> 0) ->> 'quantity')::int, 1),

    v_amount_minor, v_fees_minor, v_total_minor,

    p_delivery_mode, v_delivery_fee,

    p_payment_method,

    case when p_payment_method = 'wallet' then 'paid' else 'placed' end,

    case when p_payment_method = 'wallet' then

      jsonb_build_array(

        jsonb_build_object('at', v_now, 'label', 'Commande passée'),

        jsonb_build_object('at', v_now, 'label', 'Paiement reçu en séquestre')

      )

    else

      jsonb_build_array(jsonb_build_object('at', v_now, 'label', 'Commande passée'))

    end

  )

  returning id into v_order_id;



  -- Pass 2 — every article, including the primary one, so the order lines are

  -- complete on their own and a reader never has to merge two shapes.

  insert into public.order_items (order_id, product_id, product_snapshot, quantity, unit_price_minor, amount_minor)

  select

    v_order_id,

    (l ->> 'product_id')::uuid,

    l -> 'snapshot',

    (l ->> 'quantity')::int,

    (l ->> 'unit_price_minor')::bigint,

    (l ->> 'amount_minor')::bigint

  from jsonb_array_elements(v_lines) as l;



  -- Wallet pays immediately into escrow; rails settle later (cron-poll-intents

  -- / stripe-webhook credit escrow with total_minor). Identical to place_order.

  if p_payment_method = 'wallet' then

    insert into public.wallets (user_id, currency)

      values (p_buyer_id, 'GNF')

      on conflict (user_id, currency) do nothing;



    select id into v_buyer_wallet_id

      from public.wallets where user_id = p_buyer_id and currency = 'GNF';



    select id into v_escrow_wallet_id

      from public.wallets

      where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';



    perform public.post_transfer(

      v_buyer_wallet_id, v_escrow_wallet_id, v_total_minor,

      'order_escrow', v_order_id

    );

  end if;



  return v_order_id;

end;

$function$;

CREATE OR REPLACE FUNCTION public.place_orders_batch(p_buyer_id uuid, p_items jsonb, p_payment_method text, p_delivery_mode text DEFAULT 'delivery'::text, p_delivery_fee_minor bigint DEFAULT 0, p_address_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

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

  v_order_id         uuid;

  v_seller_id        uuid;

  v_primary          jsonb;

  v_buyer_wallet_id  uuid;

  v_escrow_wallet_id uuid;

  v_group_total      bigint;          -- prix groupe du panier (NULL = non applicable)

  v_indiv_sum        bigint;          -- somme des prix par boutique (base du prorata)

  v_indiv_fee        bigint;

  v_allocated        bigint := 0;     -- deja reparti sur les commandes precedentes

  v_shop_idx         integer := 0;

  v_shop_count       integer;

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



    if v_product.id = any(v_seen) then raise exception 'DUPLICATE_ITEM'; end if;

    v_seen := v_seen || v_product.id;



    if v_product.owner_id = p_buyer_id then raise exception 'BUYER_IS_SELLER'; end if;



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



  -- ── Livraison groupee (client 2026-09-05) ────────────────────────────────

  -- Quand le panier couvre plusieurs boutiques, on facture le MOINS CHER entre

  -- la somme boutique-par-boutique (chemins opposes) et le trajet reel enchaine

  -- A -> B -> client (meme chemin). delivery_group_fee_minor rend NULL des

  -- qu'un seul point n'est pas un vrai pin : on retombe alors exactement sur le

  -- comportement d'avant, boutique par boutique.

  v_shop_count := coalesce(array_length(v_shops, 1), 0);

  v_group_total := null;

  if p_delivery_mode = 'delivery' and p_address_id is not null and v_shop_count > 1 then

    v_group_total := public.delivery_group_fee_minor(v_shops, p_address_id);

    if v_group_total is not null then

      select sum(public.delivery_fee_for_shop(x, p_address_id))

        into v_indiv_sum

        from unnest(v_shops) as x;

      -- Base du prorata inutilisable : on renonce au groupage plutot que de

      -- diviser par zero.

      if v_indiv_sum is null or v_indiv_sum <= 0 then

        v_group_total := null;

      end if;

    end if;

  end if;



  -- ── Passe 2 : une commande par boutique, chacune avec SA livraison ───────

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



    v_shop_fees := round(v_shop_amount * 0.05);



    -- CHANGEMENT 2026-08-22 : chaque boutique porte son propre forfait. Chaque

    -- commande est ainsi autonome — son total couvre reellement son colis, ce

    -- qui rend la reconciliation avec le livreur possible. Aucun arrondi n'est

    -- introduit (le forfait est un entier repete), donc la somme des totaux

    -- retombe toujours exactement sur le montant paye : c'est cette egalite que

    -- verifie process_batch_intent_outcome avant d'alimenter le sequestre.

    -- CHANGEMENT 2026-09-03 : prix a la DISTANCE quand elle est fiable.

    -- delivery_fee_for_shop rend NULL des que l'un des deux points n'est pas

    -- un vrai pin (coordonnees encore egales au centroide de la ville) : on

    -- retombe alors sur le forfait, plutot que de facturer une geometrie

    -- fictive. La propriete de 2026-08-22 tient toujours — chaque montant

    -- reste un entier, donc la somme des totaux retombe exactement sur le

    -- montant paye, egalite que process_batch_intent_outcome verifie avant

    -- d'alimenter le sequestre.

    -- CHANGEMENT 2026-09-05 : quand le panier est groupe (v_group_total non

    -- NULL), le prix du trajet enchaine est reparti au prorata de la distance

    -- de chaque boutique. La DERNIERE commande recoit le reste exact, pour que

    -- la somme des livraisons retombe pile sur v_group_total — c'est l'egalite

    -- somme(total_minor) = montant paye que process_batch_intent_outcome

    -- verifie avant d'alimenter le sequestre.

    v_shop_idx := v_shop_idx + 1;

    if p_delivery_mode = 'delivery' and p_address_id is not null then

      if v_group_total is not null then

        if v_shop_idx = v_shop_count then

          v_shop_delivery := v_group_total - v_allocated;

        else

          v_indiv_fee := public.delivery_fee_for_shop(v_shop, p_address_id);

          v_shop_delivery := floor(v_group_total::numeric * v_indiv_fee / v_indiv_sum)::bigint;

          v_allocated := v_allocated + v_shop_delivery;

        end if;

      else

        v_shop_delivery := coalesce(

          public.delivery_fee_for_shop(v_shop, p_address_id),

          v_delivery_fee);

      end if;

    else

      v_shop_delivery := v_delivery_fee;

    end if;



    v_shop_total := v_shop_amount + v_shop_fees + v_shop_delivery;



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



    if p_payment_method = 'wallet' then

      insert into public.wallets (user_id, currency)

        values (p_buyer_id, 'GNF')

        on conflict (user_id, currency) do nothing;



      select id into v_buyer_wallet_id

        from public.wallets where user_id = p_buyer_id and currency = 'GNF';

      select id into v_escrow_wallet_id

        from public.wallets

        where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

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

$function$;


-- Supabase peut reaccorder EXECUTE a tout le monde a chaque CREATE OR REPLACE.
-- Sur des fonctions qui creent des commandes et deplacent de l'argent, l'oublier
-- les rendrait appelables par n'importe quel utilisateur connecte. Signatures
-- LUES dans le catalogue : une seule mal recopiee ferait echouer la migration
-- entiere, donc annulerait aussi le changement de taux.
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('place_order', 'place_order_multi', 'place_orders_batch')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $grants$;
