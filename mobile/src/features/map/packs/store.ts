// Offline pack manager: which stage packs are on this device, downloads with progress,
// sha256 check, atomic swap, delete, and "update available" from the catalog.
//
// Files: <documents>/offline-packs/<stage_id>/tiles-v<version>.pmtiles
// Index: <documents>/offline-packs/registry.json (survives restarts, no network needed)
import { useSyncExternalStore } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import { CatalogEntry, PackError, PackErrorCode, fetchCatalog, requestSignedUrl } from './api';

export type InstalledPack = {
  stageId: string;
  packId: string;
  version: number;
  sizeBytes: number;
  sha256: string | null;
  uri: string;
  downloadedAt: string;
  publishedAt?: string;
};

export type DownloadJob = { stageId: string; received: number; total: number; phase: 'link' | 'downloading' | 'verifying' };

export type PacksState = {
  installed: Record<string, InstalledPack>;
  jobs: Record<string, DownloadJob>;
  errors: Record<string, PackErrorCode>;
  catalog: CatalogEntry[] | null;
  catalogAt?: string;
  catalogError?: PackErrorCode;
};

let state: PacksState = { installed: {}, jobs: {}, errors: {}, catalog: null };
const listeners = new Set<() => void>();
const aborts = new Map<string, AbortController>();

function set(patch: Partial<PacksState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function usePacks() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
export const getPacksState = () => state;

const root = () => new Directory(Paths.document, 'offline-packs');
const registryFile = () => new File(root(), 'registry.json');

function saveRegistry(installed: Record<string, InstalledPack>) {
  const dir = root();
  dir.create({ intermediates: true, idempotent: true });
  registryFile().write(JSON.stringify({ v: 1, installed }));
}

let loaded = false;
/** Reads the on-device index. Cheap and synchronous-ish; safe to call many times. */
export async function loadInstalled() {
  if (loaded) return;
  loaded = true;
  try {
    const f = registryFile();
    if (!f.exists) return;
    const parsed = JSON.parse(await f.text()) as { installed?: Record<string, InstalledPack> };
    const installed: Record<string, InstalledPack> = {};
    for (const [k, p] of Object.entries(parsed.installed ?? {})) {
      if (new File(p.uri).exists) installed[k] = p; // drop entries whose file vanished
    }
    set({ installed });
  } catch (e) {
    console.warn('offline packs: registry unreadable, starting empty', e);
  }
}

/** Current tiles pack for a stage from the catalog, if published. */
export const catalogTilesFor = (stageId: string) =>
  state.catalog?.find((c) => c.stage_id === stageId && c.kind === 'tiles' && (c.format === 'pmtiles' || c.format === 'mbtiles'));

export const hasUpdate = (stageId: string) => {
  const local = state.installed[stageId];
  const remote = catalogTilesFor(stageId);
  return !!local && !!remote && remote.version > local.version;
};

export async function refreshCatalog(routeId: string) {
  try {
    const catalog = await fetchCatalog(routeId);
    set({ catalog, catalogAt: new Date().toISOString(), catalogError: undefined });
  } catch (e) {
    set({ catalogError: e instanceof PackError ? e.code : 'unknown' });
  }
}

const setJob = (stageId: string, job: DownloadJob | null) => {
  const jobs = { ...state.jobs };
  if (job) jobs[stageId] = job;
  else delete jobs[stageId];
  set({ jobs });
};
const setError = (stageId: string, code: PackErrorCode | null) => {
  const errors = { ...state.errors };
  if (code) errors[stageId] = code;
  else delete errors[stageId];
  set({ errors });
};

export async function downloadStage(stageId: string) {
  if (state.jobs[stageId]) return;
  setError(stageId, null);
  const abort = new AbortController();
  aborts.set(stageId, abort);
  setJob(stageId, { stageId, received: 0, total: 0, phase: 'link' });
  const dir = new Directory(root(), stageId);
  let part: File | null = null;
  try {
    const entry = catalogTilesFor(stageId);
    if (!entry) throw new PackError(state.catalog ? 'not_built_yet' : (state.catalogError ?? 'offline'));

    // Server checks login + Pilgrim Plus, then signs a 15-minute link.
    const signed = await requestSignedUrl(entry.id);
    const total = signed.size_bytes || entry.size_bytes;
    // Room for the new file while the old version is still on disk, plus margin.
    if (Paths.availableDiskSpace > 0 && Paths.availableDiskSpace < total * 2 + 50_000_000) throw new PackError('no_space');

    dir.create({ intermediates: true, idempotent: true });
    part = new File(dir, `tiles-v${signed.version}.part`);
    if (part.exists) part.delete();
    setJob(stageId, { stageId, received: 0, total, phase: 'downloading' });
    let lastEmit = 0;
    await File.downloadFileAsync(signed.url, part, {
      idempotent: true,
      signal: abort.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const now = Date.now();
        if (now - lastEmit < 250) return; // keep re-renders cheap
        lastEmit = now;
        setJob(stageId, { stageId, received: bytesWritten, total: totalBytes > 0 ? totalBytes : total, phase: 'downloading' });
      },
    });

    setJob(stageId, { stageId, received: total, total, phase: 'verifying' });
    if (signed.size_bytes && part.size !== signed.size_bytes) throw new PackError('checksum_mismatch', `size ${part.size} != ${signed.size_bytes}`);
    if (signed.sha256) {
      const digest = (await part.digest('SHA-256')).toLowerCase();
      if (digest !== signed.sha256.toLowerCase()) throw new PackError('checksum_mismatch');
    }

    // Atomic swap: verified file takes its final name, then the index points at it,
    // and only then the old version is removed.
    const ext = signed.format === 'mbtiles' ? 'mbtiles' : 'pmtiles';
    const final = new File(dir, `tiles-v${signed.version}.${ext}`);
    if (final.exists) final.delete();
    part.moveSync(final);
    part = null;
    const previous = state.installed[stageId];
    const next: InstalledPack = {
      stageId,
      packId: entry.id,
      version: signed.version,
      sizeBytes: final.size ?? total,
      sha256: signed.sha256,
      uri: final.uri,
      downloadedAt: new Date().toISOString(),
      publishedAt: entry.published_at,
    };
    const installed = { ...state.installed, [stageId]: next };
    saveRegistry(installed);
    set({ installed });
    if (previous && previous.uri !== next.uri) {
      try { new File(previous.uri).delete(); } catch { /* already gone */ }
    }
  } catch (e) {
    const code: PackErrorCode = abort.signal.aborted ? 'cancelled' : e instanceof PackError ? e.code : 'unknown';
    if (code !== 'cancelled' && !(e instanceof Error && e.message === 'not_built_yet')) console.warn('offline pack download failed', stageId, e);
    setError(stageId, code === 'cancelled' ? null : code);
    try { part?.delete(); } catch { /* ignore */ }
  } finally {
    aborts.delete(stageId);
    setJob(stageId, null);
  }
}

export function cancelDownload(stageId: string) {
  aborts.get(stageId)?.abort();
}

export function removeStage(stageId: string) {
  const p = state.installed[stageId];
  if (!p) return;
  try {
    const dir = new Directory(root(), stageId);
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('offline pack delete failed', e);
  }
  const installed = { ...state.installed };
  delete installed[stageId];
  saveRegistry(installed);
  set({ installed });
}

export const clearError = (stageId: string) => setError(stageId, null);

/** MapLibre source URL for a local pack file. */
export const packSourceUrl = (p: InstalledPack) => (p.uri.endsWith('.mbtiles') ? p.uri.replace(/^file:\/\//, 'mbtiles://') : `pmtiles://${p.uri}`);
