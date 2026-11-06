-- More Camino routes for the route picker. Distances are approximate ("~" in the UI) and
-- stage_count is left empty where stages are not imported yet. Stages arrive per route later.
update public.routes set name = 'Camino Portugues Central', short_name = 'Portugues Central', sort_order = 2
  where id = '20000000-0000-0000-0000-000000000002';
update public.routes set sort_order = 1 where id = '20000000-0000-0000-0000-000000000001';

insert into public.routes (id, network_id, slug, name, short_name, countries, start_name, end_name, distance_km, stage_count, difficulty, color, is_published, sort_order) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'camino-portugues-costero', 'Camino Portugues Costero (Coastal)', 'Portugues Costero', '{PT,ES}', 'Porto', 'Santiago de Compostela', 260, null, 2, '#2F6F8F', true, 3),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'camino-del-norte', 'Camino del Norte', 'Norte', '{ES}', 'Irun', 'Santiago de Compostela', 820, null, 4, '#2F5D50', true, 4),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'camino-primitivo', 'Camino Primitivo', 'Primitivo', '{ES}', 'Oviedo', 'Santiago de Compostela', 320, null, 4, '#A63D2F', true, 5),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'camino-ingles', 'Camino Ingles', 'Ingles', '{ES}', 'Ferrol', 'Santiago de Compostela', 120, null, 2, '#6E5470', true, 6),
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'via-de-la-plata', 'Via de la Plata', 'Via de la Plata', '{ES}', 'Sevilla', 'Santiago de Compostela', 1000, null, 4, '#C9A48A', true, 7),
  ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'camino-finisterre-muxia', 'Camino to Finisterre and Muxia', 'Finisterre', '{ES}', 'Santiago de Compostela', 'Finisterre', 90, null, 2, '#9DB4CC', true, 8),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'camino-aragones', 'Camino Aragones', 'Aragones', '{FR,ES}', 'Somport', 'Puente la Reina', 160, null, 3, '#BFD0C4', true, 9),
  ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'camino-de-invierno', 'Camino de Invierno', 'Invierno', '{ES}', 'Ponferrada', 'Santiago de Compostela', 260, null, 3, '#556274', true, 10),
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'camino-del-salvador', 'Camino del Salvador', 'Salvador', '{ES}', 'Leon', 'Oviedo', 120, null, 4, '#F2D8B6', true, 11),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'camino-sanabres', 'Camino Sanabres', 'Sanabres', '{ES}', 'Granja de Moreruela', 'Santiago de Compostela', null, null, 3, '#D7C6E0', true, 12),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'camino-de-madrid', 'Camino de Madrid', 'Madrid', '{ES}', 'Madrid', 'Sahagun', 320, null, 3, '#A0583F', true, 13),
  ('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 'camino-baztanes', 'Camino Baztanes', 'Baztanes', '{FR,ES}', 'Bayonne', 'Pamplona', null, null, 3, '#4E6B5A', true, 14),
  ('20000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', 'camino-portugues-lisboa', 'Camino Portugues from Lisbon', 'Lisboa', '{PT,ES}', 'Lisboa', 'Santiago de Compostela', 620, null, 3, '#E9C987', true, 15)
on conflict (id) do nothing;
