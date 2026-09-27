-- ===========================================================================
-- LA RELANCE : « ça insiste jusqu'à ce qu'il réponde »
-- 2026-09-29 · deuxième moitié de la demande client du 28/09
-- ===========================================================================
--
-- CE QUE LE CLIENT A DEMANDÉ, ET CE QU'IL VEUT VRAIMENT. Il a écrit : « il faut
-- qu'on mette le son en continu avec bouton (Acceptée ou Refusée) jusqu'à ce que
-- le vendeur, l'agent ou le livreur acceptent ou refusent la demande ». Sa
-- raison, elle, est la phrase suivante : « sinon ils peuvent recevoir une
-- commande, réservation ou livraison sans le savoir ». Le but est qu'ils
-- SACHENT ; la sonnerie continue n'est que le moyen qu'il a recopié d'Uber Eats.
--
-- POURQUOI PAS LA SONNERIE CONTINUE. Depuis le 22 janvier 2025, le Play Store
-- révoque à l'installation la permission de notification plein écran pour toute
-- application qui n'est ni une app d'appel ni un réveil. Côté Apple, sonner en
-- continu passe par PushKit/CallKit — et le système TUE l'application si un push
-- VoIP n'ouvre pas un vrai appel. Prendre cette voie en pleine soumission Play
-- serait payer un risque de police pour une fonctionnalité qui, de toute façon,
-- ne marcherait pas chez la majorité des gens.
--
-- CE QUE FAIT CE FICHIER À LA PLACE. On relance, côté serveur, tant que la chose
-- attend son destinataire — et on s'arrête dès qu'il a agi. Aucune permission
-- spéciale, aucun risque de rejet, et surtout : ça couvre les TROIS métiers d'un
-- coup, sans créer d'étape d'acceptation là où il n'y en a pas (une commande et
-- une course n'en ont aucune aujourd'hui ; en inventer une toucherait au
-- séquestre et déferait le dispatch centralisé que le client a validé en juin).
--
-- CE QUI COMPTE COMME « EN ATTENTE ». Trois états qui existent déjà :
--   commande   status = 'paid'       -> le vendeur n'a pas encore expédié
--   réservation status = 'requested' -> le propriétaire n'a pas répondu
--   livraison  status = 'assigned'   -> le livreur n'a pas pris la course
--
-- L'ANCRE DE TEMPS EST LA PREMIÈRE FOIS QU'ON L'A VUE, pas un horodatage métier.
-- `orders` n'a pas de `paid_at`, et `updated_at` bouge pour vingt autres
-- raisons : s'y fier ferait relancer au mauvais moment, ou pas du tout. La seule
-- imprécision est sur les objets déjà en attente au moment où ce fichier passe —
-- ils sont « vus » maintenant, ce qui est exactement le bon comportement.

begin;

-- ---------------------------------------------------------------------------
-- 1. LE COMPTEUR
-- ---------------------------------------------------------------------------
-- Une table À PART, et pas des colonnes sur orders/bookings/deliveries : on ne
-- touche pas aux tables qui portent de l'argent pour un compteur de rappels, et
-- une relance ratée ne doit jamais pouvoir bloquer une écriture métier.
create table if not exists public.notification_nudges (
  kind          text not null check (kind in ('order', 'booking', 'delivery')),
  ref_id        uuid not null,
  first_seen_at timestamptz not null default now(),
  last_sent_at  timestamptz,
  sent_count    integer not null default 0 check (sent_count >= 0),
  primary key (kind, ref_id)
);

alter table public.notification_nudges enable row level security;
-- Aucune policy : service_role seul, comme push_tokens.

create index if not exists notification_nudges_due_idx
  on public.notification_nudges (first_seen_at)
  where sent_count < 4;

-- ---------------------------------------------------------------------------
-- 2. CE QUI ATTEND QUELQU'UN, MAINTENANT
-- ---------------------------------------------------------------------------
create or replace function public.pending_nudge_targets()
returns table (kind text, ref_id uuid, user_id uuid, app text, label text, extra_id uuid)
language sql
stable
security definer
set search_path to ''
as $fn$
  -- Une commande payee que le vendeur n'a pas encore marquee expediee.
  -- 'paid' ne veut pas dire que Linky detient l'argent (especes a la livraison,
  -- don) : ca ne change rien ici, le vendeur doit agir dans tous les cas.
  select 'order'::text, o.id, o.seller_id, 'marketplace'::text, coalesce(o.reference, ''), null::uuid
    from public.orders o
   where o.status = 'paid'
     and o.seller_id is not null
     -- LA RELANCE NE POSSEDE QUE LES SEPT PREMIERS JOURS, et les passe ensuite
     -- aux balayages qui existent deja : le remboursement automatique du
     -- sequestre a J+7 cote commande, l'expiration a J+7 cote reservation.
     -- Sans cette borne, une commande oubliee depuis des semaines recevrait une
     -- rafale de quatre rappels le jour ou ce cron la decouvre.
     and o.created_at > now() - interval '7 days'

  union all

  -- Une demande de reservation sans reponse. Le journalier n'apparait jamais
  -- ici : il nait deja 'accepted' (reservation instantanee), il n'y a rien a
  -- trancher et donc personne a relancer.
  select 'booking', b.id, b.landlord_id, 'marketplace',
         coalesce(b.property_snapshot ->> 'title', ''), null::uuid
    from public.bookings b
   where b.status = 'requested'
     and b.landlord_id is not null
     and b.created_at > now() - interval '7 days'

  union all

  -- Une course attribuee que le livreur n'a pas commencee.
  select 'delivery', d.id, d.livreur_id, 'driver', coalesce(o.reference, ''), o.id
    from public.deliveries d
    join public.orders o on o.id = d.order_id
   where d.status = 'assigned'
     and d.livreur_id is not null
     and d.assigned_at > now() - interval '7 days'
$fn$;

-- ---------------------------------------------------------------------------
-- 3. LE SÉLECTEUR, QUI RÉCLAME CE QU'IL REND
-- ---------------------------------------------------------------------------
create or replace function public.pick_pending_nudges(p_limit integer default 100)
returns table (
  kind       text,
  ref_id     uuid,
  user_id    uuid,
  app        text,
  label      text,
  sent_count integer,
  extra_id   uuid
)
language plpgsql
security definer
set search_path to ''
as $fn$
#variable_conflict use_column
-- LA DIRECTIVE CI-DESSUS DOIT ETRE LE PREMIER ELEMENT DU CORPS, avant meme un
-- commentaire : plpgsql ne lit les options de compilation qu'en tete.
--
-- AMBIGUITE LEVEE UNE FOIS POUR TOUTES. `kind` et `ref_id` sont a la fois des
-- parametres de SORTIE de cette fonction (returns table) et des colonnes de
-- notification_nudges : dans `on conflict (kind, ref_id)`, plpgsql ne peut pas
-- deviner lequel on designe, et refuse (42702). La directive dit que la colonne
-- gagne, ce qui est le sens voulu partout ici — les variables propres a la
-- fonction (p_limit, v_ladder) ne portent aucun nom de colonne, elles ne sont
-- donc pas concernees.
declare
  -- L'ECHELLE. Quatre rappels, de plus en plus espaces, puis le silence : au
  -- dela on ne rend service a personne, et les balayages existants prennent le
  -- relais (remboursement automatique a 7 jours cote commande, expiration a
  -- 7 jours cote reservation).
  v_ladder constant interval[] :=
    array['10 minutes', '1 hour', '4 hours', '12 hours']::interval[];
begin
  -- (a) Noter ce qu'on voit pour la premiere fois.
  insert into public.notification_nudges (kind, ref_id)
  select t.kind, t.ref_id from public.pending_nudge_targets() t
  -- Par la CONTRAINTE et non par les colonnes : `on conflict (kind, ref_id)`
  -- reintroduirait l'ambiguite que la directive ci-dessus vient de lever, et
  -- une seule des deux protections suffirait — les deux coutent une ligne.
  on conflict on constraint notification_nudges_pkey do nothing;

  -- (b) Oublier ce qui n'attend plus personne. C'est CE menage qui arrete la
  --     relance : des que le vendeur expedie, que le proprietaire repond ou que
  --     le livreur part, la ligne disparait et plus rien ne sonne.
  delete from public.notification_nudges n
   where (n.kind, n.ref_id) not in (
     select t.kind, t.ref_id from public.pending_nudge_targets() t
   );

  -- (c) Rendre ce qui est du, en le comptant dans le meme mouvement. Compter
  --     AVANT d'envoyer, et non apres : si le push echoue on aura relance une
  --     fois de moins, ce qui est le bon sens de l'erreur. L'inverse pourrait
  --     harceler quelqu'un en boucle si l'envoi echouait a repetition.
  return query
  with due as (
    select n.kind as k, n.ref_id as r
      from public.notification_nudges n
     where n.sent_count < array_length(v_ladder, 1)
       and now() >= n.first_seen_at + v_ladder[n.sent_count + 1]
     order by n.first_seen_at
     limit greatest(p_limit, 1)
     for update skip locked
  ), claimed as (
    update public.notification_nudges n
       set sent_count = n.sent_count + 1,
           last_sent_at = now()
      from due d
     where n.kind = d.k and n.ref_id = d.r
     returning n.kind as k, n.ref_id as r, n.sent_count as c
  )
  select cl.k, cl.r, t.user_id, t.app, t.label, cl.c, t.extra_id
    from claimed cl
    join public.pending_nudge_targets() t on t.kind = cl.k and t.ref_id = cl.r;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 4. LE DÉCLENCHEUR pg_cron
-- ---------------------------------------------------------------------------
-- LE SECRET N'EST PAS ÉCRIT ICI. On le relit dans la fonction de réveil qui
-- existe déjà : il n'a ainsi jamais à transiter par un fichier de migration, ni
-- par un presse-papiers, ni par une conversation.
do $kick$
declare
  v_secret text;
  v_anon   text;
  v_src    text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'kick_payment_intents_poll'
   limit 1;
  if v_src is null then raise exception 'kick_payment_intents_poll introuvable'; end if;

  v_secret := substring(v_src from 'v_cron_secret\s+text\s*:=\s*''([^'']+)''');
  v_anon   := substring(v_src from 'v_anon_key\s+text\s*:=\s*''([^'']+)''');
  if v_secret is null or v_anon is null then
    raise exception 'secret ou cle anon introuvables dans kick_payment_intents_poll';
  end if;

  execute format($f$
    create or replace function public.kick_pending_nudges()
    returns void
    language plpgsql
    security definer
    set search_path to ''
    as $body$
    declare
      v_request_id bigint;
    begin
      select net.http_post(
        url := 'https://mkaddhcjneilvwqethjo.supabase.co/functions/v1/cron-nudge-pending',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', %L,
          'Authorization', 'Bearer ' || %L,
          'x-cron-secret', %L
        ),
        body := jsonb_build_object('source', 'pg_cron', 'fired_at', now())
      ) into v_request_id;
    end;
    $body$;
  $f$, v_anon, v_anon, v_secret);

  raise notice 'kick_pending_nudges posee (secret repris de kick_payment_intents_poll)';
end
$kick$;

-- Toutes les 5 minutes : le plus petit barreau de l'echelle est a 10 minutes,
-- inutile de tourner plus vite.
select cron.unschedule('linky-nudge-pending')
 where exists (select 1 from cron.job where jobname = 'linky-nudge-pending');
select cron.schedule('linky-nudge-pending', '*/5 * * * *',
                     $$select public.kick_pending_nudges();$$);

-- ---------------------------------------------------------------------------
-- 5. LES DROITS (durcissement du 2026-07-29 : Supabase re-accorde par défaut)
-- ---------------------------------------------------------------------------
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('pending_nudge_targets', 'pick_pending_nudges', 'kick_pending_nudges')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$grants$;

revoke all on table public.notification_nudges from public, anon, authenticated;
grant all on table public.notification_nudges to service_role;

-- ---------------------------------------------------------------------------
-- 6. CONTRÔLE
-- ---------------------------------------------------------------------------
do $check$
declare
  v_n int;
begin
  if to_regclass('public.notification_nudges') is null then
    raise exception 'table notification_nudges absente';
  end if;

  if not exists (select 1 from cron.job where jobname = 'linky-nudge-pending') then
    raise exception 'tache cron linky-nudge-pending non planifiee';
  end if;

  -- Le selecteur doit tourner a blanc sans exploser, et poser les lignes de
  -- suivi des objets deja en attente aujourd'hui.
  perform public.pick_pending_nudges(0);

  select count(*) into v_n from public.notification_nudges;
  raise notice 'relance en place : % objet(s) actuellement en attente et suivis', v_n;

  -- Aucun ne doit etre du tout de suite : l'echelle commence a 10 minutes.
  select count(*) into v_n
    from public.notification_nudges where sent_count > 0;
  if v_n <> 0 then
    raise exception '% relance(s) comptee(s) alors que rien ne devait partir', v_n;
  end if;

  raise notice 'aucune relance immediate : la premiere partira 10 minutes apres la premiere vue';
end
$check$;

commit;
