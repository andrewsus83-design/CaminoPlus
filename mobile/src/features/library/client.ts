// The real Supabase client and the real "are we offline" checks, handed to the reads of savedPosts.ts (which has no React Native
// imports, so that node can test it).
import { supabase } from '../../lib/supabase';
import { assertOnline, errorMessage, isOfflineError } from '../../lib/net';
import { makeSavedPostsApi, type SavedPostsClient } from './savedPosts';

export const savedPostsApi = makeSavedPostsApi(supabase as unknown as SavedPostsClient, { assertOnline, isOffline: isOfflineError, message: errorMessage });
