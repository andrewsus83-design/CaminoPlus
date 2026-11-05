// Talks to the live Supabase backend for offline packs:
//   rpc offline_pack_catalog(p_route_id)  sizes + versions (any signed-in user)
//   functions/v1/offline-pack-url         signed 15-min link (Pilgrim Plus only)
import { getAccessToken } from '../session';
import { hasSupabase, mapConfig } from '../config';

export type CatalogEntry = {
  id: string;
  route_id: string;
  stage_id: string | null;
  kind: 'tiles' | 'data' | 'audio' | 'bundle';
  format: string;
  version: number;
  size_bytes: number;
  published_at: string;
};

export type SignedPack = {
  url: string;
  expires_at: string;
  size_bytes: number;
  sha256: string | null;
  version: number;
  format: string;
  kind: string;
};

export type PackErrorCode =
  | 'not_configured'
  | 'not_signed_in'
  | 'subscription_required'
  | 'pack_not_found'
  | 'not_built_yet'
  | 'storage_not_configured'
  | 'offline'
  | 'no_space'
  | 'checksum_mismatch'
  | 'cancelled'
  | 'unknown';

export class PackError extends Error {
  constructor(public code: PackErrorCode, message?: string) {
    super(message ?? code);
  }
}

async function headers() {
  if (!hasSupabase()) throw new PackError('not_configured', 'Supabase URL / anon key not set');
  const token = await getAccessToken();
  if (!token) throw new PackError('not_signed_in');
  return {
    apikey: mapConfig.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function post(path: string, body: unknown) {
  const h = await headers();
  let res: Response;
  try {
    res = await fetch(`${mapConfig.supabaseUrl}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  } catch {
    throw new PackError('offline');
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json;
  const code = (json?.error as string) ?? '';
  if (res.status === 401) throw new PackError('not_signed_in');
  if (res.status === 403 && code === 'subscription_required') throw new PackError('subscription_required');
  if (res.status === 404) throw new PackError('pack_not_found');
  if (res.status === 503) throw new PackError('storage_not_configured');
  throw new PackError('unknown', `${res.status} ${code || json?.message || ''}`.trim());
}

export async function fetchCatalog(routeId: string): Promise<CatalogEntry[]> {
  return (await post('/rest/v1/rpc/offline_pack_catalog', { p_route_id: routeId })) as CatalogEntry[];
}

export async function requestSignedUrl(packId: string): Promise<SignedPack> {
  return (await post('/functions/v1/offline-pack-url', { pack_id: packId })) as SignedPack;
}
