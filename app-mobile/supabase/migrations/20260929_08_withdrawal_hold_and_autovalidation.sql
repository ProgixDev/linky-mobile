-- ===========================================================================
-- LE RETRAIT SE VALIDE TOUT SEUL, ET LES FONDS SONT RETENUS
-- 2026-09-28 — demande du client
-- ===========================================================================
--
-- « Je sais pas si t'avais automatisé la demande de retrait, comme ça dans le
--   BackOffice on gère juste le suivi des retraits pas de les faire. »
--
-- ┌─ CE QUI PEUT ÊTRE AUTOMATISÉ, ET CE QUI NE PEUT PAS ────────────────────┐
-- Le VIREMENT lui-même ne peut pas l'être : il faudrait une API de
-- décaissement, et Lengopay n'expose que de l'encaissement (mesuré le
-- 2026-09-28 : ses dix-sept routes publiques sont toutes des encaissements).
-- Tant que le client n'a pas un produit payout ou des comptes Orange/MTN
-- Disbursement, quelqu'un doit envoyer l'argent à la main.
--
-- En revanche, la DÉCISION peut l'être — et c'est elle qui faisait du
-- back-office un poste de traitement plutôt qu'un tableau de suivi.
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ ET C'EST AUSSI UN CORRECTIF D'ARGENT, PAS QU'UN CONFORT ───────────────┐
-- Aujourd'hui rien n'est retenu à la demande : `process_withdrawal('paid')`
-- revérifie le solde et débite AU MOMENT où l'administrateur coche « payé ».
-- Or il coche APRÈS avoir envoyé l'argent pour de vrai. Entre sa vérification
-- et son virement, le vendeur peut dépenser son solde — et la fonction lève
-- alors `insufficient_funds` sur de l'argent DÉJÀ PARTI. La perte est pour
-- Linky, et rien ne la rattrape.
--
-- La fenêtre est courte aujourd'hui ; elle deviendrait large avec une
-- validation automatique. On ne peut donc pas automatiser SANS retenir. Les
-- deux vont ensemble, et c'est pour ça qu'ils sont dans la même migration.
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- LA NOUVELLE VIE D'UNE DEMANDE :
--   `approved`  posée par `request_withdrawal` — validée, fonds RETENUS
--               (débit `withdrawal_hold` immédiat). Le solde du vendeur baisse
--               tout de suite : c'est honnête, cet argent est réservé.
--   `paid`      l'administrateur a envoyé le virement et le confirme. AUCUN
--               mouvement : l'argent est déjà sorti du solde.
--   `rejected`  il refuse. Les fonds retenus sont RENDUS
--               (crédit `withdrawal_release`). Le garde-fou humain n'est donc
--               pas supprimé — il est déplacé là où il sert : devant la file,
--               avant d'envoyer l'argent.
--
-- ⚠️ `approved` existait DÉJÀ dans la contrainte de statut sans jamais servir.
-- Aucune contrainte à modifier, aucune reprise de données : les demandes
-- `pending` encore en base (il y en a) gardent l'ancien chemin, débit au
-- paiement. Les deux régimes coexistent sans se marcher dessus.

begin;

-- ---------------------------------------------------------------------------
-- 1. LA DEMANDE SE VALIDE ELLE-MÊME ET RETIENT LES FONDS
-- ---------------------------------------------------------------------------
create or replace function public.request_withdrawal(
  p_user_id      uuid,
  p_currency     text,
  p_amount_minor bigint,
  p_destination  text,
  p_wallet_kind  text default 'seller'
)
returns setof public.withdrawal_requests
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_wallet_id uuid;
  v_balance   bigint;
  v_dest      text := btrim(coalesce(p_destination, ''));
  v_id        uuid;
begin
  if p_currency not in ('GNF', 'EUR') then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;
  if p_wallet_kind not in ('seller', 'immo') then
    raise exception 'invalid_wallet_kind' using errcode = '22023';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- OU ENVOYER L'ARGENT. La regle vit ICI autant que dans la fonction edge :
  -- une regle qu'on peut contourner en appelant l'API autrement n'est pas une
  -- regle. On verifie qu'un NUMERO est la (huit chiffres), pas sa mise en
  -- forme -- exiger " Orange Money -- 6XX XX XX XX " au caractere pres
  -- casserait le jour ou un libelle d'operateur change.
  if length(v_dest) < 6 or length(v_dest) > 128
     or length(regexp_replace(v_dest, '[^0-9]', '', 'g')) < 8 then
    raise exception 'destination_required' using errcode = '22023';
  end if;

  -- LE VERROU D'ABORD. C'est lui qui serialise deux demandes simultanees : sans
  -- lui, deux appels concurrents liraient le meme solde et retiendraient chacun
  -- la totalite. Meme raisonnement que la garde de stock sur les commandes.
  select id into v_wallet_id
    from public.wallets
   where user_id = p_user_id and kind = p_wallet_kind and currency = p_currency
   for update;
  if v_wallet_id is null then
    raise exception 'insufficient_funds'
      using errcode = '22023', detail = 'no wallet for ' || p_wallet_kind || '/' || p_currency;
  end if;

  v_balance := coalesce(
    (select balance_after from public.ledger_entries
      where wallet_id = v_wallet_id
      order by created_at desc, id desc limit 1), 0);
  if v_balance < p_amount_minor then
    raise exception 'insufficient_funds'
      using errcode = '22023',
            detail = format('balance %s < amount %s', v_balance, p_amount_minor);
  end if;

  -- `decided_at` est pose, `decided_by` reste NUL : c'est le systeme qui a
  -- tranche, et l'absence d'administrateur est precisement l'information.
  insert into public.withdrawal_requests
    (user_id, currency, amount_minor, destination, wallet_kind, status, decided_at)
  values
    (p_user_id, p_currency, p_amount_minor, v_dest, p_wallet_kind, 'approved', now())
  returning id into v_id;

  -- LA RETENUE. Sortie externe a un seul cote, meme convention de
  -- `balance_after` que le reste du grand livre.
  insert into public.ledger_entries
    (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
  values
    (v_wallet_id, 'debit', p_amount_minor, v_balance - p_amount_minor,
     'withdrawal_hold', v_id);

  return query select * from public.withdrawal_requests where id = v_id;
end
$fn$;

comment on function public.request_withdrawal(uuid, text, bigint, text, text) is
  'Valide la demande et RETIENT les fonds immediatement (withdrawal_hold). '
  'Sans retenue, le vendeur peut depenser son solde entre la verification de '
  'l''administrateur et son virement : la fonction leverait insufficient_funds '
  'sur de l''argent deja parti, et la perte serait pour Linky.';

-- ---------------------------------------------------------------------------
-- 2. LE TRAITEMENT ADMIN S'ADAPTE AUX DEUX RÉGIMES
-- ---------------------------------------------------------------------------
-- CHIRURGIE sur le corps DÉPLOYÉ plutôt qu'une réécriture : le texte inséré est
-- volontairement ASCII, et tout ce qui existait — le verrou sur la demande, la
-- garde d'idempotence, la ligne d'audit atomique — reste intact sans que j'aie
-- à le retranscrire.
do $fn$
declare
  v_src text;
  v_new text;
  a_status constant text := 'if v_req.status <> ''pending'' then';
  a_paid   constant text := 'if p_outcome = ''paid'' then';
  a_rej    constant text := '-- ''rejected'' : no money movement (nothing was held).';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'process_withdrawal' limit 1;
  if v_src is null then raise exception 'process_withdrawal introuvable'; end if;

  if position('withdrawal_release' in v_src) > 0 then
    raise notice 'process_withdrawal connait deja les demandes validees';
  else
    if (length(v_src) - length(replace(v_src, a_status, ''))) / length(a_status) <> 1 then
      raise exception 'process_withdrawal : ancre STATUT'; end if;
    if (length(v_src) - length(replace(v_src, a_paid, ''))) / length(a_paid) <> 1 then
      raise exception 'process_withdrawal : ancre PAID'; end if;
    if (length(v_src) - length(replace(v_src, a_rej, ''))) / length(a_rej) <> 1 then
      raise exception 'process_withdrawal : ancre REJECTED'; end if;

    -- (a) une demande VALIDEE est encore traitable
    v_new := replace(v_src, a_status, 'if v_req.status not in (''pending'', ''approved'') then');

    -- (b) le debit historique ne concerne QUE les demandes d'avant la retenue.
    --     Sur une demande validee, l'argent est deja sorti du solde : un second
    --     debit le retirerait deux fois.
    v_new := replace(v_new, a_paid, 'if p_outcome = ''paid'' and v_req.status = ''pending'' then');

    -- (c) refuser une demande VALIDEE doit RENDRE les fonds retenus. Sans ca,
    --     le vendeur perdrait l'argent sans l'avoir recu : c'est le chemin qui
    --     rend la retenue acceptable.
    v_new := replace(v_new, a_rej,
'-- REJET. Une demande ''pending'' n''avait rien retenu : rien a rendre.
  -- Une demande ''approved'', si : on lui rend ses fonds, sinon le vendeur
  -- perdrait l''argent sans jamais l''avoir recu.
  if p_outcome = ''rejected'' and v_req.status = ''approved'' then
    select id into v_wallet_id
      from public.wallets
     where user_id = v_req.user_id and kind = v_req.wallet_kind and currency = v_req.currency
     for update;
    if v_wallet_id is null then
      raise exception ''wallet_missing'' using errcode = ''P0002'';
    end if;
    v_balance := coalesce(
      (select balance_after from public.ledger_entries
         where wallet_id = v_wallet_id
         order by created_at desc, id desc limit 1), 0);
    insert into public.ledger_entries
      (wallet_id, direction, amount_minor, balance_after, ref_type, ref_id)
    values
      (v_wallet_id, ''credit'', v_req.amount_minor,
       v_balance + v_req.amount_minor, ''withdrawal_release'', p_request_id);
  end if;');

    execute v_new;
    raise notice 'process_withdrawal : paiement sans double debit, rejet qui rend les fonds';
  end if;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 3. LA VENTILATION RECONNAÎT LES TROIS MOUVEMENTS DE RETRAIT
-- ---------------------------------------------------------------------------
-- Elle ne connaissait que `debit`. `withdrawal_payout` tombait déjà dans
-- « Autres » alors que la fonction de traitement l'écrit depuis juin, et les
-- deux nouveaux auraient suivi. La somme des origines doit rester ÉGALE au
-- solde : c'est la promesse de cet écran, et une origine mal rangée ne la casse
-- pas mais la rend illisible.
create or replace function public.get_wallet_origin_breakdown(p_user_id uuid)
returns table(kind text, currency text, origin text, net_minor bigint)
language sql
stable
security definer
set search_path to ''
as $fn$
  select w.kind,
         w.currency,
         case le.ref_type
           when 'order_release'      then 'products'
           when 'booking_release'    then 'properties'
           when 'credit'             then 'topup'
           when 'debit'              then 'withdrawal'
           when 'withdrawal_hold'    then 'withdrawal'
           when 'withdrawal_payout'  then 'withdrawal'
           when 'withdrawal_release' then 'withdrawal'
           when 'boost_purchase'     then 'boost'
           when 'order_escrow'       then 'purchase'
           when 'order_refund'       then 'refund'
           when 'order_fee_refund'   then 'refund'
           when 'booking_refund'     then 'refund'
           else 'other'
         end as origin,
         sum(case when le.direction = 'credit'
                  then le.amount_minor
                  else -le.amount_minor end)::bigint as net_minor
    from public.ledger_entries le
    join public.wallets w on w.id = le.wallet_id
   where w.user_id = p_user_id
   group by 1, 2, 3
  -- Une origine qui se solde a zero n'a rien a dire : on ne l'envoie pas.
  having sum(case when le.direction = 'credit'
                  then le.amount_minor
                  else -le.amount_minor end) <> 0
   order by 1, 2, 3;
$fn$;

-- Le durcissement du 2026-07-29 : Supabase re-accorde EXECUTE par defaut.
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('request_withdrawal', 'process_withdrawal',
                         'get_wallet_origin_breakdown')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$grants$;

-- ---------------------------------------------------------------------------
-- 4. CONTRÔLE
-- ---------------------------------------------------------------------------
do $check$
declare v_src text; v_g text; v_miss text;
begin
  -- la nouvelle fonction et ses gardes
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'request_withdrawal' limit 1;
  if v_src is null then raise exception 'request_withdrawal absente'; end if;
  v_miss := null;
  foreach v_g in array array[
    'invalid_currency', 'invalid_wallet_kind', 'invalid_amount',
    'destination_required', 'insufficient_funds',
    'for update', '''withdrawal_hold''', '''approved'''
  ] loop
    if position(v_g in v_src) = 0 then v_miss := coalesce(v_miss || ', ', '') || v_g; end if;
  end loop;
  if v_miss is not null then raise exception 'request_withdrawal : %', v_miss; end if;

  -- le traitement admin, correctif ET gardes preexistantes
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'process_withdrawal' limit 1;
  v_miss := null;
  foreach v_g in array array[
    -- le correctif
    'not in (''pending'', ''approved'')',
    'p_outcome = ''paid'' and v_req.status = ''pending''',
    'withdrawal_release',
    -- et tout ce qui existait avant
    'assert_admin', 'invalid_outcome', 'reason_required', 'request_not_found',
    'request_closed', 'insufficient_funds', 'withdrawal_payout',
    'admin_actions', 'for update'
  ] loop
    if position(v_g in v_src) = 0 then v_miss := coalesce(v_miss || ', ', '') || v_g; end if;
  end loop;
  if position(chr(65533) in v_src) > 0 then
    v_miss := coalesce(v_miss || ', ', '') || 'CARACTERE CASSE';
  end if;
  if v_miss is not null then raise exception 'process_withdrawal : %', v_miss; end if;

  -- la ventilation
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_wallet_origin_breakdown' limit 1;
  if position('withdrawal_hold' in v_src) = 0
     or position('withdrawal_payout' in v_src) = 0
     or position('withdrawal_release' in v_src) = 0 then
    raise exception 'la ventilation ne range pas les trois mouvements de retrait';
  end if;

  raise notice 'le retrait se valide seul, les fonds sont retenus, le rejet les rend';
end
$check$;

commit;
