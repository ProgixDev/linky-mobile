-- LA FIN DU SEJOUR : UNE RESERVATION DONT LES DATES SONT PASSEES EST TERMINEE.
--
-- Demande du client, 2026-09-16, capture de « Reservations » a l'appui :
--   « Cette reservation est terminee (date deja passee) mais apparait toujours
--     dans "Actives". Il doit plutot apparaitre dans "Terminees" lorsque la date
--     de reservation est finie. »
--
-- CE N'ETAIT PAS UN DEFAUT DU FILTRE. AUCUN code n'ecrivait jamais le statut
-- 'completed' sur une reservation. La migration d'origine le disait en toutes
-- lettres (20260706_01, colonne status) :
--   « disputed/refunded/completed are schema-ready for the dispute/end-of-stay
--     pass (V1.1) »
-- Le passage de fin de sejour a ete reporte en juillet et jamais construit. Une
-- reservation restait donc 'active' pour toujours, et « Terminees » ne pouvait
-- que rester vide.
--
-- CE QUE CELA BLOQUAIT, AU-DELA DE L'AFFICHAGE :
--   * un bail au mois 'active' bloque le bien POUR TOUJOURS — booking-request et
--     booking-respond refusent toute nouvelle demande face a un bail mensuel
--     'paid' ou 'active' ;
--   * au paiement d'un bail au mois, le bien passe en 'reserved', et rien ne le
--     remettait jamais disponible ;
--   * delete-account refuse la suppression d'un compte tant qu'une reservation
--     est 'active' : un ancien locataire ne pouvait plus jamais fermer son compte.
-- Terminer une reservation passee leve ces trois blocages, sans en creer aucun :
-- a ce stade le sequestre est deja verse (release_booking passe en 'active').
--
-- QUAND UN SEJOUR EST-IL FINI ? Quand sa date de fin EXCLUSIVE est entierement
-- passee.
--   * a la journee : end_date est le jour du depart. Un sejour « du 10 au 11 »
--     est termine le 12 — le 11, le locataire peut encore etre dans les lieux ;
--   * au mois : fin = debut + N mois, meme regle ;
--   * une VENTE n'a pas de date de fin : elle n'est pas concernee ici.
-- Le jour est celui de Conakry (Africa/Conakry, UTC+0), explicitement : le fuseau
-- de la session Postgres n'a pas a decider de la fin d'un sejour guineen.
--
-- NE TOUCHE QU'AUX RESERVATIONS 'active'. Une reservation payee dont le locataire
-- n'a jamais confirme l'emmenagement ('paid') a encore de l'argent en sequestre :
-- decider de son sort (verser ou rembourser) est une regle metier, pas une
-- consequence du calendrier. Il n'y en a aucune en production au 2026-09-16.
create or replace function public.complete_ended_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_count integer := 0;
  v_n     integer;
  r       record;
begin
  -- Sejours a la journee.
  with done as (
    update public.bookings
       set status = 'completed',
           events = events || jsonb_build_array(jsonb_build_object(
             'at', now(), 'label', 'Séjour terminé')),
           updated_at = now()
     where status = 'active'
       and period = 'day'
       and end_date is not null
       and end_date < v_today
    returning id
  )
  select count(*) into v_n from done;
  v_count := v_count + v_n;

  -- Baux au mois. Chaque bail termine peut liberer son bien.
  for r in
    update public.bookings
       set status = 'completed',
           events = events || jsonb_build_array(jsonb_build_object(
             'at', now(), 'label', 'Bail terminé')),
           updated_at = now()
     where status = 'active'
       and period = 'month'
       and months is not null
       and (start_date + make_interval(months => months))::date < v_today
    returning property_id
  loop
    v_count := v_count + 1;
    -- Le bien redevient disponible, SAUF si une autre reservation exclusive
    -- l'occupe encore. Un bien vendu ('sold') ou mis en pause n'est pas touche :
    -- seul 'reserved', pose par le paiement du bail, est leve.
    update public.properties p
       set status = 'active', updated_at = now()
     where p.id = r.property_id
       and p.status = 'reserved'
       and not exists (
         select 1 from public.bookings b
          where b.property_id = r.property_id
            and b.status in ('paid', 'active')
            and b.period in ('month', 'sale'));
  end loop;

  return v_count;
end;
$$;

-- Comme les 47 autres fonctions SECURITY DEFINER (durcissement du 2026-07-29) :
-- Supabase re-accorde EXECUTE a public/anon/authenticated par defaut.
revoke all on function public.complete_ended_bookings() from public, anon, authenticated;
grant execute on function public.complete_ended_bookings() to service_role;

-- Chaque nuit a 03:41, apres linky-expire-bookings (03:23). Un sejour « du 10 au
-- 11 » passe donc en « Terminee » dans la nuit du 11 au 12.
select cron.schedule(
  'linky-complete-bookings',
  '41 3 * * *',
  $cron$select public.complete_ended_bookings();$cron$
);
