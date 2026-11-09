// The readings of the days we have, as the files of assets/library/daily say them, read with a strict check. Pure: no React, no React Native, and the files come in as
// functions (the real ones are listed in readings.generated.ts and handed in by dayData.ts), so plain node tests can run this against the real files (npm run test:library).
//
// A FILE is readings-<year>.json, made by tools/liturgy/import_readings.py (tools/liturgy/README.md): { about, v: 1, year, days: { "2026-11-08": { r, n?, o?, u?, m? } }, differ? }. `r` is the four
// references of the day, [first reading, psalm, second reading, Gospel], each a text or null (the second reading is null on most days); `n` is the name of the celebration when the
// source gives one; `o` is 1 when the source calls the day by that name; `u` lists the places of `r` where the source wrote the verses of a psalm in a form nobody reads and the importer kept
// the psalm alone ("Psalm 85"): the screen then says that the list of verses is not clear; `m` is the Mass of the day that the readings are of ("morning" on 24 December, "day" on
// 25 December), on the days the importer was told so and checked the Gospel of. `differ` lists the days of the year that the source has readings for and that are NOT the readings of the
// General Roman Calendar for that date (the source is the lectionary of the United States, which keeps some days differently: tools/liturgy/README.md): they are left out of `days`, and
// the screen says that the readings of such a day differ from country to country. Nothing else is in a file, and nothing else is accepted: a file that is not exactly this is ignored whole
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
  /** The places of `refs` where the source's list of verses was not clear and only the psalm is kept ("Psalm 85"); empty on nearly every day. */
  unclear: readonly number[];
  /** Which of the Masses of the day the readings are of (24 December: the Mass of the morning; 25 December: the Mass during the Day), or null: the day has one set of readings. */
  mass: 'morning' | 'day' | null;
};

export type ReadingsFile = {
  year: number;
  days: ReadonlyMap<string, DayRecord>;
  /** The days the source has readings for that are not the general calendar's: no readings are kept for them. */
  differ: ReadonlySet<string>;
};

const MAX_TEXT = 120;
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= MAX_TEXT && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value) && !value.includes('[^');
const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(value).every((k) => allowed.includes(k));

/** The most days a file may have: a year and a leap day. */
const MAX_DAYS = 366;

/** The file, or null when it is not exactly what the importer writes (a wrong version, a day that does not exist or is in another year, a reference that is not a text, a key nobody knows). */
export function parseReadingsFile(json: unknown): ReadingsFile | null {
  if (!isPlain(json) || !onlyKeys(json, ['about', 'v', 'year', 'days', 'differ'])) return null;
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
    if (!isPlain(value) || !onlyKeys(value, ['r', 'n', 'o', 'u', 'm'])) return null;
    const r = value.r;
    if (!Array.isArray(r) || r.length !== 4 || !r.every((x) => x === null || isText(x)) || r.every((x) => x === null)) return null;
    if (value.n !== undefined && !isText(value.n)) return null;
    if (value.o !== undefined && (value.o !== 1 || value.n === undefined)) return null;
    // `u`: places of `r` in order, each one a psalm named alone ("Psalm 85") (that is all the importer reduces a reference to)
    let unclear: number[] = [];
    if (value.u !== undefined) {
      const u = value.u;
      if (!Array.isArray(u) || u.length === 0 || u.length > 4) return null;
      let before = -1;
      for (const place of u as unknown[]) {
        if (typeof place !== 'number' || !Number.isInteger(place) || place <= before || place > 3) return null;
        const ref = r[place];
        if (typeof ref !== 'string' || !/^Psalm \d{1,3}$/.test(ref)) return null;
        before = place;
      }
      unclear = [...(u as number[])];
    }
    if (value.m !== undefined && value.m !== 'morning' && value.m !== 'day') return null;
    out.set(key, {
      refs: [r[0], r[1], r[2], r[3]] as DayRecord['refs'],
      name: (value.n as string | undefined) ?? null,
      own: value.o === 1,
      unclear,
      mass: (value.m as 'morning' | 'day' | undefined) ?? null,
    });
  }
  // the days that differ: real days of this year, each once and in order, and none of them also a day with readings
  const differ = new Set<string>();
  if (json.differ !== undefined) {
    if (!Array.isArray(json.differ) || json.differ.length === 0 || json.differ.length > MAX_DAYS) return null;
    let before = '';
    for (const key of json.differ as unknown[]) {
      const day = typeof key === 'string' ? parseDateKey(key) : null;
      if (typeof key !== 'string' || !day || !isValidDay(day) || day.y !== year || out.has(key) || key <= before) return null;
      differ.add(key);
      before = key;
    }
  }
  return { year, days: out, differ };
}

/** The lookup of the days we have. */
export type ReadingsLookup = {
  /** The readings of "YYYY-MM-DD", or null when no file has the day (or the day is one that differs, below). */
  recordFor: (dateKey: string) => DayRecord | null;
  /** True for a day that a file lists as one the source has other readings for than the general calendar's (no readings are kept for it). */
  differs: (dateKey: string) => boolean;
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
    differs: (dateKey) => {
      const year = Number(dateKey.slice(0, 4));
      return load().get(year)?.differ.has(dateKey) ?? false;
    },
    years: () => [...load().keys()].sort((a, b) => a - b),
  };
}
