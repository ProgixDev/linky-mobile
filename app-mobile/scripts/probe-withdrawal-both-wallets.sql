-- ===========================================================================
-- SONDE : un retrait puise dans les DEUX caisses (Vendeur puis Immo)
-- ===========================================================================
--
-- CE QUI A CHANGÉ (20261028_03). `request_withdrawal_total` répartit un
-- retrait sur la caisse Vendeur d'abord, l'Immo complète, en posant UNE
-- demande par caisse via `request_withdrawal` inchangée. Avant, seul le
-- Vendeur comptait : le client voyait 57 400 au Portefeuille et ne pouvait
-- retirer que 18 400 ; un agent sans caisse Vendeur ne pouvait rien retirer.
--
-- CE QUE LA SONDE PROUVE :
--   1. un montant qui dépasse le Vendeur est couvert par l'Immo : deux
--      demandes approved, la bonne caisse sur chacune, les deux soldes
--      amputés exactement ;
--   2. au-delà du total, refus `insufficient_funds` et RIEN n'est créé
--      (pas de demande partielle sur une seule caisse) ;
--   3. Vendeur vide : le retrait part de l'Immo seule ;
--   4. un montant couvert par le Vendeur ne touche pas l'Immo ;
--   5. annuler la part Immo la rend à l'IMMO, rejeter la part Vendeur la
--      rend au VENDEUR (chaque restitution retrouve sa caisse) ;
--   6. destination sans numéro : refus, rien de créé.
--
-- SON CONTRÔLE NÉGATIF : NEG = true retire la lecture de la caisse Immo (ce
-- que faisait l'ancien chemin) et la sonde DOIT échouer à l'étape 1 sur :
--     ECHEC : la caisse Immo n'est pas prise en compte
--
-- COMMENT LA LANCER : éditeur SQL ou POST .../database/query. Se termine par
-- `rollback`. Emprunte un vrai utilisateur (jamais un compte système, qui ne
-- peut pas avoir de caisse Immo) et un vrai admin. Attentes RELATIVES aux
-- soldes mesurés au départ.
-- ===========================================================================

begin;

do $t$
declare
  NEG       constant boolean := false;   -- true = controle negatif
  v_user    uuid;
  v_admin   uuid;
  v_ws      uuid;   -- caisse vendeur
  v_wi      uuid;   -- caisse immo
  S         bigint; -- solde vendeur de depart (apres credit d'essai)
  I         bigint; -- solde immo de depart
  v_n       int;
  v_req_s   uuid;
  v_req_i   uuid;
  v_msg     text;
  v_src     text;
  DEST      constant text := 'Orange Money - 622 33 44 55';
begin
  select id into v_admin from public.users where is_admin order by created_at limit 1;
  select id into v_user from public.users
   where coalesce(is_admin, false) = false and id <> v_admin
     and id not in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
   order by created_at limit 1;
  if v_admin is null or v_user is null then raise exception 'pas de jeu de donnees'; end if;

  if NEG then
    select pg_get_functiondef(p.oid) into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'request_withdrawal_total';
    if position('if v_immo_id is not null then' in v_src) = 0 then
      raise exception 'controle negatif : ancre introuvable';
    end if;
    execute replace(v_src, 'if v_immo_id is not null then', 'if false then');
    raise notice 'CONTROLE NEGATIF : la caisse Immo n-est plus lue';
  end if;

  -- Deux caisses, creditees de 20 000 (vendeur) et 30 000 (immo).
  insert into public.wallets (user_id, kind, currency) values (v_user, 'seller', 'GNF')
  on conflict (user_id, kind, currency) do nothing;
  insert into public.wallets (user_id, kind, currency) values (v_user, 'immo', 'GNF')
  on conflict (user_id, kind, currency) do nothing;
  select id into v_ws from public.wallets where user_id = v_user and kind = 'seller' and currency = 'GNF';
  select id into v_wi from public.wallets where user_id = v_user and kind = 'immo' and currency = 'GNF';

  S := coalesce((select balance_after from public.ledger_entries where wallet_id = v_ws
                 order by created_at desc, id desc limit 1), 0);
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
       values (v_ws, 'credit', 20000, S + 20000, 'credit', gen_random_uuid());
  S := S + 20000;
  I := coalesce((select balance_after from public.ledger_entries where wallet_id = v_wi
                 order by created_at desc, id desc limit 1), 0);
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
       values (v_wi, 'credit', 30000, I + 30000, 'credit', gen_random_uuid());
  I := I + 30000;

  -- ══ 1 : le Vendeur entier + 1 000 pris sur l'Immo ═══════════════════════
  begin
    select count(*) into v_n from public.request_withdrawal_total(v_user, 'GNF', S + 1000, DEST);
  exception when others then
    if sqlerrm = 'insufficient_funds' then
      raise exception 'ECHEC : la caisse Immo n-est pas prise en compte';
    end if;
    raise;
  end;
  if v_n <> 2 then raise exception 'ECHEC : % demande(s) au lieu de 2', v_n; end if;
  select id into v_req_s from public.withdrawal_requests
   where user_id = v_user and wallet_kind = 'seller' and status = 'approved' and amount_minor = S
   order by created_at desc limit 1;
  select id into v_req_i from public.withdrawal_requests
   where user_id = v_user and wallet_kind = 'immo' and status = 'approved' and amount_minor = 1000
   order by created_at desc limit 1;
  if v_req_s is null or v_req_i is null then
    raise exception 'ECHEC : repartition fausse (attendu vendeur % + immo 1000)', S;
  end if;
  if coalesce((select balance_after from public.ledger_entries where wallet_id = v_ws
               order by created_at desc, id desc limit 1), 0) <> 0 then
    raise exception 'ECHEC : la caisse Vendeur n-est pas videe';
  end if;
  if (select balance_after from public.ledger_entries where wallet_id = v_wi
       order by created_at desc, id desc limit 1) <> I - 1000 then
    raise exception 'ECHEC : la caisse Immo n-a pas perdu exactement 1000';
  end if;

  -- ══ 2 : au-dela du total, rien n'est cree ═══════════════════════════════
  select count(*) into v_n from public.withdrawal_requests where user_id = v_user;
  begin
    perform public.request_withdrawal_total(v_user, 'GNF', (I - 1000) + 1, DEST);
    raise exception 'ECHEC : plus que le total a ete retenu';
  exception when others then
    if sqlerrm <> 'insufficient_funds' then raise; end if;
  end;
  if (select count(*) from public.withdrawal_requests where user_id = v_user) <> v_n then
    raise exception 'ECHEC : une demande partielle a survecu au refus';
  end if;

  -- ══ 3 : Vendeur vide -> tout vient de l'Immo ════════════════════════════
  select count(*) into v_n from public.request_withdrawal_total(v_user, 'GNF', 2000, DEST);
  if v_n <> 1 then raise exception 'ECHEC : % demande(s) au lieu de 1 (immo seule)', v_n; end if;
  if (select wallet_kind from public.withdrawal_requests where user_id = v_user
       order by created_at desc, id desc limit 1) <> 'immo' then
    raise exception 'ECHEC : avec un Vendeur vide, la demande n-est pas sur l-Immo';
  end if;

  -- ══ 4 : couvert par le Vendeur -> l'Immo n'est pas touchee ══════════════
  insert into public.ledger_entries (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
       values (v_ws, 'credit', 5000, 5000, 'credit', gen_random_uuid());
  select count(*) into v_n from public.request_withdrawal_total(v_user, 'GNF', 3000, DEST);
  if v_n <> 1 then raise exception 'ECHEC : % demande(s) au lieu de 1 (vendeur seul)', v_n; end if;
  if (select balance_after from public.ledger_entries where wallet_id = v_wi
       order by created_at desc, id desc limit 1) <> I - 3000 then
    raise exception 'ECHEC : l-Immo a ete touchee alors que le Vendeur suffisait';
  end if;

  -- ══ 5 : chaque restitution retrouve SA caisse ═══════════════════════════
  perform public.cancel_withdrawal(v_req_i, v_user);
  if (select balance_after from public.ledger_entries where wallet_id = v_wi
       order by created_at desc, id desc limit 1) <> I - 2000 then
    raise exception 'ECHEC : l-annulation de la part Immo n-a pas credite l-Immo';
  end if;
  perform public.process_withdrawal(v_req_s, v_admin, 'rejected', 'sonde');
  if (select balance_after from public.ledger_entries where wallet_id = v_ws
       order by created_at desc, id desc limit 1) <> 2000 + S then
    raise exception 'ECHEC : le rejet de la part Vendeur n-a pas credite le Vendeur';
  end if;

  -- ══ 6 : destination sans numero ═════════════════════════════════════════
  select count(*) into v_n from public.withdrawal_requests where user_id = v_user;
  begin
    perform public.request_withdrawal_total(v_user, 'GNF', 1000, 'Orange Money');
    raise exception 'ECHEC : une demande SANS NUMERO a ete acceptee';
  exception when others then
    if sqlerrm <> 'destination_required' then raise; end if;
  end;
  if (select count(*) from public.withdrawal_requests where user_id = v_user) <> v_n then
    raise exception 'ECHEC : une demande sans numero a survecu';
  end if;

  raise notice 'retrait sur les deux caisses : repartition, refus atomique, restitutions justes';
end
$t$;

rollback;
