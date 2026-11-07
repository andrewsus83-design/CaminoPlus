// Asking the database for the places of a stage. The Supabase client and the "are we offline" checks come in as
// arguments (client.ts hands in the real ones), so this file has no React Native imports and plain node tests run the
// real code against a scripted stand-in (npm run test:places).
//
// Nothing here throws. A failure (offline, a timeout, an error answer, a function the database does not have yet, an
// answer that is not a list) comes back as { ok: false } and the caller falls back to the saved copy or the sample.
import { UUID, cleanText, parsePoiRows, parseStayRows } from './parse';
import type { PlanStage } from './decide';
import type { FetchResult, PoiRow, StayRow } from './types';

/**
 * The columns the app reads from each function. supabase/dev/check_client_contract.py compares these lists with what the
 * functions of supabase/migrations/20261111000000_stage_places.sql return, so the app can never ask for a column the
 * database does not send; places.test.ts checks that parse.ts reads exactly these and no others.
 */
export const RPC_COLUMNS = {
  list_stage_stays: [
    'id', 'name', 'category', 'kind', 'place_name', 'lat', 'lng', 'phone', 'email', 'website', 'opening_hours', 'address',
    'description', 'km_from_stage_start', 'detour_m', 'beds', 'amenities', 'labels', 'has_stamp', 'data_confidence',
    'verification_level', 'verification_at', 'source', 'osm_type', 'osm_id',
  ],
  list_stage_pois: [
    'id', 'name', 'category', 'place_name', 'lat', 'lng', 'phone', 'website', 'opening_hours', 'mass_times',
    'km_from_stage_start', 'detour_m', 'has_stamp', 'data_confidence', 'verification_level', 'verification_at',
    'source', 'osm_type', 'osm_id',
  ],
} as const;

type Answer = { data: unknown; error: { message: string } | null };

/** The little of supabase-js this file uses (the query builder is a chain of calls that ends in an awaitable). */
export type PlacesClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Answer>;
  from(table: string): PlanQuery;
};
type PlanQuery = {
  select(columns: string): PlanQuery;
  eq(column: string, value: unknown): PlanQuery;
  is(column: string, value: unknown): PlanQuery;
  in(column: string, values: unknown[]): PlanQuery;
  not(column: string, operator: string, value: unknown): PlanQuery;
  order(column: string): PlanQuery;
  limit(count: number): PromiseLike<Answer>;
};

export type PlacesNet = {
  /** Rejects when the phone says it is offline (fails fast instead of waiting for a request to time out). */
  assertOnline(): Promise<void>;
  isOffline(e: unknown): boolean;
  message(e: unknown): string;
};

const TIMEOUT_MESSAGE = 'The server took too long to answer.';

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export function makePlacesApi(client: PlacesClient, net: PlacesNet, opts: { timeoutMs?: number } = {}) {
  const timeoutMs = opts.timeoutMs ?? 12_000;

  async function list<R>(run: () => PromiseLike<Answer>, parse: (data: unknown) => R[] | null): Promise<FetchResult<R>> {
    try {
      await net.assertOnline();
      const res = await withTimeout(run(), timeoutMs);
      if (res.error) {
        // supabase-js reports a dropped connection as an error answer ("TypeError: Failed to fetch"), not as a throw
        const e = new Error(res.error.message);
        return { ok: false, offline: net.isOffline(e), message: res.error.message };
      }
      const rows = parse(res.data);
      return rows ? { ok: true, rows } : { ok: false, offline: false, message: 'The answer was not a list of places.' };
    } catch (e) {
      return { ok: false, offline: net.isOffline(e), message: net.message(e) };
    }
  }

  return {
    /** Stays, cafes and bars along a stage, in walking order. */
    listStageStays: (stageId: string): Promise<FetchResult<StayRow>> => list(() => client.rpc('list_stage_stays', { p_stage: stageId }), parseStayRows),
    /** Churches, fountains and other points of interest along a stage, in walking order. */
    listStagePois: (stageId: string): Promise<FetchResult<PoiRow>> => list(() => client.rpc('list_stage_pois', { p_stage: stageId }), parsePoiRows),

    /**
     * The stage of the next day of the journey's plan that is not finished: the plan day with the lowest number that is
     * still planned or under way and has a stage. null = the plan has no such day; 'failed' = it could not be read.
     */
    async getPlanStage(journeyId: string): Promise<PlanStage | null | 'failed'> {
      try {
        await net.assertOnline();
        const res = await withTimeout(
          client
            .from('journey_days')
            .select('stage_id, day_number, status, stage:stages(name)')
            .eq('journey_id', journeyId)
            .is('deleted_at', null)
            .in('status', ['planned', 'in_progress'])
            .not('stage_id', 'is', null)
            .order('day_number')
            .limit(1),
          timeoutMs,
        );
        if (res.error || !Array.isArray(res.data)) return 'failed';
        if (res.data.length === 0) return null;
        const row = res.data[0] as { stage_id?: unknown; stage?: { name?: unknown } | null } | null;
        if (!row || typeof row.stage_id !== 'string' || !UUID.test(row.stage_id)) return 'failed';
        return { journeyId, stageId: row.stage_id.toLowerCase(), stageName: cleanText(row.stage?.name, 120) };
      } catch {
        return 'failed';
      }
    },
  };
}

export type PlacesApi = ReturnType<typeof makePlacesApi>;
