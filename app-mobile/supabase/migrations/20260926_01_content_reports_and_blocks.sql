-- SIGNALEMENT ET BLOCAGE — exigences de la politique Google Play sur le contenu
-- genere par les utilisateurs.
--
-- POURQUOI MAINTENANT. La politique « User Generated Content » s'applique des
-- qu'une application publie du contenu que ses utilisateurs ecrivent, et elle
-- exige TROIS choses : pouvoir signaler un contenu, le moderer, et bloquer un
-- utilisateur. Linky publie des annonces, des avis et des commentaires. La
-- moderation existe deja cote admin (admin-list-comments, admin-delete-comment,
-- admin-delete-review) ; les deux autres n'existaient pas du tout, et leur
-- absence est un motif de rejet independant de tout le reste du dossier Play.
--
-- PAS DE RPC ICI, a la difference de tout ce qui touche a l'argent : aucune
-- somme ne bouge et aucune ecriture n'a besoin d'etre atomique avec une autre.
-- Les fonctions edge inserent directement en service_role, exactement comme
-- post-comment et create-review. Rien a re-revoquer donc (cf. le durcissement
-- du 2026-07-29, qui ne concerne que les fonctions SECURITY DEFINER).

-- ===========================================================================
-- 1. content_reports — polymorphe, comme comments l'est deja.
-- ===========================================================================
-- Pas de FK vers la cible : cinq parents possibles. Une cible supprimee laisse
-- une ligne orpheline, ce qui est voulu — l'admin doit pouvoir voir qu'un
-- contenu signale a ete supprime, pas perdre la trace du signalement.
--
-- L'UNIQUE est la garde anti-abus : une personne ne signale une cible qu'une
-- fois. Elle rend aussi l'insertion idempotente (on conflict do nothing), donc
-- un double tap sur « Signaler » ne cree pas deux lignes et n'a pas besoin
-- d'etre gere cote client.
create table if not exists public.content_reports (
  id          uuid primary key default public.uuidv7(),
  target_kind text not null check (target_kind in ('product','property','comment','review','user')),
  target_id   uuid not null,
  reporter_id uuid not null references public.users(id) on delete cascade,
  reason      text not null check (reason in ('spam','illegal','offensive','scam','wrong_info','other')),
  details     text check (char_length(details) <= 1000),
  status      text not null default 'pending' check (status in ('pending','actioned','dismissed')),
  -- Qui a tranche, quand, et ce qui a ete fait. reviewed_by ne cascade pas :
  -- supprimer un compte admin ne doit pas effacer l'historique de moderation.
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  admin_note  text check (char_length(admin_note) <= 1000),
  created_at  timestamptz not null default now(),
  unique (reporter_id, target_kind, target_id)
);

-- La file d'attente de la console admin : les 'pending' d'abord, plus anciens
-- en haut (un signalement qui attend depuis trois jours passe avant celui
-- d'aujourd'hui).
create index if not exists content_reports_pending_idx
  on public.content_reports (status, created_at)
  where status = 'pending';

-- « Combien de fois cette annonce a-t-elle ete signalee ? » — la question que
-- l'admin pose en ouvrant un signalement.
create index if not exists content_reports_target_idx
  on public.content_reports (target_kind, target_id);

alter table public.content_reports enable row level security;
-- Aucune policy : le backend passe en service_role, qui contourne RLS. Meme
-- convention que comments et reviews.

-- ===========================================================================
-- 2. blocked_users
-- ===========================================================================
-- Les deux colonnes cascadent : supprimer un compte ne doit jamais etre bloque
-- par une ligne de blocage, ni d'un cote ni de l'autre.
create table if not exists public.blocked_users (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

-- LE BLOCAGE EST SYMETRIQUE A LA LECTURE, et c'est delibere : si A bloque B,
-- B ne doit pas continuer a voir les annonces de A, sinon il lui suffit de
-- commander pour reprendre le contact. Le filtre se lit donc dans les deux
-- sens, d'ou ce second index — la PK ne couvre que blocker_id.
create index if not exists blocked_users_blocked_idx
  on public.blocked_users (blocked_id);

alter table public.blocked_users enable row level security;
