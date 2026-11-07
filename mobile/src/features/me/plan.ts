// Stages and the day plan, for the two stage pickers (onboarding, Change Camino) and the plan tracker on Me.
// Pure, so a plain-node test can check it (src/features/me/__tests__/plan.test.ts).
//
// A stage may have no distance: stages 4 to 33 of the Camino Francés are in the database without one, because no
// sourced figure exists yet and an invented number is worse than none (migration 20261112000000). So a distance is
// shown only when there is one, and progress is by kilometres only when EVERY day of the plan has them.

type Known = number | string | null | undefined;

/** The distance as a number when it is a real one (above zero), else null. Numbers can arrive as text. */
export function knownKm(v: Known): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type StageLike = { name: string; distance_km: Known; start?: { name: string } | null; end?: { name: string } | null };

/** "Roncesvalles to Zubiri · 21.4 km", or without the kilometres when the stage has none. */
export function stageMeta(s: StageLike): string {
  const where = s.start?.name && s.end?.name ? `${s.start.name} to ${s.end.name}` : s.name;
  const km = knownKm(s.distance_km);
  return km === null ? where : `${where} · ${km.toFixed(1)} km`;
}

type DayLike = { status: string | null; planned_distance_km?: Known };

export type PlanProgress = {
  /** 0 to 1 */
  value: number;
  doneStages: number;
  totalStages: number;
  /** true when every day has a distance, so value, doneKm and totalKm are by kilometres */
  byKm: boolean;
  doneKm: number;
  totalKm: number;
};

/**
 * How far along the plan is. By kilometres when every day has a distance; otherwise by stages walked, because
 * kilometres that are missing for some days would count them as zero (three stages walked of thirty-three would read
 * as finished when only the first three have a distance).
 */
export function planProgress(days: readonly DayLike[]): PlanProgress {
  const totalStages = days.length;
  const doneStages = days.filter((d) => d.status === 'done').length;
  const km = days.map((d) => knownKm(d.planned_distance_km));
  const byKm = totalStages > 0 && km.every((k) => k !== null);
  const totalKm = km.reduce<number>((a, k) => a + (k ?? 0), 0);
  const doneKm = days.reduce<number>((a, d, i) => a + (d.status === 'done' ? (km[i] ?? 0) : 0), 0);
  const value = totalStages === 0 ? 0 : byKm ? doneKm / totalKm : doneStages / totalStages;
  return { value, doneStages, totalStages, byKm, doneKm, totalKm };
}
