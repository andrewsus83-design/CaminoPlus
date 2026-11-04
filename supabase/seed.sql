-- =============================================================================
-- CaminoPlus seed: reference data + a small sample of the Camino Frances.
-- Real catalog data (all routes, stages, stays, POIs) is imported from
-- OpenStreetMap by a separate import job, not from this file.
-- =============================================================================

-- App config ------------------------------------------------------------------
insert into public.app_config (key, value, description) values
  ('free_storage_bytes', '0', 'Cloud storage for free users (bytes). Free = basic app, 0 GB.'),
  ('crowd_ttl_minutes.crowd_level', '120', 'How long a crowd level report stays on the map')
on conflict (key) do nothing;

-- Billing products (prices are display/reference; stores are the source of truth)
insert into public.billing_products (id, kind, name, price_cents, currency, billing_period, storage_bytes, revenuecat_entitlement, store_product_ids) values
  ('plus_yearly', 'subscription', 'CaminoPlus yearly', 1199, 'USD', 'year', 5368709120, 'plus',
     '{"app_store": "caminoplus_plus_yearly", "play_store": "caminoplus_plus_yearly"}'),
  ('storage_5gb_yearly', 'storage_addon', 'Extra 5 GB storage', 500, 'USD', 'year', 5368709120, null,
     '{"app_store": "caminoplus_storage_5gb_yearly", "play_store": "caminoplus_storage_5gb_yearly"}')
on conflict (id) do nothing;

-- Stay labels -------------------------------------------------------------------
insert into public.stay_labels (slug, name, description, sort_order) values
  ('pilgrims_only',       'Pilgrims only',       'Credential required, pilgrims only', 10),
  ('donativo',            'Donativo',            'Pay what you can', 20),
  ('open_all_year',       'Open all year',       null, 30),
  ('pet_friendly',        'Pet friendly',        null, 40),
  ('bike_friendly',       'Bike friendly',       'Bike storage available', 50),
  ('accessible',          'Accessible',          'Step-free access', 60),
  ('menu_peregrino',      'Pilgrim menu',        'Serves a menu del peregrino', 70),
  ('partner',             'CaminoPlus partner',  null, 80)
on conflict (slug) do nothing;

-- Achievements ------------------------------------------------------------------
insert into public.achievements (slug, name, description, category, xp_reward, criteria) values
  ('first-stamp',  'First sello',        'Collect your first passport stamp', 'stamps',  50, '{"stamps": 1}'),
  ('stamps-25',    'Stamp collector',    'Collect 25 passport stamps',        'stamps', 200, '{"stamps": 25}'),
  ('first-camino', 'Buen Camino',        'Finish a whole Camino',             'journey', 1000, '{"journeys_completed": 1}'),
  ('roncesvalles-hunt', 'Roland''s pass', 'Complete the Roncesvalles hunt',   'hunt',    100, '{}')
on conflict (slug) do nothing;

-- Network + routes ----------------------------------------------------------------
insert into public.route_networks (id, slug, name, kind, destination_name, destination_location, is_published) values
  ('10000000-0000-0000-0000-000000000001', 'camino-de-santiago', 'Camino de Santiago', 'camino',
   'Santiago de Compostela', 'SRID=4326;POINT(-8.5446 42.8806)', true)
on conflict (id) do nothing;

insert into public.routes (id, network_id, slug, name, short_name, countries, start_name, end_name, distance_km, stage_count, difficulty, color, is_published) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'camino-frances', 'Camino Frances', 'Frances', '{FR,ES}', 'Saint-Jean-Pied-de-Port', 'Santiago de Compostela', 773, 33, 3, '#D9A21B', true),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'camino-portugues', 'Camino Portugues', 'Portugues', '{PT,ES}', 'Porto', 'Santiago de Compostela', 240, 12, 2, '#14365D', true)
on conflict (id) do nothing;

-- Places (sample) -----------------------------------------------------------------
insert into public.places (id, name, kind, country_code, location) values
  ('30000000-0000-0000-0000-000000000001', 'Saint-Jean-Pied-de-Port', 'town',    'FR', 'SRID=4326;POINT(-1.2376 43.1636)'),
  ('30000000-0000-0000-0000-000000000002', 'Roncesvalles',            'village', 'ES', 'SRID=4326;POINT(-1.3195 43.0094)'),
  ('30000000-0000-0000-0000-000000000003', 'Zubiri',                  'village', 'ES', 'SRID=4326;POINT(-1.5036 42.9300)'),
  ('30000000-0000-0000-0000-000000000004', 'Pamplona',                'city',    'ES', 'SRID=4326;POINT(-1.6432 42.8169)'),
  ('30000000-0000-0000-0000-000000000005', 'Santiago de Compostela',  'city',    'ES', 'SRID=4326;POINT(-8.5446 42.8806)')
on conflict (id) do nothing;

insert into public.route_places (route_id, place_id, seq, km_from_start, km_to_end, is_stage_end) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1,   0.0, 773.0, false),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 2,  24.2, 748.8, true),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 3,  45.6, 727.4, true),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 4,  66.0, 707.0, true),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 99, 773.0, 0.0, true)
on conflict do nothing;

insert into public.stages (id, route_id, stage_number, name, start_place_id, end_place_id, distance_km, elevation_gain_m, elevation_loss_m, difficulty, is_published, geom) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1,
   'Saint-Jean-Pied-de-Port to Roncesvalles', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
   24.2, 1390, 520, 5, true, 'SRID=4326;LINESTRING(-1.2376 43.1636, -1.2700 43.0900, -1.3195 43.0094)'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 2,
   'Roncesvalles to Zubiri', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003',
   21.4, 490, 990, 3, true, 'SRID=4326;LINESTRING(-1.3195 43.0094, -1.4100 42.9700, -1.5036 42.9300)'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 3,
   'Zubiri to Pamplona', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004',
   20.4, 280, 400, 2, true, 'SRID=4326;LINESTRING(-1.5036 42.9300, -1.5800 42.8700, -1.6432 42.8169)')
on conflict (id) do nothing;

-- POIs + stays (sample) -----------------------------------------------------------
insert into public.pois (id, source, category, name, place_id, location, is_iconic, has_stamp) values
  ('50000000-0000-0000-0000-000000000001', 'editorial', 'church', 'Royal Collegiate Church of Roncesvalles',
   '30000000-0000-0000-0000-000000000002', 'SRID=4326;POINT(-1.3193 43.0092)', true, true),
  ('50000000-0000-0000-0000-000000000002', 'editorial', 'cathedral', 'Cathedral of Santiago de Compostela',
   '30000000-0000-0000-0000-000000000005', 'SRID=4326;POINT(-8.5446 42.8806)', true, true)
on conflict (id) do nothing;

insert into public.stage_pois (stage_id, poi_id, km_from_stage_start) values
  ('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 24.0)
on conflict do nothing;

insert into public.stays (id, source, category, name, place_id, route_id, country_code, location, booking_method, beds, labels, amenities, has_stamp) values
  ('60000000-0000-0000-0000-000000000001', 'editorial', 'albergue_parochial', 'Albergue de Roncesvalles',
   '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'ES',
   'SRID=4326;POINT(-1.3197 43.0089)', 'website', 183, '{pilgrims_only}', '{wifi,lockers,laundry}', true)
on conflict (id) do nothing;

insert into public.stage_stays (stage_id, stay_id, km_from_stage_start) values
  ('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 24.2)
on conflict do nothing;

insert into public.stay_prices (stay_id, item, amount, source, reported_by) values
  ('60000000-0000-0000-0000-000000000001', 'dorm_bed', 14, 'editorial', null);

-- Sample hunt ---------------------------------------------------------------------
insert into public.hunts (id, route_id, stage_id, title, description, xp_reward, achievement_id, is_published)
select '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
       'Secrets of Roncesvalles', 'Find the hidden stories of the first Spanish stop.', 100, a.id, true
from public.achievements a where a.slug = 'roncesvalles-hunt'
on conflict (id) do nothing;

insert into public.hunt_steps (id, hunt_id, step_number, title, clue, poi_id, radius_m, verification) values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 1,
   'Reach the Collegiate Church', 'Where pilgrims are blessed every evening.', '50000000-0000-0000-0000-000000000001', 80, 'gps'),
  ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 2,
   'Read the road sign', 'How many kilometres to Santiago does the famous sign show?', null, 80, 'answer')
on conflict (id) do nothing;

insert into private.hunt_step_answers (step_id, answer) values
  ('71000000-0000-0000-0000-000000000002', '790')
on conflict (step_id) do nothing;

-- Sample offline pack (manifest only)
insert into public.offline_packs (route_id, stage_id, kind, format, version, url, size_bytes) values
  ('20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'tiles', 'pmtiles', 1,
   'r2://caminoplus-packs/camino-frances/stage-01/tiles-v1.pmtiles', 3145728)
on conflict do nothing;
