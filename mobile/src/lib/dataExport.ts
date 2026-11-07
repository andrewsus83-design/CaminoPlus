// "Download my data": a copy of everything the signed-in pilgrim's account holds, as one JSON file
// (GDPR right of access and portability, promised on camino.plus/privacy).
//
// It runs on the phone with the pilgrim's own session, so Row Level Security decides what comes back:
// only their own rows, the same data the app already shows them. No server function is needed. A table
// the client may not read (or that this database does not have yet) is noted in the file instead of
// failing the whole export.
import { Platform, Share } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { supabase } from './supabase';

/** Table name and the column that holds the owner's id. */
export const EXPORT_TABLES: ReadonlyArray<readonly [table: string, ownerColumn: string]> = [
  ['profiles', 'id'],
  ['user_settings', 'user_id'],
  ['journeys', 'user_id'],
  ['journey_private', 'user_id'],
  ['journey_days', 'user_id'],
  ['user_stamps', 'user_id'],
  ['tracks', 'user_id'],
  ['posts', 'user_id'],
  ['post_media', 'user_id'],
  ['post_comments', 'user_id'],
  ['post_likes', 'user_id'],
  ['post_saves', 'user_id'],
  ['favorites', 'user_id'],
  ['follows', 'follower_id'],
  ['blocks', 'blocker_id'],
  ['friendships', 'user_a'],
  ['friendships', 'user_b'],
  ['conversation_members', 'user_id'],
  ['messages', 'sender_id'],
  ['notifications', 'user_id'],
  ['health_daily', 'user_id'],
  ['health_workouts', 'user_id'],
  ['wearable_connections', 'user_id'],
  ['user_achievements', 'user_id'],
  ['xp_events', 'user_id'],
  ['hunt_progress', 'user_id'],
  ['hunt_step_completions', 'user_id'],
  ['crowd_reports', 'user_id'],
  ['crowd_report_votes', 'user_id'],
  ['stay_reviews', 'user_id'],
  ['content_reports', 'reporter_id'],
  ['face_match_consents', 'user_id'],
  ['subscriptions', 'user_id'],
  ['storage_addons', 'user_id'],
  ['storage_usage', 'user_id'],
  ['marketplace_purchases', 'buyer_id'],
  ['business_members', 'user_id'],
  ['app_feedback', 'user_id'],
];

const PAGE = 1000;
const MAX_ROWS = 20000; // per table; far above what one pilgrim produces
const MEDIA_BUCKET = 'user-media';
const LINK_SECONDS = 7 * 24 * 3600;

type TableResult = { rows: unknown[] } | { error: string };

export type DataExport = {
  format: 'caminoplus-data-export';
  version: 1;
  exported_at: string;
  user_id: string;
  email: string | null;
  note: string;
  tables: Record<string, TableResult>;
  media_links?: { expires_at: string; files: { path: string; url: string | null }[] } | { error: string };
};

async function readTable(table: string, column: string, userId: string): Promise<TableResult> {
  const rows: unknown[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').eq(column, userId).range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows };
}

/** Reads every table in EXPORT_TABLES for this user. `onProgress` gets (done, total). */
export async function collectMyData(userId: string, email: string | null, onProgress?: (done: number, total: number) => void): Promise<DataExport> {
  const tables: Record<string, TableResult> = {};
  let done = 0;
  for (const [table, column] of EXPORT_TABLES) {
    const key = EXPORT_TABLES.filter(([t]) => t === table).length > 1 ? `${table} (${column})` : table;
    tables[key] = await readTable(table, column, userId);
    onProgress?.(++done, EXPORT_TABLES.length);
  }

  const out: DataExport = {
    format: 'caminoplus-data-export',
    version: 1,
    exported_at: new Date().toISOString(),
    user_id: userId,
    email,
    note: 'Everything your CaminoPlus account holds. Photos and videos are linked under media_links (the links work for 7 days). Questions: privacy@camino.plus',
    tables,
  };

  const media = tables.post_media;
  const paths = media && 'rows' in media
    ? (media.rows as { storage_path?: string | null }[]).map((r) => r.storage_path).filter((p): p is string => !!p)
    : [];
  if (paths.length) {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, LINK_SECONDS);
    out.media_links = error
      ? { error: error.message }
      : {
          expires_at: new Date(Date.now() + LINK_SECONDS * 1000).toISOString(),
          files: (data ?? []).map((d, i) => ({ path: d.path ?? paths[i], url: d.signedUrl ?? null })),
        };
  }
  return out;
}

export const exportFileName = (d = new Date()) => `caminoplus-my-data-${d.toISOString().slice(0, 10)}.json`;

/** Counts of rows per table, for the summary on screen. */
export function summarize(e: DataExport) {
  let rows = 0;
  let unavailable = 0;
  for (const t of Object.values(e.tables)) {
    if ('rows' in t) rows += t.rows.length;
    else unavailable += 1;
  }
  return { rows, unavailable, tables: Object.keys(e.tables).length };
}

/**
 * Hands the file to the pilgrim: the share sheet on iOS (Save to Files, AirDrop, Mail...), a folder of
 * their choice on Android, a normal download on the web. Resolves false if they cancelled.
 */
export async function saveExport(e: DataExport): Promise<boolean> {
  const json = JSON.stringify(e, null, 2);
  const name = exportFileName();

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  }

  if (Platform.OS === 'android') {
    let dir: Directory;
    try {
      dir = await Directory.pickDirectoryAsync();
    } catch {
      return false; // picker closed
    }
    dir.createFile(name, 'application/json').write(json);
    return true;
  }

  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  const res = await Share.share({ url: file.uri, title: name });
  return res.action !== Share.dismissedAction;
}
