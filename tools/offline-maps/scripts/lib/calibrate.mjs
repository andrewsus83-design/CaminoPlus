// Calibration: turn the numbers of ONE real build into the gates of a stage file, honestly.
//
// Why this exists. The floors in stage 1's render_checks were guesses made before any real build.
// The first real CI render counted 12 building features in Saint-Jean z15 where 30 were expected and
// 4 in Roncesvalles where 5 were expected, on a healthy pack, and CI failed. So the rule is: floors and
// bands come from a real build, with margin, and a broken build never becomes the baseline.
//
//   proposeQuality(manifest)   the "quality" band: 0.6x to 1.6x of the measured size and tile count
//   proposeFloors(view)        render floors: 40 percent of what a view really rendered
//   refuseReason(manifest, report)  why this build must NOT be used as a baseline (null when it can)
//
// Everything in this file is pure (no files, no network), so test/calibrate.test.mjs pins it and
// scripts/calibrate_stage.mjs only does the reading, printing and writing. The rationale for the
// numbers is in docs/calibration.md.
import { isDeepStrictEqual } from 'node:util';
import { checkManifest } from './quality.mjs';

const MB = 1024 * 1024;

/** Layers the map style cannot do without. A pack only has to contain the ones it really has (see proposeQuality). */
export const STANDARD_LAYERS = ['building', 'place', 'poi', 'transportation', 'transportation_name'];
/** Source layers that get a `min_features` floor, in the order the stage files list them. */
export const FLOOR_SOURCE_LAYERS = ['poi', 'transportation', 'building', 'mountain_peak'];
/** Style layers that draw text and get a `min_labels` floor of 1 (keys of the report's `layers`). */
export const LABEL_STYLE_LAYERS = ['place', 'peak'];
/** Below this many rendered features a count is too small to base a floor on (one more building is 20 percent). */
export const MIN_MEASURED = 5;
/** Keys of a quality band that come from the measurement; the others are policy and are never re-derived. */
const MEASURED_BAND_KEYS = ['min_tiles', 'max_tiles', 'min_size_mb', 'max_size_mb', 'required_layers'];

/**
 * The viewer draws the route and the corridor on top of the map as GeoJSON ("route", "corridor"), and the render test counts
 * their features too (CI passes both files). They are not map data: a view over an empty part of the pack still shows them.
 */
const OVERLAYS = new Set(['route', 'corridor']);
const mapFeatures = (counts) => Object.entries(counts ?? {}).reduce((a, [k, n]) => a + (!OVERLAYS.has(k) && Number.isFinite(n) ? n : 0), 0);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isFilled = (v) => isObject(v) && Object.keys(v).length > 0;

// ---------------------------------------------------------------------------------------------
// proposeQuality

/**
 * The band for stages/<slug>.json, key "quality": 0.6x to 1.6x of what this build measured, rounded
 * outward (size in MB with 1 decimal, tile counts to the nearest 10), so the build it came from is
 * always inside with some slack. required_layers is the standard list limited to the layers the pack
 * really has: never require a layer the pack lacks.
 * Throws when the manifest has no usable size or tile count (call refuseReason first).
 */
export function proposeQuality(manifest) {
  const size = manifest?.size_bytes;
  const tiles = manifest?.tiles;
  if (!Number.isFinite(size) || size <= 0) throw new RangeError(`proposeQuality: size_bytes must be a positive number, got ${size}`);
  if (!Number.isInteger(tiles) || tiles <= 0) throw new RangeError(`proposeQuality: tiles must be a positive integer, got ${tiles}`);
  const have = new Set(Array.isArray(manifest.layers) ? manifest.layers : []);
  // 0.6x and 1.6x are computed on integers (6/10 and 16/10), not as 0.6 * x. In floating point 0.6 * 4.5 MB is
  // 2.6999999999999997, which would round down to 2.6 although 2.7 is exact, and 1.6 * 3 MB is 4.800000000000001,
  // which would round up to 4.9. size_bytes * 6 / MB is already "tenths of a MB" (0.6 * 10), and MB is a power
  // of two, so that division is exact.
  return {
    min_tiles: Math.floor((tiles * 6) / 100) * 10,
    max_tiles: Math.ceil((tiles * 16) / 100) * 10,
    min_size_mb: Math.floor((size * 6) / MB) / 10,
    max_size_mb: Math.ceil((size * 16) / MB) / 10,
    required_layers: STANDARD_LAYERS.filter((l) => have.has(l)),
    max_change_ratio: 1.5,
    max_osm_age_days: 45,
  };
}

// ---------------------------------------------------------------------------------------------
// proposeFloors

/**
 * Render floors for one view of the render report ({features: {sourceLayer: n}, layers: {styleLayer: n}}).
 * min_features: floor(0.4 x measured) for poi, transportation, building, mountain_peak, only when the
 *   measured count is at least 5 (smaller counts are noise, so that layer simply gets no floor), never below 1.
 * min_labels: 1 for the style layers `place` and `peak` when at least one label of it was drawn.
 */
export function proposeFloors(view) {
  const features = view?.features ?? {};
  const layers = view?.layers ?? {};
  const min_features = {};
  for (const layer of FLOOR_SOURCE_LAYERS) {
    const n = features[layer];
    // n * 40 / 100 on integers, like the band above: no floating point rounding to reason about.
    if (Number.isFinite(n) && n >= MIN_MEASURED) min_features[layer] = Math.max(1, Math.floor((n * 40) / 100));
  }
  const min_labels = {};
  for (const layer of LABEL_STYLE_LAYERS) {
    if (Number.isFinite(layers[layer]) && layers[layer] >= 1) min_labels[layer] = 1;
  }
  return { min_features, min_labels };
}

// ---------------------------------------------------------------------------------------------
// refuseReason

/** Every reason this build must not become a baseline (empty array: it can). Plain sentences. */
export function refusalReasons(manifest, report) {
  const m = manifest ?? {};
  const r = report ?? {};
  const why = [];

  if (m.route_source !== 'osm') {
    why.push(
      `route_source is ${m.route_source === undefined ? 'missing' : `'${m.route_source}'`}, not 'osm': the route came from the hand-drawn ` +
      'fallback, so the corridor (and the pack) may cover the wrong area. Fix the route and rebuild.',
    );
  }
  if (r.ok !== true) {
    const failures = Array.isArray(r.failures) && r.failures.length ? ` (${r.failures.slice(0, 3).join(' | ')})` : '';
    why.push(`the render report says ok: ${String(r.ok)}${failures}.`);
  }
  if (Array.isArray(r.errors) && r.errors.length) {
    why.push(`the render report lists ${r.errors.length} console, page or map error(s), the first: ${r.errors[0]}`);
  }
  for (const [key, what] of [['blocked_requests', 'tried to leave the device'], ['failed_requests', 'failed']]) {
    if (Array.isArray(r[key]) && r[key].length) why.push(`${r[key].length} request(s) ${what}, the first: ${r[key][0]}`);
  }
  if (!Number.isFinite(m.size_bytes) || m.size_bytes <= 0) {
    why.push(`the manifest has no usable size_bytes (${m.size_bytes}): the pack is empty or the manifest is incomplete.`);
  }
  if (!Number.isInteger(m.tiles) || m.tiles <= 0) {
    why.push(`the manifest has no usable tile count (${m.tiles}): the pack is empty, or the manifest was written by an old build_stage.sh.`);
  }
  if (Number.isInteger(m.pack_max_zoom) && Number.isInteger(m.maxzoom) && m.pack_max_zoom < m.maxzoom) {
    why.push(`the pack stops at z${m.pack_max_zoom} but z${m.maxzoom} was requested.`);
  }

  // A view with nothing drawn is a view over an empty or missing part of the pack: its numbers would
  // silently turn into "no floor". Both render phases count.
  if (!Array.isArray(r.views) || r.views.length === 0) why.push('the render report has no views, so nothing was measured.');
  const offlineViews = r.device_offline?.views;
  for (const [phase, views] of [['with the outside network blocked', r.views], ['with the device offline', offlineViews]]) {
    for (const v of Array.isArray(views) ? views : []) {
      if (mapFeatures(v?.features) === 0) {
        why.push(`view "${v?.name}" rendered 0 features ${phase}: the pack is empty there, or the view is outside it (the route and corridor lines do not count).`);
      }
    }
  }
  if (!Array.isArray(offlineViews) && r.device_offline && mapFeatures(r.device_offline.features) === 0) {
    why.push('nothing rendered with the device offline.');
  }

  // The report and the manifest must describe the same build: 32 stages means 64 files to mix up.
  if (typeof r.pack === 'string' && typeof m.file === 'string' && r.pack !== m.file) {
    why.push(`the render report is for ${r.pack} but the manifest is for ${m.file}: they come from different builds.`);
  } else if (Number.isFinite(r.size_bytes) && Number.isFinite(m.size_bytes) && r.size_bytes !== m.size_bytes) {
    why.push(`the render report saw a pack of ${r.size_bytes} bytes but the manifest says ${m.size_bytes}: they come from different builds.`);
  }
  if (Number.isInteger(r.header?.tiles) && Number.isInteger(m.tiles) && r.header.tiles !== m.tiles) {
    why.push(`the render report saw ${r.header.tiles} tiles but the manifest says ${m.tiles}: they come from different builds.`);
  }
  return why;
}

/** A string when the build must NOT be used as a baseline (all reasons, one per line), null when it can. */
export function refuseReason(manifest, report) {
  const why = refusalReasons(manifest, report);
  return why.length ? why.join('\n') : null;
}

// ---------------------------------------------------------------------------------------------
// Matching the report's views to the stage file's render_checks

/** The name render_offline.mjs gives a view: its "name", else its coordinates. */
export function viewName(check) {
  return check?.name || (Array.isArray(check?.at) ? check.at.join(',') : undefined);
}

const isOverview = (v) => v?.name === 'overview' && (v.at === 'fit' || v.at == null);

function lowerOf(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) out[k] = Math.min(a?.[k] ?? 0, b?.[k] ?? 0);
  return out;
}

/**
 * The report's views with the two render phases merged: a floor is enforced in both (network blocked,
 * device offline), so what counts is the lower of the two numbers. Same length and order as report.views.
 */
export function measuredViews(report) {
  const offline = report?.device_offline?.views;
  return (report?.views ?? []).map((view, i) => {
    const other = Array.isArray(offline) && offline[i]?.name === view?.name ? offline[i] : null;
    return other ? { ...view, features: lowerOf(view.features, other.features), layers: lowerOf(view.layers, other.layers) } : view;
  });
}

/**
 * Pair each render_check of the stage file with the view of the report that measured it.
 * The report lists the overview first, then the stage's views in order; a pair needs the same name
 * and the same coordinates, so numbers measured somewhere else (a view moved or renamed since the run)
 * are never applied. Position first (names can repeat), then a unique name.
 * @returns {{index: number, name: string, status: 'matched'|'unmatched', view?: object, reportIndex?: number, reason?: string}[]}
 */
export function pairViews(checks, reportViews) {
  const views = Array.isArray(reportViews) ? reportViews : [];
  const first = isOverview(views[0]) ? 1 : 0;
  const candidates = views.slice(first).map((view, i) => ({ view, reportIndex: first + i }));
  return (Array.isArray(checks) ? checks : []).map((check, index) => {
    const name = viewName(check);
    if (name === undefined) return { index, name: `#${index + 1}`, status: 'unmatched', reason: 'it has neither a name nor "at" coordinates.' };
    let hit = candidates[index]?.view?.name === name ? candidates[index] : undefined;
    if (!hit) {
      const named = candidates.filter((c) => c.view?.name === name);
      if (named.length === 1) [hit] = named;
    }
    if (!hit) return { index, name, status: 'unmatched', reason: 'the report has no view of that name (renamed, or the report is from another version of the stage file).' };
    if (!isDeepStrictEqual(hit.view.at, check.at)) {
      return {
        index, name, status: 'unmatched',
        reason: `the view moved since the run (stage file ${JSON.stringify(check.at)}, report ${JSON.stringify(hit.view.at)}), so its numbers describe another place.`,
      };
    }
    return { index, name, status: 'matched', view: hit.view, reportIndex: hit.reportIndex };
  });
}

// ---------------------------------------------------------------------------------------------
// The plan: what to write, what to keep, what contradicts the build

const fmt = (v) => (Array.isArray(v) ? (isDeepStrictEqual(v, STANDARD_LAYERS) ? 'the 5 standard layers' : v.join(',')) : String(v));

/** The band: written when absent, kept when present (unless recalibrating), checked against the build either way. */
function planBand({ existing, proposed, manifest, recalibrate }) {
  const size = `${(manifest.size_bytes / MB).toFixed(2)} MB`;
  const measured = {
    min_size_mb: size, max_size_mb: size,
    min_tiles: `${manifest.tiles} tiles`, max_tiles: `${manifest.tiles} tiles`,
    required_layers: `${proposed.required_layers.length} of ${STANDARD_LAYERS.length} standard layers`,
  };
  const has = isFilled(existing);
  const rows = [];
  const conflicts = [];
  const row = (k, kind, result) => rows.push({
    field: k, measured: measured[k] ?? '-', existing: has && k in existing ? fmt(existing[k]) : '-', proposed: fmt(proposed[k]), kind, result,
  });

  if (!has) {
    for (const k of Object.keys(proposed)) row(k, 'set', 'set');
    return { value: proposed, changed: true, rows, conflicts };
  }
  if (!recalibrate) {
    for (const k of Object.keys(proposed)) {
      if (!(k in existing)) row(k, 'none', 'not set: the band exists without it');
      else if (isDeepStrictEqual(existing[k], proposed[k])) row(k, 'same', 'same');
      else row(k, 'kept', 'kept');
    }
    // The existing band must still hold the build it is being checked against.
    for (const e of checkManifest(manifest, existing).errors) conflicts.push(`quality band: ${e}`);
    return { value: existing, changed: false, rows, conflicts };
  }
  const next = {};
  for (const k of Object.keys(proposed)) next[k] = MEASURED_BAND_KEYS.includes(k) || !(k in existing) ? proposed[k] : existing[k];
  for (const k of Object.keys(existing)) if (!(k in next)) next[k] = existing[k];
  for (const k of Object.keys(proposed)) {
    if (!(k in existing)) row(k, 'set', 'set');
    else if (isDeepStrictEqual(existing[k], next[k])) row(k, 'same', 'same');
    else row(k, 'replaced', `replaced: ${fmt(existing[k])} -> ${fmt(next[k])}`);
  }
  return { value: next, changed: !isDeepStrictEqual(next, existing), rows, conflicts };
}

/**
 * The floors of one view, one of min_features (kind) or min_labels. `managed` are the keys this tool derives;
 * a floor someone added for another layer is never touched. Rules:
 *  - nothing there yet: fill with the proposal
 *  - floors there, not recalibrating: keep them all, and report any floor above what the build rendered
 *  - recalibrating: re-derive the managed keys, print old -> new, flag every floor that goes down
 */
function planFloors({ view, kind, existing, proposed, managed, measured, recalibrate }) {
  const seen = (k) => measured[k] ?? 0;
  const rows = [];
  const conflicts = [];
  const row = (k, rowKind, result, old, next) => rows.push({
    field: `${kind}.${k}`, measured: String(seen(k)), existing: old === undefined ? '-' : String(old), proposed: next === undefined ? '-' : String(next), kind: rowKind, result,
  });
  const clash = (k, old) => {
    if (Number.isFinite(old) && old > seen(k)) {
      conflicts.push(`view "${view}": ${kind}.${k} is ${old} in the stage file but this build rendered ${seen(k)}, so CI would fail.`);
      return true;
    }
    return false;
  };
  const fill = Object.keys(proposed).length > 0;

  if (!isFilled(existing)) {
    for (const k of managed) {
      if (k in proposed) row(k, 'set', 'set', undefined, proposed[k]);
      else if (seen(k) > 0) row(k, 'none', `no floor (a count needs ${MIN_MEASURED} or more)`);
    }
    return { value: fill ? proposed : existing, changed: fill, rows, conflicts };
  }

  if (!recalibrate) {
    for (const [k, old] of Object.entries(existing)) {
      if (clash(k, old)) row(k, 'conflict', 'CONFLICT: above what was rendered', old, proposed[k]);
      else {
        const state = proposed[k] === old ? 'same' : 'kept';
        row(k, state, state, old, proposed[k]);
      }
    }
    for (const k of managed) if (!(k in existing) && k in proposed) row(k, 'none', 'not added: the view already has floors', undefined, proposed[k]);
    return { value: existing, changed: false, rows, conflicts };
  }

  const next = {};
  for (const [k, old] of Object.entries(existing)) {
    if (!managed.includes(k)) {
      next[k] = old;
      if (clash(k, old)) row(k, 'conflict', 'CONFLICT: above what was rendered (not derived by this tool, fix by hand)', old);
      else row(k, 'kept', 'kept (not derived by this tool)', old);
    } else if (k in proposed) {
      next[k] = proposed[k];
      if (proposed[k] === old) row(k, 'same', 'same', old, proposed[k]);
      else row(k, 'replaced', `replaced: ${old} -> ${proposed[k]}${proposed[k] < old ? ' LOWERED' : ''}`, old, proposed[k]);
    } else {
      row(k, 'replaced', `removed: ${old} -> none LOWERED (measured ${seen(k)}, a floor needs ${MIN_MEASURED} or more)`, old);
    }
  }
  for (const k of managed) if (!(k in existing) && k in proposed) { next[k] = proposed[k]; row(k, 'set', 'set', undefined, proposed[k]); }
  return { value: next, changed: !isDeepStrictEqual(next, existing), rows, conflicts };
}

/**
 * Work out what calibrating `stage` from this build does. Pure: returns the new stage object (`model`),
 * the minimal set of values to write (`writes`), the rows to print, and what the build contradicts.
 * Call refuseReason first: this assumes the build is usable.
 *
 * @param {{stage: object, manifest: object, report: object, recalibrate?: boolean}} input
 */
export function planCalibration({ stage, manifest, report, recalibrate = false }) {
  const proposedBand = proposeQuality(manifest);
  const model = structuredClone(stage);
  const writes = { quality: undefined, views: [] };
  const conflicts = [];
  const warnings = [];

  const band = planBand({ existing: stage.quality, proposed: proposedBand, manifest, recalibrate });
  conflicts.push(...band.conflicts);
  if (band.changed) { model.quality = band.value; writes.quality = band.value; }

  const have = new Set(manifest.layers ?? []);
  if (have.size === 0) warnings.push('the manifest lists no vector layers, so required_layers is empty and no layer is required.');
  else for (const l of STANDARD_LAYERS.filter((x) => !have.has(x))) {
    warnings.push(`the pack has no "${l}" layer, so it is not required. The style draws it: check that the build is complete before relying on this band.`);
  }

  const checks = Array.isArray(stage.render_checks) ? stage.render_checks : [];
  if (checks.length === 0) warnings.push('the stage file has no render_checks, so there are no render floors to calibrate.');
  const merged = measuredViews(report);
  const pairs = pairViews(checks, merged);

  const views = pairs.map((p) => {
    if (p.status !== 'matched') {
      warnings.push(`view "${p.name}" was NOT calibrated: ${p.reason}`);
      return { ...p, rows: [] };
    }
    const check = checks[p.index];
    const floors = proposeFloors(p.view);
    if (!isDeepStrictEqual(proposeFloors(report.views[p.reportIndex]), floors)) {
      warnings.push(`view "${p.name}": the two render phases (network blocked, device offline) measured different numbers; the floors use the lower of the two.`);
    }
    const common = { view: p.name, recalibrate };
    const mf = planFloors({ ...common, kind: 'min_features', existing: check.min_features, proposed: floors.min_features, managed: FLOOR_SOURCE_LAYERS, measured: p.view.features ?? {} });
    const ml = planFloors({ ...common, kind: 'min_labels', existing: check.min_labels, proposed: floors.min_labels, managed: LABEL_STYLE_LAYERS, measured: p.view.layers ?? {} });
    conflicts.push(...mf.conflicts, ...ml.conflicts);
    const write = { index: p.index };
    if (mf.changed) { model.render_checks[p.index].min_features = mf.value; write.min_features = mf.value; }
    if (ml.changed) { model.render_checks[p.index].min_labels = ml.value; write.min_labels = ml.value; }
    if (write.min_features || write.min_labels) writes.views.push(write);
    return { ...p, at: check.at, rows: [...mf.rows, ...ml.rows] };
  });

  const used = new Set(pairs.filter((p) => p.status === 'matched').map((p) => p.reportIndex));
  const unusedReportViews = merged.map((v, i) => ({ v, i })).filter(({ v, i }) => !used.has(i) && !isOverview(v)).map(({ v }) => v.name);

  const all = [...band.rows, ...views.flatMap((v) => v.rows)];
  const count = (kind) => all.filter((r) => r.kind === kind).length;
  return {
    proposed: proposedBand, model, writes, conflicts, warnings, unusedReportViews,
    band: band.rows, views,
    changed: writes.quality !== undefined || writes.views.length > 0,
    counts: { set: count('set'), replaced: count('replaced'), kept: count('kept'), same: count('same'), conflict: count('conflict') },
  };
}

// ---------------------------------------------------------------------------------------------
// Writing: change the stage file's text in place

// A stage file is written by several tools and by hand: Python with \u escapes, floats like 3.0,
// one-line arrays, CRLF. Parsing and re-printing the whole file would change all of that, so the edit is
// made in the text: only the values being set are touched, every other byte stays. A minimal scanner
// finds where each value starts and ends (the text is already known to be valid JSON).

function scanJson(text) {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const string = () => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const value = () => {
    ws();
    const start = i;
    if (text[i] === '{') {
      i++;
      const members = [];
      ws();
      if (text[i] === '}') { i++; return { start, end: i, members }; }
      for (;;) {
        ws();
        const keyStart = i;
        const key = string();
        ws();
        i++; // ':'
        members.push({ key, keyStart, value: value() });
        ws();
        if (text[i++] === '}') return { start, end: i, members };
      }
    }
    if (text[i] === '[') {
      i++;
      const items = [];
      ws();
      if (text[i] === ']') { i++; return { start, end: i, items }; }
      for (;;) {
        items.push(value());
        ws();
        if (text[i++] === ']') return { start, end: i, items };
      }
    }
    if (text[i] === '"') { string(); return { start, end: i }; }
    while (i < text.length && !',]} \t\r\n'.includes(text[i])) i++; // number, true, false, null
    return { start, end: i };
  };
  return value();
}

const lastMember = (obj, key) => [...obj.members].reverse().find((m) => m.key === key);
const lineIndent = (text, pos) => /^[ \t]*/.exec(text.slice(text.lastIndexOf('\n', pos - 1) + 1, pos))[0];
/** The whitespace between the previous token and `pos`: how this file separates one member from the next. */
const leadingSpace = (text, pos) => { let k = pos; while (k > 0 && /\s/.test(text[k - 1])) k--; return text.slice(k, pos); };

/** One-line JSON in the style of a hand-written file: { "poi": 3, "building": 3 }. */
function compact(v) {
  if (Array.isArray(v)) return `[${v.map(compact).join(', ')}]`;
  if (isObject(v)) {
    const entries = Object.entries(v);
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
}

/**
 * Set members of an object node: replace the value of an existing key, insert the others (before `before`, else last).
 * New text follows the file: its indent unit and line ending, and one-line values where the text around it is one-line.
 */
function setMembers(text, obj, entries, ctx, before) {
  const edits = [];
  const fresh = [];
  const render = (value, indent, flat) => (flat ? compact(value) : JSON.stringify(value, null, ctx.unit).split('\n').join(ctx.nl + indent));
  for (const [key, value] of entries) {
    const member = lastMember(obj, key);
    if (!member) fresh.push([key, value]);
    else {
      const old = text.slice(member.value.start, member.value.end);
      if (isDeepStrictEqual(JSON.parse(old), value)) continue;
      const oneLine = (member.value.members?.length || member.value.items?.length) > 0 && !old.includes('\n');
      edits.push({ start: member.value.start, end: member.value.end, text: render(value, lineIndent(text, member.keyStart), oneLine) });
    }
  }
  if (fresh.length === 0) return edits;

  if (obj.members.length === 0) {
    const indent = lineIndent(text, obj.start);
    const inner = indent + ctx.unit;
    const body = fresh.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${render(v, inner, false)}`).join(`,${ctx.nl}`);
    edits.push({ start: obj.start, end: obj.end, text: `{${ctx.nl}${body}${ctx.nl}${indent}}` });
    return edits;
  }
  const anchor = before && lastMember(obj, before);
  const next = anchor || obj.members[obj.members.length - 1];
  const lead = leadingSpace(text, next.keyStart);
  const indent = lineIndent(text, next.keyStart);
  const flat = !text.slice(obj.start, obj.end).includes('\n');
  const items = fresh.map(([k, v]) => `${JSON.stringify(k)}: ${render(v, indent, flat)}`);
  if (anchor) edits.push({ start: anchor.keyStart, end: anchor.keyStart, text: items.map((s) => `${s},${lead}`).join('') });
  else edits.push({ start: next.value.end, end: next.value.end, text: items.map((s) => `,${lead}${s}`).join('') });
  return edits;
}

/**
 * Apply `writes` ({quality?, views: [{index, min_features?, min_labels?}]}, from planCalibration) to the
 * text of a stage file. Returns the text unchanged when there is nothing to write.
 */
export function patchStageText(text, writes) {
  const root = scanJson(text);
  const first = root.members[0];
  const ctx = { nl: text.includes('\r\n') ? '\r\n' : '\n', unit: (first && lineIndent(text, first.keyStart)) || '  ' };
  const edits = [];
  if (writes.quality !== undefined) edits.push(...setMembers(text, root, [['quality', writes.quality]], ctx, 'render_checks'));
  if (writes.views?.length) {
    const checks = lastMember(root, 'render_checks').value;
    for (const w of writes.views) {
      const entries = ['min_features', 'min_labels'].filter((k) => w[k] !== undefined).map((k) => [k, w[k]]);
      edits.push(...setMembers(text, checks.items[w.index], entries, ctx));
    }
  }
  // Apply from the end so earlier offsets stay valid.
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/**
 * The stage file text after the plan. The result is parsed again and must equal the plan's model, so a bug
 * in the text edit can never put a wrong or broken stage file on disk.
 */
export function applyPlan(text, plan) {
  const out = patchStageText(text, plan.writes);
  if (!isDeepStrictEqual(JSON.parse(out), plan.model)) {
    throw new Error('internal error: the edited stage file would not match the calibration plan. Nothing was written.');
  }
  return out;
}
