// Everything the Maps screen derives: which tiles to draw (online MapTiler vs offline
// packs), the walker position and route progress, the pack status line, and for the Walk view the
// next turn, time left, banner and card text (all from nav.ts, none of it faked without a real fix).
import { useEffect, useMemo, useState } from 'react';
import { LngLat, lineLengthM, splitLine } from './geo';
import { ensureGlyphs } from './glyphs';
import {
  type BannerState, EMPTY_TRACK, type Landmark, type Track, bannerFor, cardFor, isNight, lineTotalM, nextManeuver, nextOnTheWay, progressAlong,
  remainingToStageEnd, routeBearingAt, sliceAlong, stageEnds, updateTrack,
} from './nav';
import { loadInstalled, packSourceUrl, refreshCatalog, usePacks } from './packs/store';
import { choosePins, samplePins, useStagePois, useStageStays } from '@/features/places';
import { ROUTE_ID, routeLine, samplePosition, stageForAlong, stages, towns } from './sampleRoute';
import type { TileSource } from './style';
import { timeAgo } from './timeAgo';
import { useOnline } from './useConnectivity';
import { GpsMode, useWalkerLocation } from './useWalkerLocation';

/** A fix further than this from the route is treated as "not on the Camino". */
const ON_ROUTE_M = 2000;
/** On the Camino but this far from the line (and 1.5 x the fix accuracy) reads "Head back to the Camino". */
const OFF_LINE_MIN_M = 120;

export type PackStatus =
  | { kind: 'online' }
  | { kind: 'ready'; text: string; stale: boolean }
  | { kind: 'missing'; stageNumber: number }
  | { kind: 'loading' };

// Towns the "Next on the way" list can name (the pins of the stage are added in the hook), and where the towns fall along the route.
const townLandmarks: Landmark[] = towns.map((t) => ({ key: `t-${t.name}`, name: t.name, kind: 'town', at: t.at }));
const townAlong = towns.map((t) => ({ name: t.name, along: progressAlong(routeLine, t.at).alongM }));

/** Ticks once a minute while `active`, for the arrival clock and the day/night switch. */
function useClock(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function useMapModel({ gpsMode, visible }: { gpsMode: GpsMode; visible: boolean }) {
  const online = useOnline();
  const packsState = usePacks();
  const { fix, permission } = useWalkerLocation(gpsMode, visible);
  const now = useClock(visible);
  const [glyphs, setGlyphs] = useState<string | null>(null);
  const [glyphError, setGlyphError] = useState<string | null>(null);
  const [track, setTrack] = useState<Track>(EMPTY_TRACK);

  useEffect(() => {
    loadInstalled();
    ensureGlyphs().then(setGlyphs, (e) => setGlyphError(String(e)));
  }, []);

  // Refresh pack versions when we come online (cheap RPC, needs login).
  useEffect(() => {
    if (online) refreshCatalog(ROUTE_ID);
  }, [online]);

  const fixPos = useMemo(() => (fix ? progressAlong(routeLine, fix.at) : null), [fix]);
  const onRoute = !!fix && !!fixPos && fixPos.offM <= ON_ROUTE_M;
  const live = onRoute; // a real fix on the Camino (never a sample position)
  const progressAt: LngLat = onRoute && fix ? fix.at : samplePosition;
  const [done, remaining] = useMemo(() => splitLine(routeLine, progressAt), [progressAt[0], progressAt[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const walkedKm = Math.round(lineLengthM(done) / 1000);

  const alongNow = useMemo(() => progressAlong(routeLine, progressAt).alongM, [progressAt[0], progressAt[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const stage = stageForAlong(alongNow);
  // The pins of this stage: its real stays and points of interest (from the database, or the copy saved on the phone),
  // or the bundled sample pins when the database has none for it. Never a mix of the two.
  const stageStays = useStageStays(stage.id);
  const stagePois = useStagePois(stage.id);
  const sample = useMemo(samplePins, []);
  const { pins, source: pinSource } = useMemo(() => choosePins({ stays: stageStays, pois: stagePois, sample }), [stageStays, stagePois, sample]);
  const landmarks = useMemo<Landmark[]>(() => [...townLandmarks, ...pins.map((p) => ({ key: p.id, name: p.name, kind: p.kind, at: p.at }))], [pins]);
  const stageEndAt = stage.line[stage.line.length - 1];
  // Where the walker (or the sample position) is on the route, and how far the end of the stage is along it.
  const { pos, endAlongM: stageEndAlong, remainingM } = useMemo(() => remainingToStageEnd(routeLine, progressAt, stageEndAt), [progressAt[0], progressAt[1], stage.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextTownKm = Math.round(remainingM / 100) / 10;

  // Heading and speed, smoothed over the fixes. The route's own direction seeds the first heading and stands in
  // whenever the phone has no course; a sample position has no walker, so it faces along the route.
  useEffect(() => {
    if (!fix) return;
    const rb = fixPos && fixPos.offM <= ON_ROUTE_M ? routeBearingAt(routeLine, fixPos.alongM) : null;
    setTrack((t) => updateTrack(t, { at: fix.at, t: fix.timestamp, courseDeg: fix.courseDeg, speedMps: fix.speedMps, accuracyM: fix.accuracyM }, rb));
  }, [fix]); // eslint-disable-line react-hooks/exhaustive-deps
  const routeBrg = useMemo(() => routeBearingAt(routeLine, pos.alongM), [pos.alongM]);
  const headingDeg = live ? (track.headingDeg ?? routeBrg) : routeBrg;

  // MapTiler only when online (and a key exists). Offline: packs of this stage ±1.
  const useOnlineTiles = online === true; // MapTiler with a key, otherwise the keyless OpenFreeMap fallback
  const packSources: TileSource[] = useMemo(() => {
    const near = stages.filter((s) => Math.abs(s.number - stage.number) <= 1);
    return near.flatMap((s) => {
      const p = packsState.installed[s.id];
      return p ? [{ id: `stage${s.number}`, url: packSourceUrl(p), maxzoom: 15 }] : [];
    });
  }, [packsState.installed, stage.number]);

  const installedHere = packsState.installed[stage.id];
  const status: PackStatus = useOnlineTiles
    ? { kind: 'online' }
    : installedHere
      ? {
          kind: 'ready',
          text: `Offline pack ready · updated ${timeAgo(installedHere.downloadedAt)}`,
          stale: Date.now() - new Date(installedHere.downloadedAt).getTime() > 45 * 864e5,
        }
      : online === null
        ? { kind: 'loading' }
        : { kind: 'missing', stageNumber: stage.number };

  const walker = useMemo(
    () => (onRoute && fix ? { at: fix.at, accuracyM: fix.accuracyM, sample: false } : { at: samplePosition, accuracyM: null, sample: true }),
    [onRoute, fix],
  );

  // Walk view text and numbers.
  const offM = fixPos ? fixPos.offM : null;
  const bannerState: BannerState = permission === 'denied' ? 'denied' : !fix ? 'waiting' : !onRoute ? 'away' : (offM ?? 0) > Math.max(OFF_LINE_MIN_M, 1.5 * (fix.accuracyM ?? 0)) ? 'back' : 'walking';
  const stageTo = stageEnds(stage.name).to;
  const toward = townAlong.find((t) => t.along > pos.alongM + 30 && t.along <= stageEndAlong + 5)?.name ?? stageTo;
  const maneuver = useMemo(() => (live ? nextManeuver(routeLine, pos.alongM, stageEndAlong) : null), [live, pos.alongM, stageEndAlong]);
  const banner = useMemo(
    () => bannerFor({ state: bannerState, maneuver, toward, stageTo, stageNumber: stage.number, remainingM: live ? remainingM : null, offM }),
    [bannerState, maneuver, toward, stageTo, stage.number, live, remainingM, offM],
  );
  const card = useMemo(
    () => cardFor({ live, remainingM: live ? remainingM : null, speedMps: track.speedMps, stageDistanceKm: stage.distanceKm, stageNumber: stage.number, stageName: stage.name, now }),
    [live, remainingM, track.speedMps, stage.distanceKm, stage.number, stage.name, now],
  );
  const next = useMemo(() => (live ? nextOnTheWay(routeLine, pos.alongM, landmarks, 3) : []), [live, pos.alongM, landmarks]);
  const ahead = useMemo(() => sliceAlong(routeLine, pos.alongM, stageEndAlong), [pos.alongM, stageEndAlong]);
  const beyond = useMemo(() => sliceAlong(routeLine, stageEndAlong, lineTotalM(routeLine)), [stageEndAlong]);
  const stageEnd = useMemo(() => ({ at: stageEndAt, name: stageTo }), [stageEndAt, stageTo]);
  const autoNight = useMemo(() => isNight(now, progressAt[1], progressAt[0]), [now, progressAt[0], progressAt[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    online,
    useOnlineTiles,
    glyphs,
    glyphError,
    packSources,
    status,
    permission,
    walker,
    fix, // the raw GPS fix (null until there is one): the help bell sends this, never the sample position
    gpsOffRoute: !!fix && !onRoute,
    done,
    remaining,
    walkedKm,
    stage,
    pins,
    pinSource,
    nextTownKm,
    now,
    autoNight,
    nav: { live, state: bannerState, banner, card, next, headingDeg, ahead, beyond, stageEnd, remainingM, offM },
  };
}
