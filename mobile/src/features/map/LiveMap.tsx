// The real map: MapLibre Native. Needs a dev build (expo-dev-client), not Expo Go.
//
// Two looks, one style (style.ts):
//  - 'Helicopter': the whole route, flat, north-up. The camera is declared (bounds) and animates on layer changes.
//  - 'City' = the Walk view: pitch 60, heading-up, the walker in the lower part of the free map area, 3D buildings,
//    a bold dotted route to the red pin at the end of the stage. While `follow` is true the camera eases to every new
//    fix; panning, pinching, rotating or tilting by hand calls onFollowChange(false) and the camera stays where the
//    pilgrim put it until the screen asks for a re-centre (recenterKey).
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NativeSyntheticEvent, useWindowDimensions } from 'react-native';
import { Camera, GeoJSONSource, Images, Layer, Map, type CameraRef, type LayerProps, type MapRef, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import { layout } from '@/theme';
import { onlineTilesUrl } from './config';
import { normDeg } from './nav';
import { pois, routeBounds, towns } from './sampleRoute';
import { buildStyle, firstLabelLayerId, type TileSource } from './style';
import type { MapViewProps } from './types';
import {
  IMAGE, WALK_MAX_ZOOM, WALK_MIN_ZOOM, WALK_PITCH, WALK_ZOOM, destinationLayers, lineFeature, overviewRouteLayers, poiLayers, stageEndFeature,
  townLayers, walkPadding, walkRouteLayers, walkerFeature, walkerLayers, walkerOverviewLayers, type LayerSpec,
} from './walkLayers';

// Bundled PNGs (assets/map, 1x/2x/3x): the puck with and without a heading arrow, day and night, and the red pin.
const IMAGES = {
  [IMAGE.pin]: require('../../../assets/map/pin-destination.png'),
  [IMAGE.arrowDay]: require('../../../assets/map/puck-arrow-day.png'),
  [IMAGE.arrowNight]: require('../../../assets/map/puck-arrow-night.png'),
  [IMAGE.dotDay]: require('../../../assets/map/puck-dot-day.png'),
  [IMAGE.dotNight]: require('../../../assets/map/puck-dot-night.png'),
  [IMAGE.sample]: require('../../../assets/map/puck-sample.png'),
};

const poiData: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: pois.map((p) => ({ type: 'Feature', id: p.id, properties: { id: p.id, kind: p.kind, name: p.name }, geometry: { type: 'Point', coordinates: p.at } })),
};
const townData: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: towns.map((t) => ({ type: 'Feature', properties: { name: t.name, major: !!t.major }, geometry: { type: 'Point', coordinates: t.at } })),
};

/** A native <Layer> for each spec; `beforeId` slides route lines under the street and place names. */
const layers = (specs: LayerSpec[], beforeId?: string) =>
  specs.map((s) => <Layer key={s.id} {...(s as unknown as LayerProps)} {...(beforeId ? { beforeId } : {})} />);

/** The camera does not chase every frame of the entry flight: moves are held back this long after entering. */
const ENTRY_MS = 1300;

function LiveMapImpl(p: MapViewProps) {
  const { height: screenH } = useWindowDimensions();
  const heli = p.layer === 'Helicopter';
  const night = !!p.night;
  const follow = p.follow !== false;
  const headingUp = p.headingUp !== false;
  const lastPoiPress = useRef(0);
  const mapRef = useRef<MapRef>(null);
  const camRef = useRef<CameraRef>(null);
  const hold = useRef(0); // follow moves are skipped until this time (ms since epoch)
  const [walkZoom, setWalkZoom] = useState(WALK_ZOOM);
  const [settle, setSettle] = useState(0);

  const at = p.walker?.at ?? p.focus;
  const pad = useMemo(() => walkPadding(screenH, p.insets.top, p.insets.bottom), [screenH, p.insets.top, p.insets.bottom]);
  // Heading-up uses the smoothed direction of travel and keeps the last one when there is none; north-up is 0.
  const lastBearing = useRef(0);
  if (headingUp && p.headingDeg != null) lastBearing.current = p.headingDeg;
  const bearing = headingUp ? lastBearing.current : 0;

  // Newest values for timers and native callbacks (they must not close over old props).
  const latest = useRef({ heli, at, bearing, pad, walkZoom, follow, onFollowChange: p.onFollowChange, onBearingChange: p.onBearingChange, onSelectPoi: p.onSelectPoi });
  latest.current = { heli, at, bearing, pad, walkZoom, follow, onFollowChange: p.onFollowChange, onBearingChange: p.onBearingChange, onSelectPoi: p.onSelectPoi };

  const sources = useMemo<TileSource[]>(() => (p.online ? [{ id: 'omt', url: onlineTilesUrl() }] : p.packSources), [p.online, p.packSources]);
  const sourcesKey = sources.map((s) => s.url).join('|');
  const buildings3d = p.buildings3d !== false;
  const mapStyle = useMemo(
    () => buildStyle({ glyphs: p.glyphs, online: p.online, sources, night, buildings3d }),
    // Rebuild only when the set of sources, the palette or the 3D switch changes; a new style object reloads the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.glyphs, p.online, sourcesKey, night, buildings3d],
  );
  const labelId = firstLabelLayerId(sources);

  /* ---------------------------------------------------------------- camera */

  // Declared camera for entering a layer: frozen per layer so later renders never move it (follow moves are imperative).
  const stop = useMemo(() => {
    if (heli) return { bounds: routeBounds, padding: { top: p.insets.top + 24, bottom: p.insets.bottom + 24, left: 32, right: 32 }, pitch: 0, bearing: 0, duration: 900, easing: 'fly' as const }; // top-gap-ok: camera padding, not a screen margin
    const l = latest.current;
    return { center: l.at, zoom: l.walkZoom, pitch: WALK_PITCH, bearing: normDeg(l.bearing), padding: l.pad, duration: 1200, easing: 'fly' as const };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.layer, heli ? p.insets.top : 0, heli ? p.insets.bottom : 0]);

  // Entering the Walk view: the declared camera flies in; hold follow moves, then settle once so late insets apply.
  useEffect(() => {
    if (heli) return;
    hold.current = Date.now() + ENTRY_MS;
    const t = setTimeout(() => setSettle((n) => n + 1), ENTRY_MS + 100);
    return () => clearTimeout(t);
  }, [heli]);

  // Re-centre: fly back to the walker in the Walk camera. Declared before the follow effect so it can hold it.
  const recenterKey = p.recenterKey;
  useEffect(() => {
    if (!recenterKey || latest.current.heli) return;
    hold.current = Date.now() + 1000;
    const t = setTimeout(() => {
      const l = latest.current;
      if (l.heli) return;
      try {
        void Promise.resolve(camRef.current?.setStop({ center: l.at, zoom: l.walkZoom, pitch: WALK_PITCH, bearing: normDeg(l.bearing), padding: l.pad, duration: 900, easing: 'fly' })).catch(() => {});
      } catch {
        /* camera not ready yet: the next fix moves it */
      }
    }, 50);
    return () => clearTimeout(t);
  }, [recenterKey]);

  // Follow: ease to each new fix, heading and padding while attached.
  const roundedBearing = Math.round(bearing);
  useEffect(() => {
    if (heli || !follow || Date.now() < hold.current) return;
    try {
      void Promise.resolve(camRef.current?.setStop({ center: at, zoom: walkZoom, pitch: WALK_PITCH, bearing: normDeg(bearing), padding: pad, duration: p.saver ? 900 : 700, easing: 'ease' })).catch(() => {});
    } catch {
      /* camera not ready yet */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heli, follow, at[0], at[1], roundedBearing, walkZoom, pad.top, pad.bottom, settle]);

  // The compass button toggled heading-up while the pilgrim is looking elsewhere: turn the map about where it is.
  const prevHeadingUp = useRef(headingUp);
  useEffect(() => {
    if (prevHeadingUp.current === headingUp) return;
    prevHeadingUp.current = headingUp;
    if (latest.current.heli || latest.current.follow) return; // attached: the follow effect turns it
    try {
      void Promise.resolve(camRef.current?.setStop({ bearing: normDeg(latest.current.bearing), duration: 500, easing: 'ease' })).catch(() => {});
    } catch {
      /* camera not ready yet */
    }
  }, [headingUp]);

  // Zoom buttons: attached in the Walk view they change the walking zoom; otherwise zoom about the current centre.
  const zoomN = p.zoomCmd?.n ?? 0;
  const zoomDir = p.zoomCmd?.dir ?? 1;
  useEffect(() => {
    if (!zoomN) return;
    if (!latest.current.heli && latest.current.follow) {
      setWalkZoom((z) => Math.min(WALK_MAX_ZOOM, Math.max(WALK_MIN_ZOOM, z + zoomDir)));
      return;
    }
    void mapRef.current?.getZoom().then((z) => {
      camRef.current?.zoomTo(Math.min(18, Math.max(4, z + zoomDir)), { duration: 250 });
    }).catch(() => {});
  }, [zoomN, zoomDir]);

  /* ---------------------------------------------------------------- map events */

  const onPress = useCallback(() => {
    // A pin press also reaches the map; ignore that echo.
    if (Date.now() - lastPoiPress.current > 400) latest.current.onSelectPoi(undefined);
  }, []);
  // A hand gesture (pan, pinch, rotate, tilt) detaches the camera. Programmatic moves report userInteraction = false.
  const onWillChange = useCallback((e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const l = latest.current;
    if (!l.heli && l.follow && e.nativeEvent.userInteraction) l.onFollowChange?.(false);
  }, []);
  const emitted = useRef({ t: 0, b: -999 });
  const emitBearing = useCallback((raw: number, force: boolean) => {
    const b = Math.round(normDeg(raw));
    const now = Date.now();
    const e = emitted.current;
    if (!force && (now - e.t < 150 || Math.abs(b - e.b) < 1)) return;
    if (b === e.b) return;
    emitted.current = { t: now, b };
    latest.current.onBearingChange?.(b);
  }, []);
  const onChanging = useCallback((e: NativeSyntheticEvent<ViewStateChangeEvent>) => emitBearing(e.nativeEvent.bearing, false), [emitBearing]);
  const onDidChange = useCallback((e: NativeSyntheticEvent<ViewStateChangeEvent>) => emitBearing(e.nativeEvent.bearing, true), [emitBearing]);

  /* ---------------------------------------------------------------- overlay data and layers */

  const selected = p.selectedPoiId ?? '';
  const remainingData = useMemo(() => lineFeature(p.remaining), [p.remaining]);
  const doneData = useMemo(() => lineFeature(p.done), [p.done]);
  const aheadData = useMemo(() => lineFeature(p.ahead ?? []), [p.ahead]);
  const beyondData = useMemo(() => lineFeature(p.beyond ?? []), [p.beyond]);
  const endData = useMemo(() => stageEndFeature(p.stageEnd ?? null), [p.stageEnd]);
  const walkerData = useMemo(
    () => (p.walker ? walkerFeature({ at: p.walker.at, accuracyM: p.walker.accuracyM, sample: p.walker.sample, headingDeg: p.headingDeg ?? null, night }) : null),
    [p.walker, p.headingDeg, night],
  );
  const overview = useMemo(() => overviewRouteLayers(night), [night]);
  const walkRoute = useMemo(() => walkRouteLayers(night), [night]);
  const destination = useMemo(() => destinationLayers(night), [night]);
  const pinSpecs = useMemo(() => poiLayers(selected, p.poiKinds, night), [selected, p.poiKinds, night]);
  const townSpecs = useMemo(() => townLayers(night), [night]);
  const walkerSpecs = useMemo(() => walkerLayers(night), [night]);
  const walkerDotSpecs = useMemo(() => walkerOverviewLayers(night), [night]);

  return (
    <Map
      ref={mapRef}
      style={{ flex: 1 }}
      mapStyle={mapStyle}
      logo={false}
      attribution
      attributionPosition={heli ? { bottom: p.insets.bottom + 4, left: 8 } : { bottom: p.insets.bottom + 8, right: 12 }}
      compass={heli}
      compassPosition={{ top: p.insets.top + layout.screenTop, right: 12 }}
      compassHiddenFacingNorth
      scaleBar={false}
      touchPitch={!heli}
      preferredFramesPerSecond={p.saver ? 30 : 60}
      onPress={onPress}
      onRegionWillChange={onWillChange}
      onRegionIsChanging={onChanging}
      onRegionDidChange={onDidChange}
    >
      <Camera ref={camRef} key={p.layer} {...stop} minZoom={4} maxZoom={18} />
      <Images images={IMAGES} />

      {heli ? (
        <>
          {/* Route: remaining = dashed, done = gold. */}
          <GeoJSONSource key="ov-remaining" id="ov-remaining" data={remainingData}>{layers(overview.remaining, labelId)}</GeoJSONSource>
          <GeoJSONSource key="ov-done" id="ov-done" data={doneData}>{layers(overview.done, labelId)}</GeoJSONSource>
          <GeoJSONSource key="ov-towns" id="ov-towns" data={townData}>{layers(townSpecs)}</GeoJSONSource>
        </>
      ) : (
        <>
          {/* Walk view: faint route after the stage, thin gold behind, bold dotted ahead, then the red pin. All under the street names. */}
          <GeoJSONSource key="walk-beyond" id="walk-beyond" data={beyondData}>{layers(walkRoute.beyond, labelId)}</GeoJSONSource>
          <GeoJSONSource key="walk-done" id="walk-done" data={doneData}>{layers(walkRoute.done, labelId)}</GeoJSONSource>
          <GeoJSONSource key="walk-ahead" id="walk-ahead" data={aheadData}>{layers(walkRoute.ahead, labelId)}</GeoJSONSource>
          <GeoJSONSource key="walk-end" id="walk-end" data={endData}>{layers(destination)}</GeoJSONSource>
          <GeoJSONSource
            key="walk-pois"
            id="walk-pois"
            data={poiData}
            hitbox={{ top: 22, right: 22, bottom: 22, left: 22 }}
            onPress={(e) => {
              const id = e.nativeEvent.features?.[0]?.properties?.id as string | undefined;
              if (!id) return;
              lastPoiPress.current = Date.now();
              p.onSelectPoi(id);
            }}
          >
            {layers(pinSpecs)}
          </GeoJSONSource>
        </>
      )}

      {walkerData && (
        <GeoJSONSource key={heli ? 'ov-walker' : 'walk-walker'} id={heli ? 'ov-walker' : 'walk-walker'} data={walkerData}>
          {layers(heli ? walkerDotSpecs : walkerSpecs)}
        </GeoJSONSource>
      )}
    </Map>
  );
}

export const LiveMap = memo(LiveMapImpl);
