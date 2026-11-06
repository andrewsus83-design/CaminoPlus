// The real map: MapLibre Native. Needs a dev build (expo-dev-client), not Expo Go.
import { memo, useMemo, useRef } from 'react';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { onlineTilesUrl } from './config';
import { pois, routeBounds, towns } from './sampleRoute';
import { C, buildStyle } from './style';
import type { MapViewProps } from './types';

const KIND_COLOR = ['match', ['get', 'kind'], 'church', C.blue, 'albergue', C.red, 'water', C.fountain, 'cafe', C.goldDark, 'quest', C.gold, 'stamp', C.success, C.stone];

const poiData: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: pois.map((p) => ({ type: 'Feature', id: p.id, properties: { id: p.id, kind: p.kind, name: p.name }, geometry: { type: 'Point', coordinates: p.at } })),
};
const townData: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: towns.map((t) => ({ type: 'Feature', properties: { name: t.name, major: !!t.major }, geometry: { type: 'Point', coordinates: t.at } })),
};
const line = (coords: number[][]): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });

function LiveMapImpl(p: MapViewProps) {
  const lastPoiPress = useRef(0);

  const mapStyle = useMemo(
    () => buildStyle({ glyphs: p.glyphs, online: p.online, sources: p.online ? [{ id: 'omt', url: onlineTilesUrl() }] : p.packSources }),
    // Rebuild only when the set of sources changes; a new style object reloads the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.glyphs, p.online, p.packSources.map((s) => s.url).join('|')],
  );

  const heli = p.layer === 'Helicopter';
  const padding = { top: p.insets.top + 24, bottom: p.insets.bottom + 24, left: 32, right: 32 };
  // Declarative camera: changes (layer switch, locate me) animate; user pans are kept.
  const camera = heli
    ? { bounds: routeBounds, padding, pitch: 0, bearing: 0, duration: 900, easing: 'fly' as const }
    : { center: p.focus, zoom: 15.2, pitch: 45, padding, duration: 900, easing: 'fly' as const };

  const selected = p.selectedPoiId ?? '';

  return (
    <Map
      style={{ flex: 1 }}
      mapStyle={mapStyle}
      logo={false}
      attribution
      attributionPosition={{ bottom: p.insets.bottom + 4, left: 8 }}
      compass
      compassPosition={{ top: p.insets.top + 8, right: 12 }}
      compassHiddenFacingNorth
      scaleBar={false}
      touchPitch={!heli}
      preferredFramesPerSecond={p.saver ? 30 : 60}
      onPress={() => {
        // A pin press also reaches the map; ignore that echo.
        if (Date.now() - lastPoiPress.current > 400) p.onSelectPoi(undefined);
      }}
    >
      <Camera key={`${p.layer}-${p.recenterKey}`} {...camera} minZoom={4} maxZoom={18} />

      {/* Route: remaining = dashed, done = gold. Under labels, above the basemap. */}
      <GeoJSONSource id="route-remaining" data={line(p.remaining)}>
        <Layer id="route-remaining-halo" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#FFFFFF', 'line-width': heli ? 6 : 9, 'line-opacity': 0.85 }} />
        <Layer id="route-remaining" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': C.blue, 'line-width': heli ? 3 : 4, 'line-dasharray': [1.2, 1.6], 'line-opacity': 0.75 }} />
      </GeoJSONSource>
      <GeoJSONSource id="route-done" data={line(p.done)}>
        <Layer id="route-done-halo" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#FFFFFF', 'line-width': heli ? 8 : 11 }} />
        <Layer id="route-done" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': C.gold, 'line-width': heli ? 5 : 7 }} />
      </GeoJSONSource>

      {heli ? (
        <GeoJSONSource key="towns" id="towns" data={townData}>
          <Layer id="town-dot" type="circle" paint={{ 'circle-radius': ['case', ['get', 'major'], 7, 4.5], 'circle-color': '#FFFFFF', 'circle-stroke-color': C.blue, 'circle-stroke-width': 2.5 }} />
          <Layer
            id="town-label"
            type="symbol"
            filter={['any', ['get', 'major'], ['>=', ['zoom'], 7]]}
            layout={{ 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': ['case', ['get', 'major'], 15, 12], 'text-offset': [0.9, 0], 'text-anchor': 'left' }}
            paint={{ 'text-color': C.blue, 'text-halo-color': C.parchment, 'text-halo-width': 1.8 }}
          />
        </GeoJSONSource>
      ) : (
        <GeoJSONSource
          key="pois"
          id="pois"
          data={poiData}
          hitbox={{ top: 22, right: 22, bottom: 22, left: 22 }}
          onPress={(e) => {
            const id = e.nativeEvent.features?.[0]?.properties?.id as string | undefined;
            if (!id) return;
            lastPoiPress.current = Date.now();
            p.onSelectPoi(id);
          }}
        >
          {/* RPG-style pins: quests get a soft gold glow ring. */}
          <Layer id="poi-glow" type="circle" filter={['==', ['get', 'kind'], 'quest']} paint={{ 'circle-radius': 22, 'circle-color': C.gold, 'circle-opacity': 0.22, 'circle-blur': 0.4 }} />
          <Layer
            id="poi-pin"
            type="circle"
            paint={{
              'circle-radius': ['case', ['==', ['get', 'id'], selected], 15, 11],
              'circle-color': KIND_COLOR as never,
              'circle-stroke-color': ['case', ['==', ['get', 'id'], selected], C.gold, '#FFFFFF'],
              'circle-stroke-width': ['case', ['==', ['get', 'id'], selected], 4, 3],
            }}
          />
          <Layer id="poi-core" type="circle" paint={{ 'circle-radius': 3.5, 'circle-color': '#FFFFFF' }} />
          <Layer
            id="poi-label"
            type="symbol"
            minzoom={14}
            layout={{ 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9 }}
            paint={{ 'text-color': C.blue, 'text-halo-color': C.parchment, 'text-halo-width': 1.6 }}
          />
        </GeoJSONSource>
      )}

      {p.walker && (
        <GeoJSONSource id="walker" data={{ type: 'Feature', properties: { acc: p.walker.accuracyM ?? 0, sample: p.walker.sample }, geometry: { type: 'Point', coordinates: p.walker.at } }}>
          {!heli && (
            <Layer
              key="walker-accuracy"
              id="walker-accuracy"
              type="circle"
              paint={{
                // metres -> pixels (512 px tiles, latitude ~43°: 57,243 m/px at z0)
                'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, ['/', ['get', 'acc'], 55.9], 20, ['/', ['get', 'acc'], 0.0546]],
                'circle-color': C.blue,
                'circle-opacity': 0.1,
              }}
            />
          )}
          <Layer key="walker-halo" id="walker-halo" type="circle" paint={{ 'circle-radius': heli ? 10 : 13, 'circle-color': '#FFFFFF' }} />
          <Layer key="walker-dot" id="walker-dot" type="circle" paint={{ 'circle-radius': heli ? 6.5 : 8.5, 'circle-color': ['case', ['get', 'sample'], C.stone, C.blue] }} />
        </GeoJSONSource>
      )}
    </Map>
  );
}

export const LiveMap = memo(LiveMapImpl);
