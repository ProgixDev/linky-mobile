-- Versement Lengopay : le verrou qui empêche de payer deux fois.
--
-- ┌─ POURQUOI CE VERROU EXISTE ─────────────────────────────────────────────┐
-- L'API de versement de Lengopay (POST /api/v2/payout/request, relevée le
-- 2026-10-14) n'a AUCUNE clé d'idempotence. Rien dans la requête ne dit « c'est
-- le même versement que tout à l'heure ». Si notre appel part deux fois — un
-- nouvel essai après un délai dépassé, deux exécutions simultanées — ils
-- PAIENT DEUX FOIS, et cet argent ne revient pas.
--
-- La protection doit donc vivre entièrement chez nous, et elle doit être posée
-- AVANT l'appel HTTP, sous verrou de ligne. Un contrôle fait en lisant puis en
-- écrivant laisserait une fenêtre entre les deux.
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ CE QUE CETTE MIGRATION NE FAIT PAS ────────────────────────────────────┐
-- Elle ne touche à AUCUNE fonction d'argent existante. `process_withdrawal`
-- n'est ni remplacée ni modifiée : la clôture passera par elle, telle quelle,
-- exactement comme la console d'administration l'appelle déjà.
--
-- C'est délibéré. Les fichiers de migration de ce dépôt ont divergé de la
-- production (corrections appliquées en chirurgie de texte), donc réécrire une
-- fonction d'argent à partir d'eux ferait régresser des correctifs invisibles
-- ici. On ajoute à côté, on ne remplace rien.
-- └─────────────────────────────────────────────────────────────────────────┘

begin;

-- ── 1. Les colonnes du versement ──────────────────────────────────────────
alter table public.withdrawal_requests
  add column if not exists payout_claimed_at timestamptz,
  add column if not exists payout_pay_id     text,
  add column if not exists payout_status     text,
  add column if not exists payout_error      text;

comment on column public.withdrawal_requests.payout_claimed_at is
  'Posé SOUS VERROU juste avant l''appel Lengopay. Non nul = un versement est déjà parti ou en cours pour cette demande. C''est LUI qui empêche le double paiement, pas payout_pay_id (qui n''arrive qu''après la réponse).';
comment on column public.withdrawal_requests.payout_pay_id is
  'Identifiant Lengopay, écrit APRÈS leur réponse. ⚠ Leur pay_id s''écrit de plusieurs façons selon l''endpoint (avec ou sans le = de bourrage base64) : stocker tel quel, et interroger en essayant les variantes.';
comment on column public.withdrawal_requests.payout_status is
  'Dernier statut connu côté Lengopay : INITIATED, SUCCESS, FAILED. Renseigné par la vérification, jamais par le contenu du rappel — leur rappel n''est pas signé.';
comment on column public.withdrawal_requests.payout_error is
  'Pourquoi le versement automatique n''a pas pu se faire. Lisible par un administrateur qui devra le faire à la main.';

-- Un même pay_id ne peut pas se rattacher à deux demandes.
create unique index if not exists withdrawal_requests_payout_pay_id_uniq
  on public.withdrawal_requests (payout_pay_id)
  where payout_pay_id is not null;

-- Retrouver vite les versements partis mais jamais conclus (rattrapage).
create index if not exists withdrawal_requests_payout_en_cours
  on public.withdrawal_requests (payout_claimed_at)
  where payout_claimed_at is not null and payout_status is distinct from 'SUCCESS';

-- ── 2. Réserver une demande pour versement ────────────────────────────────
--
-- Verrouille la ligne, vérifie qu'elle est payable et qu'aucun versement n'est
-- déjà parti, pose l'empreinte, et rend la ligne. Tout dans la même
-- transaction : deux appels simultanés ne peuvent pas passer tous les deux.
create or replace function public.claim_withdrawal_for_payout(p_request_id uuid)
returns setof public.withdrawal_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_statut text;
  v_deja   timestamptz;
begin
  -- FOR UPDATE : la seconde transaction attend ici, puis voit l'empreinte.
  select status, payout_claimed_at
    into v_statut, v_deja
  from public.withdrawal_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found';
  end if;

  -- 'approved' = les fonds sont RETENUS et attendent le virement. C'est le
  -- seul état d'où un versement a du sens.
  if v_statut is distinct from 'approved' then
    raise exception 'request_not_payable';
  end if;

  if v_deja is not null then
    raise exception 'payout_already_claimed';
  end if;

  return query
    update public.withdrawal_requests
       set payout_claimed_at = now(),
           payout_error      = null
     where id = p_request_id
    returning *;
end;
$$;

-- ── 3. Rattacher l'identifiant rendu par Lengopay ─────────────────────────
create or replace function public.attach_withdrawal_payout(
  p_request_id uuid,
  p_pay_id     text,
  p_status     text default 'INITIATED'
)
returns setof public.withdrawal_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(trim(p_pay_id), '') = '' then
    raise exception 'pay_id_required';
  end if;

  return query
    update public.withdrawal_requests
       set payout_pay_id = p_pay_id,
           payout_status = p_status
     where id = p_request_id
       and payout_claimed_at is not null   -- jamais sans réservation préalable
    returning *;

  if not found then
    raise exception 'claim_missing';
  end if;
end;
$$;

-- ── 4. Relâcher la réservation quand l'appel a ÉCHOUÉ ─────────────────────
--
-- Sans ça, une demande dont l'appel HTTP a échoué resterait réservée pour
-- toujours : plus jamais versée automatiquement, et invisible dans la file.
--
-- ⚠ On ne relâche QUE si aucun pay_id n'a été rattaché. Si Lengopay a répondu,
-- le versement est peut-être parti malgré notre erreur — relâcher là
-- risquerait un second paiement. Ces cas-là vont au rattrapage, pas au rejeu.
create or replace function public.release_withdrawal_payout_claim(
  p_request_id uuid,
  p_error      text
)
returns setof public.withdrawal_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    update public.withdrawal_requests
       set payout_claimed_at = null,
           payout_error      = left(coalesce(p_error, 'échec inconnu'), 500)
     where id = p_request_id
       and payout_pay_id is null
    returning *;
end;
$$;

-- ── 5. Refermer les droits ────────────────────────────────────────────────
--
-- Supabase accorde EXECUTE à public/anon/authenticated par défaut sur toute
-- nouvelle fonction SECURITY DEFINER. Le durcissement du 2026-07-29 a révoqué
-- ces droits sur les 47 fonctions existantes ; toute nouvelle doit l'être
-- aussi, sinon elle rouvre le trou. L'app ne les appelle jamais en direct,
-- elle passe par les fonctions edge en service_role.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'claim_withdrawal_for_payout',
        'attach_withdrawal_payout',
        'release_withdrawal_payout_claim'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

commit;
