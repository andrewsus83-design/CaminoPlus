-- The 11 stages of the Camino Portugués Central (Porto to Santiago de Compostela), added hidden.
--
-- Until now the database knew no stage of this route. An offline map pack, the places from OpenStreetMap and a pilgrim
-- who starts anywhere on the route all need the stage row to exist first, so the rows are added here. They come from
-- tools/offline-maps/catalog/camino-portugues/NN.json, the checked list of where each stage starts and ends, with the same
-- ids as the stage files there (40000000-0000-0000-0001-<the stage number as 12 digits>: the 0001 is the route's index in
-- the catalog, the Camino Francés is 0000, see tools/offline-maps/catalog/README.md).
-- tools/offline-maps/test/test_stage_rows_portugues.py keeps this file and the catalog in step.
--
-- Eleven stages, not the twelve that routes.stage_count says for this route. The division of the catalog is the common
-- one: the Rother guide and Vagamundos.pt for Porto to Rubiães, and the six stages of the Xunta de Galicia (Tui to
-- Santiago) for the rest; the sources are in the notes of each catalog file. The routes row is not changed here (the app's
-- route picker keeps saying "12 stages" until somebody decides which division the app teaches and updates stage_count).
--
-- What is deliberately not here:
--   * distance_km. The catalog has a sourced distance for none of these stages, and an invented number is worse than
--     none (tools/offline-maps/catalog/README.md). The column has accepted null since the Camino Francés migration
--     (20261112000000), so this file needs no alter table: "not known yet" is a null. The app shows no kilometres for
--     such a stage, and the day plan sums only the kilometres it has. Fill the numbers in with a later migration when
--     there is a source for each of them.
--   * start and end places, elevation, difficulty, description and geometry: not known yet either (all nullable).
--   * publication. is_published stays false, so the stages are invisible to the app (the "published stages are
--     public" policy), nobody can choose them as a starting stage and start_journey plans no days for them. To open
--     them to pilgrims, once their packs are published and the app can show a stage without kilometres:
--         update public.stages set is_published = true
--          where route_id = '20000000-0000-0000-0000-000000000002' and stage_number between 1 and 11;
--     (and the same statement with false takes them back).
--
-- Safe to run twice: the rows are inserted "on conflict do nothing" by id. It never changes or removes a row that exists.

insert into public.stages (id, route_id, stage_number, name) values
  ('40000000-0000-0000-0001-000000000001', '20000000-0000-0000-0000-000000000002',  1, 'Porto to Vilarinho'),
  ('40000000-0000-0000-0001-000000000002', '20000000-0000-0000-0000-000000000002',  2, 'Vilarinho to Barcelos'),
  ('40000000-0000-0000-0001-000000000003', '20000000-0000-0000-0000-000000000002',  3, 'Barcelos to Ponte de Lima'),
  ('40000000-0000-0000-0001-000000000004', '20000000-0000-0000-0000-000000000002',  4, 'Ponte de Lima to Rubiães'),
  ('40000000-0000-0000-0001-000000000005', '20000000-0000-0000-0000-000000000002',  5, 'Rubiães to Tui'),
  ('40000000-0000-0000-0001-000000000006', '20000000-0000-0000-0000-000000000002',  6, 'Tui to O Porriño'),
  ('40000000-0000-0000-0001-000000000007', '20000000-0000-0000-0000-000000000002',  7, 'O Porriño to Redondela'),
  ('40000000-0000-0000-0001-000000000008', '20000000-0000-0000-0000-000000000002',  8, 'Redondela to Pontevedra'),
  ('40000000-0000-0000-0001-000000000009', '20000000-0000-0000-0000-000000000002',  9, 'Pontevedra to Caldas de Reis'),
  ('40000000-0000-0000-0001-000000000010', '20000000-0000-0000-0000-000000000002', 10, 'Caldas de Reis to Padrón'),
  ('40000000-0000-0000-0001-000000000011', '20000000-0000-0000-0000-000000000002', 11, 'Padrón to Santiago de Compostela')
on conflict (id) do nothing;
