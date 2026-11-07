-- The six stages of the Camino Inglés from Ferrol, added hidden.
--
-- The route row has been in the database since 20261106120000_more_caminos.sql (Ferrol to Santiago de Compostela), but it
-- had no stage. An offline map pack, the places from OpenStreetMap and a pilgrim who starts anywhere on the route all need
-- the stage row to exist first, so the rows are added here. They come from tools/offline-maps/catalog/camino-ingles/NN.json,
-- the checked list of where each stage starts and ends, with the same ids as the stage files there
-- (40000000-0000-0000-0005-<the stage number as 12 digits>; 5 is the route_index of the route in
-- tools/offline-maps/catalog/camino-ingles/route.json). tools/offline-maps/test/test_stage_rows_ingles.py keeps this file and
-- the catalog in step.
--
-- Only the main line from Ferrol. The branch from A Coruña is a variant and has no stages here.
--
-- What is deliberately not here:
--   * distance_km. The catalog has a cited distance for none of these stages, and an invented number is worse than none
--     (tools/offline-maps/catalog/README.md), so the rows carry none. The column has accepted null since
--     20261112000000_camino_frances_stages.sql, which is why this file has no alter table and has to come after it. The
--     app shows no kilometres for such a stage, and the day plan sums only the kilometres it has. Published lengths exist
--     (caminoingles.gal: 15.4, 12.9, 19.9, 24.1, 24.2 and 16.5 km; the Xunta portal and the FEAACS differ by up to 1 km,
--     see the notes of the catalog entries): fill the numbers in with a later migration once each has a cited source in
--     the catalog.
--   * the route row. routes.stage_count stays null and routes.distance_km stays 120, a rounded figure (the published
--     length from Ferrol is 112.4 to 113.4 km). Changing the route row is a separate decision.
--   * start and end places, elevation, difficulty, description and geometry: not known yet either (all nullable).
--   * publication. is_published stays false, so the stages are invisible to the app (the "published stages are public"
--     policy), nobody can choose them as a starting stage and start_journey plans no days for them. To open them to
--     pilgrims, once the app that can show a stage without kilometres is on their phones:
--         update public.stages set is_published = true
--          where route_id = '20000000-0000-0000-0000-000000000006' and stage_number between 1 and 6;
--     (and the same statement with false takes them back).
--
-- Safe to run twice: the rows are inserted "on conflict do nothing" by id. It never changes or removes a row that exists.

insert into public.stages (id, route_id, stage_number, name) values
  ('40000000-0000-0000-0005-000000000001', '20000000-0000-0000-0000-000000000006', 1, 'Ferrol to Neda'),
  ('40000000-0000-0000-0005-000000000002', '20000000-0000-0000-0000-000000000006', 2, 'Neda to Pontedeume'),
  ('40000000-0000-0000-0005-000000000003', '20000000-0000-0000-0000-000000000006', 3, 'Pontedeume to Betanzos'),
  ('40000000-0000-0000-0005-000000000004', '20000000-0000-0000-0000-000000000006', 4, 'Betanzos to Hospital de Bruma'),
  ('40000000-0000-0000-0005-000000000005', '20000000-0000-0000-0000-000000000006', 5, 'Hospital de Bruma to Sigüeiro'),
  ('40000000-0000-0000-0005-000000000006', '20000000-0000-0000-0000-000000000006', 6, 'Sigüeiro to Santiago de Compostela')
on conflict (id) do nothing;
