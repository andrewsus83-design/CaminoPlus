// Quality gates for a built offline pack. Pure functions (no file or network access) so they
// are unit tested in test/quality.test.mjs and shared by scripts/check_pack.mjs (CI, offline)
// and scripts/publish_pack.mjs (before anything is uploaded).
//
// The band comes from the stage file (stages/<slug>.json, key "quality"):
//   min_tiles / max_tiles          addressed tiles in the PMTiles header
//   min_size_mb / max_size_mb      file size
//   required_layers                vector layers the style needs (OpenMapTiles names)
//   max_change_ratio               allowed size / tile-count change against the previous pack (default 1.5)
//   max_osm_age_days               OSM extract must be this fresh when publishing (default 45)
// A band that is too loose lets a broken build through; too tight blocks good ones. Re-measure
// after a Planetiler upgrade and edit the stage file in the same pull request.

const MB = 1024 * 1024;
const DAY_MS = 24 * 3600 * 1000;

export const DEFAULTS = { max_change_ratio: 1.5, max_osm_age_days: 45 };

const fmtMb = (bytes) => `${(bytes / MB).toFixed(2)} MB`;

/** @returns {{errors: string[], warnings: string[]}} */
export function checkManifest(m, q, { publishing = false, now = new Date() } = {}) {
  const errors = [];
  const warnings = [];
  const where = `${m.file || m.slug || 'pack'}`;

  if (publishing && m.route_source !== 'osm') {
    errors.push(
      `${where}: route_source is '${m.route_source}', not 'osm'. The route came from the hand-drawn fallback, ` +
      'so the corridor (and the pack) may cover the wrong area. Fix route_from_osm.py or the OSM relation, then rebuild.',
    );
  }

  if (!q) {
    (publishing ? errors : warnings).push(`${where}: the stage file has no "quality" band, so size and tile count cannot be checked.`);
    return { errors, warnings };
  }

  if (!Number.isFinite(m.size_bytes) || m.size_bytes <= 0) errors.push(`${where}: manifest has no valid size_bytes.`);
  else {
    if (q.min_size_mb != null && m.size_bytes < q.min_size_mb * MB) {
      errors.push(`${where}: pack is ${fmtMb(m.size_bytes)}, below the minimum of ${q.min_size_mb} MB. The build probably lost data (empty extract, wrong corridor).`);
    }
    if (q.max_size_mb != null && m.size_bytes > q.max_size_mb * MB) {
      errors.push(`${where}: pack is ${fmtMb(m.size_bytes)}, above the maximum of ${q.max_size_mb} MB. Check the corridor width and maxzoom before publishing.`);
    }
  }

  if (q.min_tiles != null || q.max_tiles != null) {
    if (!Number.isInteger(m.tiles)) {
      errors.push(`${where}: manifest has no tile count. Rebuild with the current scripts/build_stage.sh (it reads the PMTiles header).`);
    } else {
      if (q.min_tiles != null && m.tiles < q.min_tiles) errors.push(`${where}: ${m.tiles} tiles, below the minimum of ${q.min_tiles}.`);
      if (q.max_tiles != null && m.tiles > q.max_tiles) errors.push(`${where}: ${m.tiles} tiles, above the maximum of ${q.max_tiles}.`);
    }
  }

  if (Number.isInteger(m.pack_max_zoom) && Number.isInteger(m.maxzoom) && m.pack_max_zoom < m.maxzoom) {
    errors.push(`${where}: the pack stops at z${m.pack_max_zoom} but z${m.maxzoom} was requested.`);
  }

  if (q.required_layers?.length) {
    const have = new Set(m.layers || []);
    if (have.size === 0) errors.push(`${where}: manifest lists no vector layers (cannot check ${q.required_layers.join(', ')}).`);
    else {
      const missing = q.required_layers.filter((l) => !have.has(l));
      if (missing.length) errors.push(`${where}: missing vector layers: ${missing.join(', ')}. The style draws them, so the map would be incomplete.`);
    }
  }

  if (publishing) {
    const maxAge = q.max_osm_age_days ?? DEFAULTS.max_osm_age_days;
    const ts = Date.parse(m.osm_timestamp);
    if (!Number.isFinite(ts)) errors.push(`${where}: manifest has no valid osm_timestamp.`);
    else {
      const age = Math.floor((now.getTime() - ts) / DAY_MS);
      if (age > maxAge) errors.push(`${where}: OSM data is ${age} days old (limit ${maxAge}). The extract was not refreshed.`);
    }
  }
  return { errors, warnings };
}

/**
 * Compare a new pack with the one that is live now. `prev` is {size_bytes, tiles?, version?}:
 * a row of offline_packs (size only) or the previous manifest (size and tiles).
 */
export function compareWithPrevious(m, prev, q = {}) {
  const errors = [];
  const warnings = [];
  if (!prev) return { errors, warnings };
  const max = q.max_change_ratio ?? DEFAULTS.max_change_ratio;
  const label = prev.version != null ? ` v${prev.version}` : '';

  const check = (what, now, before, fmt) => {
    if (!(before > 0) || !(now > 0)) return;
    const ratio = now / before;
    if (ratio > max || ratio < 1 / max) {
      errors.push(
        `${what} changed ${ratio.toFixed(2)}x against the published pack${label} (${fmt(before)} -> ${fmt(now)}), ` +
        `outside the allowed 1/${max} to ${max}x. A monthly OSM refresh never changes a stage that much: ` +
        'inspect the build, or raise max_change_ratio in the stage file if the change is real.',
      );
    }
  };
  check('Pack size', m.size_bytes, prev.size_bytes, fmtMb);
  if (Number.isInteger(prev.tiles) && Number.isInteger(m.tiles)) check('Tile count', m.tiles, prev.tiles, (n) => `${n} tiles`);
  return { errors, warnings };
}

/** One printable block for CLI output. */
export function report({ errors, warnings }) {
  return [...errors.map((e) => `ERROR   ${e}`), ...warnings.map((w) => `warning ${w}`)].join('\n');
}
