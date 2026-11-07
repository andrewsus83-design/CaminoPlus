// The hooks the screens use: the stays and the points of interest of a stage, and the stage the pilgrim is on.
//
//   const { rows, source, loading, error, offline } = useStageStays(stageId);
//
// Stale-while-revalidate: the saved copy (or what this session already fetched) shows at once and the server is asked
// again in the background; the answer replaces it and is saved. What is shown is decided in decide.ts (plain node tests
// cover it): live rows, the saved copy when the server cannot be reached, or the bundled sample when the database has no
// places for the stage and there is nothing saved. Nothing here throws, and a failed call never empties a screen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { localStore, userKey } from '../../lib/localStore';
import { useOnline } from '../map/useConnectivity';
import { placesApi } from './client';
import { cacheKey, isFresh, type CacheKind } from './cache';
import { afterAnswer, beforeAnswer, chooseMyStage, type PlanStage } from './decide';
import { isListedStay, sampleStayModels, toStayModel } from './models';
import { parsePoiRows, parseStayRows, UUID } from './parse';
import { poiPin, samplePins } from './pins';
import { clearSaved, readSaved, writeSaved } from './store';
import type { Cached, FetchResult, PlacePin, PlaceSource, PlacesState, PoiRow, StayModel, StayRow } from './types';

type Spec<R, M> = {
  kind: CacheKind;
  fetch: (stageId: string) => Promise<FetchResult<R>>;
  parse: (data: unknown) => R[] | null;
  /** Rows that are not for this list at all (a pharmacy among the stays); dropped before anything is decided or saved. */
  keep: (row: R) => boolean;
  toModel: (row: R) => M | null;
  sample: () => M[];
};

const staysSpec: Spec<StayRow, StayModel> = {
  kind: 'stays',
  fetch: placesApi.listStageStays,
  parse: parseStayRows,
  keep: isListedStay,
  toModel: toStayModel,
  sample: sampleStayModels,
};
const poisSpec: Spec<PoiRow, PlacePin> = {
  kind: 'pois',
  fetch: placesApi.listStagePois,
  parse: parsePoiRows,
  keep: () => true,
  toModel: poiPin,
  sample: samplePins,
};

// What was fetched from the server in this app session, and the requests on their way (two screens asking for the same
// stage share one request, and the stay page opens with the list the Stays tab already has).
type Memo = { rows: unknown[]; savedAt: number };
const memory = new Map<string, Memo>();
const inflight = new Map<string, Promise<FetchResult<unknown>>>();

function fetchShared<R>(spec: Spec<R, unknown>, stageId: string, key: string): Promise<FetchResult<R>> {
  const running = inflight.get(key);
  if (running) return running as Promise<FetchResult<R>>;
  const run = spec.fetch(stageId).then((res): FetchResult<R> => {
    const checked: FetchResult<R> = res.ok ? { ok: true, rows: res.rows.filter(spec.keep) } : res;
    // the saved copy follows the answer (written, dropped or left alone): the rule is decide.ts's
    const act = afterAnswer(checked, null, Date.now()).cache;
    if (checked.ok && act === 'write') {
      memory.set(key, { rows: checked.rows, savedAt: Date.now() });
      void writeSaved(spec.kind, stageId, checked.rows);
    } else if (act === 'clear') {
      memory.delete(key);
      void clearSaved(spec.kind, stageId);
    }
    return checked;
  }).finally(() => { inflight.delete(key); });
  inflight.set(key, run);
  return run;
}

type Core<R> = { key: string; rows: R[]; source: PlaceSource; offline: boolean; error: string | null; savedAt: number | null };

function useStagePlaces<R, M>(spec: Spec<R, M>, stageId: string | null | undefined): PlacesState<M> {
  const id = stageId && UUID.test(stageId) ? stageId.toLowerCase() : null;
  const key = id ? cacheKey(spec.kind, id) : null;
  const [core, setCore] = useState<Core<R> | null>(null);

  // Back online: ask again.
  const online = useOnline();
  const wasOnline = useRef<boolean | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (online === true && wasOnline.current === false) setTick((t) => t + 1);
    wasOnline.current = online;
  }, [online]);

  useEffect(() => {
    if (!id || !key) return;
    let alive = true;
    (async () => {
      // 1. what is already at hand: fetched in this session, or saved on the phone
      const memo = memory.get(key) as { rows: R[]; savedAt: number } | undefined;
      let cached: Cached<R> | null = memo ? { rows: memo.rows, savedAt: memo.savedAt } : null;
      if (!cached) {
        const saved = await readSaved(spec.kind, id, spec.parse);
        cached = saved ? { rows: saved.rows.filter(spec.keep), savedAt: saved.savedAt } : null;
        if (cached && cached.rows.length === 0) cached = null;
      }
      if (!alive) return;
      const first = beforeAnswer(cached);
      if (first && cached) setCore({ key, rows: first.rows, source: memo ? 'live' : first.source, offline: false, error: null, savedAt: cached.savedAt });
      if (memo && isFresh(memo.savedAt, Date.now())) return; // fetched a moment ago: nothing to revalidate

      // 2. ask the server, and show what it said (or fall back)
      const res = await fetchShared(spec as unknown as Spec<R, unknown>, id, key);
      if (!alive) return;
      const shown = afterAnswer(res, cached, Date.now());
      setCore({ key, rows: shown.rows, source: shown.source, offline: shown.offline, error: shown.error, savedAt: shown.savedAt });
    })().catch((e) => {
      // nothing above should throw; if it ever does the screen falls back to the sample instead of crashing
      if (alive) setCore({ key, rows: [], source: 'sample', offline: false, error: e instanceof Error ? e.message : String(e), savedAt: null });
    });
    return () => { alive = false; };
  }, [id, key, tick, spec]);

  return useMemo((): PlacesState<M> => {
    const models = (rows: R[]) => rows.map(spec.toModel).filter((m): m is NonNullable<M> => m != null);
    if (!id || !key) return { rows: spec.sample(), source: 'sample', loading: false, error: null, offline: false, savedAt: null };
    if (!core || core.key !== key) {
      // the first render for this stage: a list fetched earlier in this session shows without a gap, otherwise "loading"
      const memo = memory.get(key) as { rows: R[]; savedAt: number } | undefined;
      return memo
        ? { rows: models(memo.rows), source: 'live', loading: false, error: null, offline: false, savedAt: memo.savedAt }
        : { rows: [], source: 'sample', loading: true, error: null, offline: false, savedAt: null };
    }
    if (core.source === 'sample') return { rows: spec.sample(), source: 'sample', loading: false, error: core.error, offline: core.offline, savedAt: null };
    return { rows: models(core.rows), source: core.source, loading: false, error: core.error, offline: core.offline, savedAt: core.savedAt };
  }, [id, key, core, spec]);
}

/** Stays, cafes and bars along a stage (the bundled sample stays when the database has none for it). */
export const useStageStays = (stageId: string | null | undefined) => useStagePlaces(staysSpec, stageId);
/** Churches, fountains and the like along a stage, as map pins (the bundled sample pins when the database has none for it). */
export const useStagePois = (stageId: string | null | undefined) => useStagePlaces(poisSpec, stageId);

/* ------------------------------------------------------------------ the stage the pilgrim is on */

const isPlanStage = (v: unknown): v is PlanStage => {
  const s = v as Partial<PlanStage> | null;
  return !!s && typeof s.journeyId === 'string' && typeof s.stageId === 'string' && UUID.test(s.stageId) && (s.stageName === null || typeof s.stageName === 'string');
};

/**
 * The stage the Stays tab lists: the next day of the pilgrim's plan that is not finished (saved on the phone, so it is
 * known offline). `loading` is true until the first answer, so the tab does not flash the sample before the real list.
 */
export function useMyStage(): { stageId: string | null; stageName: string | null; loading: boolean } {
  const { session, journey } = useAuth();
  const uid = session?.user.id ?? null;
  const journeyId = journey?.id ?? null;
  const startId = journey?.start_stage_id ?? null;
  const startName = journey?.start_stage?.name ?? null;
  const key = uid && journeyId ? `${uid}:${journeyId}` : null;
  const [state, setState] = useState<{ key: string; stage: PlanStage | null } | null>(null);

  const online = useOnline();
  const wasOnline = useRef<boolean | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (online === true && wasOnline.current === false) setTick((t) => t + 1);
    wasOnline.current = online;
  }, [online]);

  // Every time the tab comes into view: the plan moves on when a day is marked done.
  useFocusEffect(
    useCallback(() => {
      if (!uid || !journeyId || !key) return;
      let alive = true;
      const savedKey = userKey(uid, 'places.stage');
      (async () => {
        const raw = await localStore.getJSON<unknown>(savedKey);
        const cached = isPlanStage(raw) && raw.journeyId === journeyId ? raw : null;
        if (!alive) return;
        if (cached) setState((s) => (s && s.key === key ? s : { key, stage: cached })); // the saved one at once
        const fetched = await placesApi.getPlanStage(journeyId);
        if (!alive) return;
        const { stage, cache } = chooseMyStage({ journeyId, fetched, cached, start: { stageId: startId, stageName: startName } });
        if (cache === 'write' && stage) void localStore.setJSON(savedKey, stage);
        else if (cache === 'clear') void localStore.remove(savedKey);
        setState({ key, stage });
      })().catch(() => { if (alive) setState({ key, stage: null }); });
      return () => { alive = false; };
    }, [uid, journeyId, key, startId, startName, tick]),
  );

  if (!key) return { stageId: null, stageName: null, loading: false };
  if (!state || state.key !== key) return { stageId: null, stageName: null, loading: true };
  return { stageId: state.stage?.stageId ?? null, stageName: state.stage?.stageName ?? null, loading: false };
}
