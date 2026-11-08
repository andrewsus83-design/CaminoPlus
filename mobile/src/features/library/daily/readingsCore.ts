// The readings of the days we have, as the files of assets/library/daily say them, read with a strict check. Pure: no React, no React Native, and the files come in as
// functions (the real ones are listed in readings.generated.ts and handed in by dayData.ts), so plain node tests can run this against the real files (npm run test:library).
//
// A FILE is readings-<year>.json, made by tools/liturgy/import_readings.py (tools/liturgy/README.md): { about, v: 1, year, days: { "2026-11-08": { r, n?, o? } } }. `r` is the four
// references of the day, [first reading, psalm, second reading, Gospel], each a text or null (the second reading is null on most days); `n` is the name of the celebration when the
// source gives one; `o` is 1 when the source calls the day by that name. Nothing else is in a file, and nothing else is accepted: a file that is not exactly this is ignored whole
// (the days it covers then have no readings and the screen says so), never half read. A reference is only text here: reference.ts says what it means.
import { isValidDay } from './calendar';
import { parseDateKey } from './datekey';
import { FIRST_YEAR, LAST_YEAR } from './liturgy';

/** The readings and the name of one day, as the file has them. */
export type DayRecord = {
  /** [first reading, psalm, second reading, Gospel]: a reference, or null where the day has none. At least one is a text. */
  refs: readonly [string | null, string | null, string | null, string | null];
  /** The name of the celebration (a saint's memorial, a feast), or null. */
  name: string | null;
  /** The source calls the day by this name: the celebration is the day, not a memorial kept beside a weekday. */
  own: boolean;
};

export type ReadingsFile = { year: number; days: ReadonlyMap<string, DayRecord> };

const MAX_TEXT = 120;
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= MAX_TEXT && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value) && !value.includes('[^');
const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(value).every((k) => allowed.includes(k));

/** The most days a file may have: a year and a leap day. */
const MAX_DAYS = 366;

/** The file, or null when it is not exactly what the importer writes (a wrong version, a day that does not exist or is in another year, a reference that is not a text, a key nobody knows). */
export function parseReadingsFile(json: unknown): ReadingsFile | null {
  if (!isPlain(json) || !onlyKeys(json, ['about', 'v', 'year', 'days'])) return null;
  const { about, v, year, days } = json;
  if (v !== 1 || typeof year !== 'number' || !Number.isInteger(year) || year < FIRST_YEAR || year > LAST_YEAR) return null;
  if (!isPlain(about) || typeof about.source !== 'string' || typeof about.read !== 'string' || typeof about.nature !== 'string') return null;
  if (!isPlain(days)) return null;
  const keys = Object.keys(days);
  if (keys.length === 0 || keys.length > MAX_DAYS) return null;
  const out = new Map<string, DayRecord>();
  for (const key of keys) {
    const day = parseDateKey(key);
    if (!day || !isValidDay(day) || day.y !== year) return null;
    const value = days[key];
    if (!isPlain(value) || !onlyKeys(value, ['r', 'n', 'o'])) return null;
    const r = value.r;
    if (!Array.isArray(r) || r.length !== 4 || !r.every((x) => x === null || isText(x)) || r.every((x) => x === null)) return null;
    if (value.n !== undefined && !isText(value.n)) return null;
    if (value.o !== undefined && (value.o !== 1 || value.n === undefined)) return null;
    out.set(key, { refs: [r[0], r[1], r[2], r[3]] as DayRecord['refs'], name: (value.n as string | undefined) ?? null, own: value.o === 1 });
  }
  return { year, days: out };
}

/** The lookup of the days we have. */
export type ReadingsLookup = {
  /** The readings of "YYYY-MM-DD", or null when no file has the day. */
  recordFor: (dateKey: string) => DayRecord | null;
  /** The years that have a file, in order. */
  years: () => number[];
};

/** A lookup over files that are read when first needed. A file that cannot be loaded or does not pass the check is left out: its days have no readings. */
export function makeReadingsLookup(loaders: readonly (() => unknown)[]): ReadingsLookup {
  let byYear: Map<number, ReadingsFile> | null = null;
  const load = (): Map<number, ReadingsFile> => {
    if (byYear) return byYear;
    byYear = new Map();
    for (const loader of loaders) {
      try {
        const file = parseReadingsFile(loader());
        if (file && !byYear.has(file.year)) byYear.set(file.year, file);
      } catch {
        // a file that cannot be read has no days
      }
    }
    return byYear;
  };
  return {
    recordFor: (dateKey) => {
      const year = Number(dateKey.slice(0, 4));
      return load().get(year)?.days.get(dateKey) ?? null;
    },
    years: () => [...load().keys()].sort((a, b) => a - b),
  };
}
