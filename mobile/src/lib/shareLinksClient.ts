// The share-link calls with the real Supabase client and the real "are we offline" check (see shareLinks.ts).
import { supabase } from './supabase';
import { assertOnline, isOfflineError } from './net';
import { createShareLinks } from './shareLinks';

export const shareLinks = createShareLinks(
  { rpc: (fn, args) => supabase.rpc(fn as never, args as never) as unknown as PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> },
  { assertOnline, isOffline: isOfflineError },
);
