// The real Supabase client and the real "are we offline" checks, handed to the calls of api.ts (which has no React Native
// imports, so that node can test it).
import { supabase } from '../../lib/supabase';
import { assertOnline, errorMessage, isOfflineError } from '../../lib/net';
import { makePlacesApi, type PlacesClient } from './api';

export const placesApi = makePlacesApi(supabase as unknown as PlacesClient, { assertOnline, isOffline: isOfflineError, message: errorMessage });
