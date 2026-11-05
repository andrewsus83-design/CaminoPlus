// Everything the Maps screen derives: which tiles to draw (online MapTiler vs offline
// packs), the walker position and route progress, and the pack status line.
import { useEffect, useMemo, useState } from 'react';
import { hasMapTiler } from './config';
import { LngLat, distanceM, lineLengthM, nearestOnLine, splitLine } from './geo';
import { ensureGlyphs } from './glyphs';
import { loadInstalled, packSourceUrl, refreshCatalog, usePacks } from './packs/store';
import { ROUTE_ID, routeLine, samplePosition, stageForPoint, stages } from './sampleRoute';
import type { TileSource } from './style';
import { timeAgo } from './timeAgo';
import { useOnline } from './useConnectivity';
import { GpsMode, useWalkerLocation } from './useWalkerLocation';

/** A fix further than this from the route is treated as "not on the Camino". */
const ON_ROUTE_M = 2000;

export type PackStatus =
  | { kind: 'online' }
  | { kind: 'ready'; text: string; stale: boolean }
  | { kind: 'missing'; stageNumber: number }
  | { kind: 'loading' };

export function useMapModel({ gpsMode, visible }: { gpsMode: GpsMode; visible: boolean }) {
  const online = useOnline();
  const packsState = usePacks();
  const { fix, permission } = useWalkerLocation(gpsMode, visible);
  const [glyphs, setGlyphs] = useState<string | null>(null);
  const [glyphError, setGlyphError] = useState<string | null>(null);

  useEffect(() => {
    loadInstalled();
    ensureGlyphs().then(setGlyphs, (e) => setGlyphError(String(e)));
  }, []);

  // Refresh pack versions when we come online (cheap RPC, needs login).
  useEffect(() => {
    if (online) refreshCatalog(ROUTE_ID);
  }, [online]);

  const onRoute = !!fix && nearestOnLine(routeLine, fix.at).distanceM <= ON_ROUTE_M;
  const progressAt: LngLat = onRoute && fix ? fix.at : samplePosition;
  const [done, remaining] = useMemo(() => splitLine(routeLine, progressAt), [progressAt[0], progressAt[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const walkedKm = Math.round(lineLengthM(done) / 1000);

  const stage = stageForPoint(progressAt);
  const nextTownKm = Math.max(0, Math.round(distanceM(progressAt, stage.line[stage.line.length - 1]) / 100) / 10);

  // MapTiler only when online (and a key exists). Offline: packs of this stage ±1.
  const useOnlineTiles = online === true && hasMapTiler();
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

  return {
    online,
    useOnlineTiles,
    glyphs,
    glyphError,
    packSources,
    status,
    permission,
    walker: onRoute && fix ? { at: fix.at, accuracyM: fix.accuracyM, sample: false } : { at: samplePosition, accuracyM: null, sample: true },
    gpsOffRoute: !!fix && !onRoute,
    done,
    remaining,
    walkedKm,
    stage,
    nextTownKm,
  };
}
