-- =============================================================================
-- CaminoPlus: 3 sample pilgrim accounts for demos and testing.
--
-- Each account has a confirmed email login, a filled-in profile, one journey on a different
-- Camino with day-by-day legs (some walked, some still ahead), passport stamps, public journal
-- posts, and all three are friends with each other.
--
--   username       email                         password          Camino
--   maria.walks    maria.walks@example.com       CaminoDemo-Maria1  Camino Frances
--   budi.camino    budi.camino@example.com       CaminoDemo-Budi1   Camino Portugues Central
--   emma.pilgrim   emma.pilgrim@example.com      CaminoDemo-Emma1   Camino Primitivo (finished)
--
-- These are demo-only credentials (example.com addresses, nobody's real password). Sign in on
-- the app's email sign-in screen.
--
-- Run (as the database owner, e.g. the Supabase SQL editor, or):
--   psql "$(supabase db url --linked 2>/dev/null || echo "$DATABASE_URL")" -f supabase/dev/sample_accounts.sql
-- Safe to run again: it deletes these three accounts first (everything they own cascades) and
-- creates them fresh. It touches no other account.
-- =============================================================================

begin;

-- Fixed ids so re-runs and tests can find them.
create temporary table _sample_users (
  id uuid primary key, email text, password text, username text, full_name text,
  bio text, country char(2), languages text[], route_slug text, title text,
  status text, start_date date
) on commit drop;

insert into _sample_users values
  ('5a000000-0000-4000-8000-000000000001', 'maria.walks@example.com', 'CaminoDemo-Maria1', 'maria.walks', 'Maria Santos',
   'Lisbon nurse walking the Frances for my mum. Slow mornings, early albergues.', 'PT', '{pt,en,es}',
   'camino-frances', 'Frances for Mamã', 'active', current_date - 7),
  ('5a000000-0000-4000-8000-000000000002', 'budi.camino@example.com', 'CaminoDemo-Budi1', 'budi.camino', 'Budi Hartono',
   'Pilgrim from Jakarta. Coffee, coastlines and too many photos of yellow arrows.', 'ID', '{id,en}',
   'camino-portugues', 'Porto to Santiago', 'active', current_date - 5),
  ('5a000000-0000-4000-8000-000000000003', 'emma.pilgrim@example.com', 'CaminoDemo-Emma1', 'emma.pilgrim', 'Emma Clarke',
   'Walked the Primitivo, the original way. Hills, horreos and the best caldo gallego.', 'GB', '{en,es}',
   'camino-primitivo', 'The Original Way', 'completed', current_date - 30);

-- Day-by-day legs. stage_no links a leg to a stage in the catalogue when one exists.
create temporary table _sample_legs (
  username text, day_no int, from_name text, to_name text, km numeric, done boolean, stage_no int
) on commit drop;

insert into _sample_legs values
  -- Maria, Camino Frances: 5 days walked, 2 ahead
  ('maria.walks', 1, 'Saint-Jean-Pied-de-Port', 'Roncesvalles', 24.2, true, 1),
  ('maria.walks', 2, 'Roncesvalles', 'Zubiri', 21.4, true, 2),
  ('maria.walks', 3, 'Zubiri', 'Pamplona', 20.4, true, 3),
  ('maria.walks', 4, 'Pamplona', 'Puente la Reina', 24.0, true, null),
  ('maria.walks', 5, 'Puente la Reina', 'Estella', 21.9, true, null),
  ('maria.walks', 6, 'Estella', 'Los Arcos', 21.3, false, null),
  ('maria.walks', 7, 'Los Arcos', 'Logrono', 27.8, false, null),
  -- Budi, Camino Portugues Central from Porto: 5 days walked, 6 ahead
  ('budi.camino', 1, 'Porto', 'Vilarinho', 27.0, true, null),
  ('budi.camino', 2, 'Vilarinho', 'Barcelos', 28.0, true, null),
  ('budi.camino', 3, 'Barcelos', 'Ponte de Lima', 33.0, true, null),
  ('budi.camino', 4, 'Ponte de Lima', 'Rubiaes', 18.0, true, null),
  ('budi.camino', 5, 'Rubiaes', 'Tui', 20.0, true, null),
  ('budi.camino', 6, 'Tui', 'O Porrino', 16.0, false, null),
  ('budi.camino', 7, 'O Porrino', 'Redondela', 16.0, false, null),
  ('budi.camino', 8, 'Redondela', 'Pontevedra', 20.0, false, null),
  ('budi.camino', 9, 'Pontevedra', 'Caldas de Reis', 22.0, false, null),
  ('budi.camino', 10, 'Caldas de Reis', 'Padron', 18.0, false, null),
  ('budi.camino', 11, 'Padron', 'Santiago de Compostela', 25.0, false, null),
  -- Emma, Camino Primitivo from Oviedo: all 13 days walked
  ('emma.pilgrim', 1, 'Oviedo', 'Grado', 25.0, true, null),
  ('emma.pilgrim', 2, 'Grado', 'Salas', 22.0, true, null),
  ('emma.pilgrim', 3, 'Salas', 'Tineo', 20.0, true, null),
  ('emma.pilgrim', 4, 'Tineo', 'Pola de Allande', 28.0, true, null),
  ('emma.pilgrim', 5, 'Pola de Allande', 'La Mesa', 21.0, true, null),
  ('emma.pilgrim', 6, 'La Mesa', 'Grandas de Salime', 16.0, true, null),
  ('emma.pilgrim', 7, 'Grandas de Salime', 'A Fonsagrada', 26.0, true, null),
  ('emma.pilgrim', 8, 'A Fonsagrada', 'O Cadavo', 24.0, true, null),
  ('emma.pilgrim', 9, 'O Cadavo', 'Lugo', 30.0, true, null),
  ('emma.pilgrim', 10, 'Lugo', 'San Romao da Retorta', 19.0, true, null),
  ('emma.pilgrim', 11, 'San Romao da Retorta', 'Melide', 28.0, true, null),
  ('emma.pilgrim', 12, 'Melide', 'O Pedrouzo', 33.0, true, null),
  ('emma.pilgrim', 13, 'O Pedrouzo', 'Santiago de Compostela', 20.0, true, null);

create temporary table _sample_posts (username text, day_no int, body text, steps int) on commit drop;

insert into _sample_posts values
  ('maria.walks', 1, 'Crossed the Pyrenees today. Fog until Orisson, then the whole valley opened up. Legs are jelly, heart is full.', 34100),
  ('maria.walks', 3, 'Pamplona! Cafe con leche on Plaza del Castillo and a blister plaster from the farmacia. Day 3 done.', 28800),
  ('maria.walks', 5, 'Estella by the river. Shared dinner with pilgrims from six countries. Nobody spoke the same language and it did not matter.', 30500),
  ('budi.camino', 1, 'Bom caminho from Porto! The first yellow arrow was painted on a lamp post right outside the cathedral.', 37200),
  ('budi.camino', 3, 'Longest day so far, 33 km to Ponte de Lima. The Roman bridge at sunset made every kilometre worth it.', 44900),
  ('budi.camino', 5, 'Walked across the bridge from Valenca into Tui. New country, new hour on the clock, same yellow arrows.', 27100),
  ('emma.pilgrim', 4, 'The Hospitales route above Pola de Allande. Wind, ruins of old pilgrim hospitals and not a single cafe. Magic.', 39400),
  ('emma.pilgrim', 9, 'Walked the Roman walls of Lugo at dusk. Two thousand years of people looking out from the same stones.', 40100),
  ('emma.pilgrim', 12, 'Joined the Frances at Melide. Suddenly hundreds of pilgrims. Pulpo for lunch to celebrate.', 44000),
  ('emma.pilgrim', 13, 'Santiago. Sat on the Obradoiro square for an hour and cried a bit. Compostela in my bag. Thank you, Camino.', 26700);

-- 1) Start clean: remove earlier copies of these three accounts (cascades to everything they own).
delete from auth.users where id in (select id from _sample_users) or email in (select email from _sample_users);

-- 2) Auth users with confirmed email logins. The on_auth_user_created trigger makes the profile.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt(u.password, extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb,
       jsonb_build_object('username', u.username, 'full_name', u.full_name),
       now() - interval '40 days', now(), '', '', '', ''
from _sample_users u;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from _sample_users u;

-- 3) Profiles: exact username, bio, country, languages, public.
update public.profiles p
set username = u.username, display_name = u.full_name, bio = u.bio, home_country = u.country,
    languages = u.languages, is_private = false
from _sample_users u
where p.id = u.id;

-- 4) Journeys, days, stamps and posts.
do $$
declare
  u        record;
  l        record;
  ps       record;
  j_id     uuid;
  d_id     uuid;
  r_id     uuid;
  total_km numeric;
  n_days   int;
begin
  for u in select * from _sample_users loop
    select id into r_id from public.routes where slug = u.route_slug;
    if r_id is null then
      raise exception 'route % is not in the catalogue', u.route_slug;
    end if;
    select sum(km), count(*) into total_km, n_days from _sample_legs where username = u.username;

    insert into public.journeys (user_id, route_id, title, mode, status, visibility,
                                 planned_start_date, planned_end_date, started_at, finished_at,
                                 planned_distance_km, compostela_received_at, start_stage_id)
    values (u.id, r_id, u.title, 'walk', 'active', 'public',
            u.start_date, u.start_date + n_days - 1, u.start_date + time '07:00', null,
            total_km, null,
            (select s.id from public.stages s where s.route_id = r_id and s.stage_number = 1 and s.variant_of is null limit 1))
    returning id into j_id;

    -- The credencial number is owner-only data, kept apart from the journey.
    insert into public.journey_private (journey_id, user_id, credential_number)
    values (j_id, u.id, 'CP-' || upper(left(u.username, 4)) || '-2026');

    for l in select * from _sample_legs where username = u.username order by day_no loop
      insert into public.journey_days (journey_id, user_id, day_number, planned_date, stage_id,
                                       from_name, to_name, planned_distance_km, actual_distance_km,
                                       status, started_at, finished_at, notes)
      values (j_id, u.id, l.day_no, u.start_date + l.day_no - 1,
              (select s.id from public.stages s where s.route_id = r_id and s.stage_number = l.stage_no and s.variant_of is null limit 1),
              l.from_name, l.to_name, l.km,
              case when l.done then l.km end,
              case when l.done then 'done' else 'planned' end,
              case when l.done then u.start_date + l.day_no - 1 + time '07:00' end,
              case when l.done then u.start_date + l.day_no - 1 + time '14:30' end,
              null)
      returning id into d_id;

      if l.done then
        insert into public.user_stamps (user_id, journey_id, journey_day_id, place_name, stamped_at, method, note)
        values (u.id, j_id, d_id, l.to_name, u.start_date + l.day_no - 1 + time '15:00', 'manual',
                'Sello from the albergue in ' || l.to_name);
      end if;

      for ps in select * from _sample_posts where username = u.username and day_no = l.day_no loop
        insert into public.posts (user_id, kind, visibility, status, body, journey_id, journey_day_id,
                                  route_id, stage_id, place_name, health_summary, published_at, client_created_at)
        values (u.id, 'journal', 'public', 'published', ps.body, j_id, d_id, r_id,
                (select stage_id from public.journey_days where id = d_id), l.to_name,
                jsonb_build_object('steps', ps.steps, 'km', l.km),
                u.start_date + l.day_no - 1 + time '19:30', u.start_date + l.day_no - 1 + time '19:30');
      end loop;
    end loop;

    -- Emma finished: mark it after the days exist, so the progress rules see all 13 days.
    if u.status = 'completed' then
      update public.journeys
      set status = 'completed', finished_at = u.start_date + n_days - 1 + time '13:00',
          compostela_received_at = u.start_date + n_days - 1 + time '16:00'
      where id = j_id;
    end if;
  end loop;
end $$;

-- 5) Everyone is friends with everyone (canonical pair order: user_a < user_b).
insert into public.friendships (user_a, user_b, requested_by, status, responded_at)
select least(a.id, b.id), greatest(a.id, b.id), a.id, 'accepted', now()
from _sample_users a join _sample_users b on a.id < b.id
on conflict (user_a, user_b) do update set status = 'accepted', responded_at = excluded.responded_at;

-- 6) Show the result.
select p.username, p.display_name, p.home_country, p.km_walked, p.stamps_count, p.posts_count, p.friends_count,
       r.name as camino, j.status, j.walked_km,
       (select count(*) from public.journey_days d where d.journey_id = j.id) as days
from public.profiles p
join public.journeys j on j.user_id = p.id
join public.routes r on r.id = j.route_id
where p.id in (select id from _sample_users)
order by p.username;

commit;
