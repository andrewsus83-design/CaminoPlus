-- =============================================================================
-- Three sample pilgrims, each with a profile, a journey on a different Camino, day-by-day
-- stages, passport stamps and public journal posts. For demos, screenshots and testing the
-- feed, passport and journey screens.
--
--   username        email                                  password              route
--   sari.walks      sari@sample.caminoplus.test            Sari-Camino-2026      Camino Frances (walking, day 6)
--   tomas.pereira   tomas@sample.caminoplus.test           Tomas-Camino-2026     Camino Portugues Costero (finished)
--   hannah.norte    hannah@sample.caminoplus.test          Hannah-Camino-2026    Camino del Norte (paused)
--
-- HOW TO RUN: Supabase dashboard > SQL Editor > paste this whole file > Run
--   (or: psql "$DB_URL" -f supabase/dev/sample_pilgrims.sql)
-- Safe to run twice: users that already exist are left alone and their content is not added again.
-- NOT a migration and NOT part of seed.sql: it creates real, loginable accounts with passwords
-- written in this file. Run it on a development or staging project, or delete the accounts
-- before launch with the clean-up statement at the bottom.
--
-- Everything is written as the database owner (SQL Editor), so the client-side limits and server-time
-- triggers do not apply; XP, counters and km are still filled in by the normal triggers.
-- Stage lengths and coordinates are approximate and only meant to look right on the map.
-- =============================================================================
begin;

-- One email + password user, the way the Supabase Auth API makes it. The profile and settings rows
-- come from the on_auth_user_created trigger. Returns the user id (existing user if the email is taken).
create or replace function pg_temp.sample_user(
  p_email text, p_password text, p_username text, p_name text, p_bio text, p_country text, p_langs text[])
returns uuid
language plpgsql
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = p_email;
  if uid is not null then
    return uid;
  end if;
  uid := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('username', p_username, 'full_name', p_name, 'sample', true),
    now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid,
          jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
          'email', uid::text, now(), now(), now());
  update public.profiles
     set display_name = p_name, bio = p_bio, home_country = p_country, languages = p_langs, is_private = false
   where id = uid;
  return uid;
end;
$$;

-- One journey with its days. p_days is a json array; each element:
--   {"f": "from name", "t": "to name", "km": 24.2, "to": [lat, lng], "s": "done|in_progress|planned",
--    "note": "...", "post": "journal text or null", "stamp": true|false}
-- Days are dated one after the other from p_start. Done days get a finish time, a passport stamp
-- (when "stamp") and a public journal post (when "post").
create or replace function pg_temp.sample_journey(
  p_user uuid, p_route text, p_title text, p_final_status text, p_start date, p_days jsonb)
returns uuid
language plpgsql
as $$
declare
  jid    uuid := gen_random_uuid();
  rid    uuid;
  d      record;
  did    uuid;
  dt     date;
  fin    timestamptz;
  loc    extensions.geography;
  total  numeric := 0;
begin
  select id into rid from public.routes where slug = p_route;
  if rid is null then
    raise exception 'route % not found, run the migrations first', p_route;
  end if;
  select coalesce(sum((e ->> 'km')::numeric), 0) into total from jsonb_array_elements(p_days) e;

  insert into public.journeys (id, user_id, route_id, title, mode, status, visibility,
                               planned_start_date, planned_end_date, started_at, planned_distance_km)
  values (jid, p_user, rid, p_title, 'walk', 'active', 'public',
          p_start, p_start + jsonb_array_length(p_days) - 1, p_start::timestamptz + interval '7 hours', total);

  for d in select e as j, n::int as n from jsonb_array_elements(p_days) with ordinality as t(e, n) loop
    dt  := p_start + (d.n - 1);
    fin := dt::timestamptz + interval '15 hours 30 minutes';
    loc := extensions.st_setsrid(extensions.st_makepoint((d.j -> 'to' ->> 1)::float8, (d.j -> 'to' ->> 0)::float8), 4326)::extensions.geography;
    did := gen_random_uuid();

    insert into public.journey_days (id, journey_id, user_id, day_number, planned_date, from_name, to_name,
                                     planned_distance_km, actual_distance_km, status, started_at, finished_at, notes)
    values (did, jid, p_user, d.n, dt, d.j ->> 'f', d.j ->> 't', (d.j ->> 'km')::numeric,
            case when d.j ->> 's' = 'done' then (d.j ->> 'km')::numeric end,
            d.j ->> 's',
            case when d.j ->> 's' in ('done', 'in_progress') then dt::timestamptz + interval '7 hours' end,
            case when d.j ->> 's' = 'done' then fin end,
            d.j ->> 'note');

    if d.j ->> 's' = 'done' and coalesce((d.j ->> 'stamp')::boolean, false) then
      insert into public.user_stamps (user_id, journey_id, journey_day_id, place_name, location, stamped_at, method, note)
      values (p_user, jid, did, d.j ->> 't', loc, dt::timestamptz + interval '15 hours', 'manual',
              'Sello de ' || (d.j ->> 't'));
    end if;

    if d.j ->> 's' = 'done' and nullif(d.j ->> 'post', '') is not null then
      insert into public.posts (user_id, kind, visibility, status, body, journey_id, journey_day_id, route_id,
                                place_name, location, client_created_at, published_at)
      values (p_user, 'journal', 'public', 'published', d.j ->> 'post', jid, did, rid,
              d.j ->> 't', loc, fin, fin + interval '40 minutes');
    end if;
  end loop;

  if p_final_status <> 'active' then
    update public.journeys
       set status = p_final_status,
           finished_at = case when p_final_status = 'completed' then (p_start + jsonb_array_length(p_days) - 1)::timestamptz + interval '15 hours' end,
           compostela_received_at = case when p_final_status = 'completed' then (p_start + jsonb_array_length(p_days))::timestamptz + interval '10 hours' end
     where id = jid;
  end if;
  return jid;
end;
$$;

do $$
declare
  sari   uuid;
  tomas  uuid;
  hannah uuid;
  a uuid; b uuid;
  pair  uuid[];
begin
  -- ---------------------------------------------------------------------------
  -- Sari: first Camino, Camino Frances, day 6 of 9, walking now
  -- ---------------------------------------------------------------------------
  sari := pg_temp.sample_user('sari@sample.caminoplus.test', 'Sari-Camino-2026', 'sari.walks', 'Sari Wijaya',
    'First Camino, first time in Europe. Slow walker, fast coffee drinker. Praying for every pilgrim I meet.',
    'ID', array['id', 'en']);
  if not exists (select 1 from public.journeys where user_id = sari) then
    perform pg_temp.sample_journey(sari, 'camino-frances', 'My first Camino', 'active', current_date - 5, $j$[
      {"f":"Saint-Jean-Pied-de-Port","t":"Roncesvalles","km":24.2,"to":[43.0094,-1.3190],"s":"done","stamp":true,
       "note":"Napoleon route in clear weather.",
       "post":"Day 1 done! The climb over the Pyrenees nearly broke me, but the view from the top was worth every step. Roncesvalles pilgrim mass tonight, they blessed every nationality in the room."},
      {"f":"Roncesvalles","t":"Zubiri","km":21.4,"to":[42.9320,-1.5040],"s":"done","stamp":true,
       "post":"Beech forest all morning, knees complaining on the long descent. Met Tomas from Porto who shared his plasters. Buen Camino!"},
      {"f":"Zubiri","t":"Pamplona","km":20.4,"to":[42.8125,-1.6458],"s":"done","stamp":true,
       "post":"Arrived in Pamplona just before the afternoon rain. Pinchos in the old town and a very long hot shower."},
      {"f":"Pamplona","t":"Puente la Reina","km":24.0,"to":[42.6711,-1.8158],"s":"done","stamp":true,
       "note":"Alto del Perdon at sunrise.",
       "post":"The iron pilgrims on Alto del Perdon! Wind so strong I could lean on it. Albergue tonight has a garden and a guitar."},
      {"f":"Puente la Reina","t":"Estella","km":21.9,"to":[42.6720,-2.0314],"s":"done","stamp":true,
       "post":"Short and sweet day, the old Roman bridge at Puente la Reina at sunrise is something I will not forget. Vino fountain tomorrow!"},
      {"f":"Estella","t":"Los Arcos","km":21.3,"to":[42.5683,-2.1893],"s":"in_progress","note":"Wine fountain at Irache first."},
      {"f":"Los Arcos","t":"Logrono","km":27.8,"to":[42.4627,-2.4449],"s":"planned"},
      {"f":"Logrono","t":"Najera","km":29.0,"to":[42.4160,-2.7290],"s":"planned"},
      {"f":"Najera","t":"Santo Domingo de la Calzada","km":20.9,"to":[42.4390,-2.9510],"s":"planned"}
    ]$j$::jsonb);
  end if;

  -- ---------------------------------------------------------------------------
  -- Tomas: finished the coastal Portuguese way, Porto to Santiago in 11 days
  -- ---------------------------------------------------------------------------
  tomas := pg_temp.sample_user('tomas@sample.caminoplus.test', 'Tomas-Camino-2026', 'tomas.pereira', 'Tomas Pereira',
    'Porto born. Walked the coast to Santiago, Compostela in my backpack. Ask me about the best pastel de nata on the way.',
    'PT', array['pt', 'es', 'en']);
  if not exists (select 1 from public.journeys where user_id = tomas) then
    perform pg_temp.sample_journey(tomas, 'camino-portugues-costero', 'Porto to Santiago along the sea', 'completed', current_date - 40, $j$[
      {"f":"Porto","t":"Vila do Conde","km":28.5,"to":[41.3517,-8.7425],"s":"done","stamp":true,
       "post":"Left Porto at 6am along the Douro and the Atlantic boardwalk. Sea on my left for the next ten days, that was the plan."},
      {"f":"Vila do Conde","t":"Esposende","km":26.5,"to":[41.5328,-8.7818],"s":"done","stamp":true,
       "post":"Wooden boardwalks through the dunes, fishermen at work and a seafood lunch that deserves its own post."},
      {"f":"Esposende","t":"Viana do Castelo","km":27.0,"to":[41.6918,-8.8344],"s":"done","stamp":true,
       "post":"Viana do Castelo: basilica on the hill, my blisters on the sofa. Worth the climb."},
      {"f":"Viana do Castelo","t":"Caminha","km":28.5,"to":[41.8738,-8.8396],"s":"done","stamp":true,
       "post":"Long day along empty beaches. Tomorrow we cross the river into Spain by small ferry."},
      {"f":"Caminha","t":"A Guarda","km":14.0,"to":[41.9014,-8.8741],"s":"done","stamp":true,
       "post":"Ferry across the Minho river, a new country and a new language. Short day, long lunch."},
      {"f":"A Guarda","t":"Baiona","km":31.0,"to":[42.1186,-8.8501],"s":"done","stamp":true,
       "post":"Cliffs, lighthouses and wild horses near Oia. Baiona harbour at sunset made the 31 km disappear."},
      {"f":"Baiona","t":"Vigo","km":25.0,"to":[42.2406,-8.7207],"s":"done","stamp":true,
       "post":"Waterfront all the way to Vigo. Oysters for the pilgrims!"},
      {"f":"Vigo","t":"Pontevedra","km":32.0,"to":[42.4310,-8.6444],"s":"done","stamp":true,
       "post":"Longest day so far but Pontevedra old town is the prettiest on the whole walk. Fresh legs after one beer."},
      {"f":"Pontevedra","t":"Caldas de Reis","km":22.0,"to":[42.6028,-8.6358],"s":"done","stamp":true,
       "post":"Thermal springs in Caldas de Reis, feet in warm water, best moment of the week."},
      {"f":"Caldas de Reis","t":"Padron","km":18.0,"to":[42.7367,-8.6578],"s":"done","stamp":true,
       "post":"Padron peppers and the stone of the Apostle. Last night before Santiago, nobody could sleep."},
      {"f":"Padron","t":"Santiago de Compostela","km":25.0,"to":[42.8805,-8.5457],"s":"done","stamp":true,
       "note":"Compostela collected.",
       "post":"We made it. Praza do Obradoiro, tears, hugs with strangers who are now friends. Compostela in hand. Obrigado, Camino."}
    ]$j$::jsonb);
  end if;

  -- ---------------------------------------------------------------------------
  -- Hannah: Camino del Norte, paused after 5 days (a rest week at home)
  -- ---------------------------------------------------------------------------
  hannah := pg_temp.sample_user('hannah@sample.caminoplus.test', 'Hannah-Camino-2026', 'hannah.norte', 'Hannah Keller',
    'Nurse from Hamburg, walking the Camino del Norte in two parts. Sea, hills and too many cider houses.',
    'DE', array['de', 'en']);
  if not exists (select 1 from public.journeys where user_id = hannah) then
    perform pg_temp.sample_journey(hannah, 'camino-del-norte', 'Camino del Norte, part one', 'paused', current_date - 14, $j$[
      {"f":"Irun","t":"San Sebastian","km":24.5,"to":[43.3183,-1.9812],"s":"done","stamp":true,
       "post":"Day 1 from Irun over Jaizkibel. The coastal views are unreal. Pintxos in San Sebastian as a reward."},
      {"f":"San Sebastian","t":"Zarautz","km":21.0,"to":[43.2833,-2.1699],"s":"done","stamp":true,
       "post":"Txakoli vineyards above the sea and a very long beach in Zarautz. Surf instead of foot soaking today."},
      {"f":"Zarautz","t":"Deba","km":22.5,"to":[43.3000,-2.3541],"s":"done","stamp":true,
       "post":"Steep ups and downs all day, Getaria fishing harbour was the highlight. Legs are made of wood."},
      {"f":"Deba","t":"Markina-Xemein","km":24.0,"to":[43.2644,-2.4967],"s":"done","stamp":true,
       "post":"Inland and into the hills, cows, mist, church bells. Pilgrim menu with lentils tonight."},
      {"f":"Markina-Xemein","t":"Gernika-Lumo","km":25.0,"to":[43.3150,-2.6770],"s":"done","stamp":true,
       "note":"Stopping here for now.",
       "post":"Gernika: the tree, the parliament and a very quiet minute at the peace museum. Pausing my Camino here, back in two weeks for Bilbao and beyond."},
      {"f":"Gernika-Lumo","t":"Bilbao","km":31.0,"to":[43.2630,-2.9350],"s":"planned"},
      {"f":"Bilbao","t":"Portugalete","km":19.0,"to":[43.3220,-3.0200],"s":"planned"}
    ]$j$::jsonb);
  end if;

  -- ---------------------------------------------------------------------------
  -- They all met on the road: friends and followers of each other
  -- ---------------------------------------------------------------------------
  foreach pair slice 1 in array array[array[sari, tomas], array[sari, hannah], array[tomas, hannah]] loop
    a := least(pair[1], pair[2]);
    b := greatest(pair[1], pair[2]);
    insert into public.friendships (user_a, user_b, requested_by, status, responded_at)
    values (a, b, a, 'accepted', now())
    on conflict do nothing;
    insert into public.follows (follower_id, followee_id, status) values (pair[1], pair[2], 'accepted') on conflict do nothing;
    insert into public.follows (follower_id, followee_id, status) values (pair[2], pair[1], 'accepted') on conflict do nothing;
  end loop;
end $$;

commit;

-- What was created:
select p.username, p.display_name, p.home_country, p.xp, p.level, p.km_walked, p.posts_count, p.stamps_count,
       p.friends_count, r.name as route, j.status as journey_status
from public.profiles p
join auth.users u on u.id = p.id and u.email like '%@sample.caminoplus.test'
left join public.journeys j on j.user_id = p.id
left join public.routes r on r.id = j.route_id
order by p.username;

-- Clean-up (run on purpose, it removes the three accounts and everything they own):
--   delete from auth.users where email like '%@sample.caminoplus.test';
