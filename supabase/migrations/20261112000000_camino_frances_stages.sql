-- The other 30 stages of the Camino Francés (stages 4 to 33), added hidden.
--
-- Until now the database knew three stages of the route (the seed: stages 1 to 3). An offline map pack, the places
-- from OpenStreetMap and a pilgrim who starts anywhere after Pamplona all need the stage row to exist first, so the
-- rows of stages 4 to 33 are added here. They come from tools/offline-maps/catalog/camino-frances/NN.json, the checked
-- list of where each stage starts and ends, with the same ids as the stage files there
-- (40000000-0000-0000-0000-<the stage number as 12 digits>). tools/offline-maps/test/test_stage_rows.py keeps this
-- file and the catalog in step.
--
-- What is deliberately not here:
--   * distance_km. The catalog has a sourced distance for none of these stages, and an invented number is worse than
--     none (tools/offline-maps/catalog/README.md). The column therefore accepts null: "not known yet". The app shows
--     no kilometres for such a stage, and the day plan sums only the kilometres it has. Fill the numbers in with a
--     later migration when there is a source for each of them.
--   * start and end places, elevation, difficulty, description and geometry: not known yet either (all nullable).
--   * publication. is_published stays false, so the stages are invisible to the app (the "published stages are
--     public" policy), nobody can choose them as a starting stage and start_journey plans no days for them. To open
--     them to pilgrims, once the app that can show a stage without kilometres is on their phones:
--         update public.stages set is_published = true
--          where route_id = '20000000-0000-0000-0000-000000000001' and stage_number between 4 and 33;
--     (and the same statement with false takes them back).
--
-- Safe to run twice: dropping NOT NULL a second time changes nothing, and the rows are inserted "on conflict do
-- nothing" by id. It never changes or removes a row that exists.

alter table public.stages alter column distance_km drop not null;
comment on column public.stages.distance_km is
  'Walking distance in km. Null while there is no sourced figure for the stage: an invented number is worse than none.';

insert into public.stages (id, route_id, stage_number, name) values
  ('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001',  4, 'Pamplona to Puente la Reina'),
  ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001',  5, 'Puente la Reina to Estella'),
  ('40000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001',  6, 'Estella to Los Arcos'),
  ('40000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001',  7, 'Los Arcos to Logroño'),
  ('40000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001',  8, 'Logroño to Nájera'),
  ('40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001',  9, 'Nájera to Santo Domingo de la Calzada'),
  ('40000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', 10, 'Santo Domingo de la Calzada to Belorado'),
  ('40000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 11, 'Belorado to San Juan de Ortega'),
  ('40000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000001', 12, 'San Juan de Ortega to Burgos'),
  ('40000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000001', 13, 'Burgos to Hornillos del Camino'),
  ('40000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000001', 14, 'Hornillos del Camino to Castrojeriz'),
  ('40000000-0000-0000-0000-000000000015', '20000000-0000-0000-0000-000000000001', 15, 'Castrojeriz to Frómista'),
  ('40000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000001', 16, 'Frómista to Carrión de los Condes'),
  ('40000000-0000-0000-0000-000000000017', '20000000-0000-0000-0000-000000000001', 17, 'Carrión de los Condes to Terradillos de los Templarios'),
  ('40000000-0000-0000-0000-000000000018', '20000000-0000-0000-0000-000000000001', 18, 'Terradillos de los Templarios to Bercianos del Real Camino'),
  ('40000000-0000-0000-0000-000000000019', '20000000-0000-0000-0000-000000000001', 19, 'Bercianos del Real Camino to Mansilla de las Mulas'),
  ('40000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000001', 20, 'Mansilla de las Mulas to León'),
  ('40000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000001', 21, 'León to Villadangos del Páramo'),
  ('40000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000001', 22, 'Villadangos del Páramo to Astorga'),
  ('40000000-0000-0000-0000-000000000023', '20000000-0000-0000-0000-000000000001', 23, 'Astorga to Foncebadón'),
  ('40000000-0000-0000-0000-000000000024', '20000000-0000-0000-0000-000000000001', 24, 'Foncebadón to Ponferrada'),
  ('40000000-0000-0000-0000-000000000025', '20000000-0000-0000-0000-000000000001', 25, 'Ponferrada to Villafranca del Bierzo'),
  ('40000000-0000-0000-0000-000000000026', '20000000-0000-0000-0000-000000000001', 26, 'Villafranca del Bierzo to O Cebreiro'),
  ('40000000-0000-0000-0000-000000000027', '20000000-0000-0000-0000-000000000001', 27, 'O Cebreiro to Triacastela'),
  ('40000000-0000-0000-0000-000000000028', '20000000-0000-0000-0000-000000000001', 28, 'Triacastela to Sarria'),
  ('40000000-0000-0000-0000-000000000029', '20000000-0000-0000-0000-000000000001', 29, 'Sarria to Portomarín'),
  ('40000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000001', 30, 'Portomarín to Palas de Rei'),
  ('40000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000001', 31, 'Palas de Rei to Arzúa'),
  ('40000000-0000-0000-0000-000000000032', '20000000-0000-0000-0000-000000000001', 32, 'Arzúa to O Pedrouzo'),
  ('40000000-0000-0000-0000-000000000033', '20000000-0000-0000-0000-000000000001', 33, 'O Pedrouzo to Santiago de Compostela')
on conflict (id) do nothing;
