import { useMemo } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { describeBuild, type BuildInput, type BuildStamp, type BuildText } from './buildInfo';

type UpdatesModule = typeof import('expo-updates');

/**
 * expo-updates is optional at run time. An installed app or dev client that was made before it was added does not
 * contain its native part, and importing it there throws; so it is loaded only here, and a failure means "no updates".
 * Updates exist only in the installed iOS and Android apps. On the web, expo-updates ships a stand-in that claims to be
 * enabled and never finds anything, so the web counts as "no updates" too.
 */
function loadUpdates(): UpdatesModule | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-updates') as UpdatesModule;
  } catch {
    return null;
  }
}

/** What this phone is running right now. */
export function readBuildInput(): BuildInput {
  const extra = (Constants.expoConfig?.extra ?? {}) as { build?: Partial<BuildStamp> };
  let updatesEnabled = false;
  let embedded = true;
  let updateId: string | null = null;
  let channel: string | null = null;
  try {
    const U = loadUpdates();
    updatesEnabled = !!U?.isEnabled;
    embedded = U?.isEmbeddedLaunch ?? true;
    updateId = U?.updateId ?? null;
    channel = U?.channel ?? null;
  } catch {
    // the native part is missing: no updates in this build
  }
  return { version: Constants.expoConfig?.version ?? '?', stamp: extra.build ?? null, updatesEnabled, embedded, updateId, channel, platform: Platform.OS };
}

export function useBuild(): { text: BuildText; canCheckForUpdates: boolean } {
  return useMemo(() => {
    const input = readBuildInput();
    return { text: describeBuild(input), canCheckForUpdates: input.updatesEnabled };
  }, []);
}

export type UpdateResult = { kind: 'off' } | { kind: 'current' } | { kind: 'reloading' } | { kind: 'error'; message: string };

/** Ask for a newer update, download it and restart into it. Nothing happens unless this build has updates switched on. */
export async function checkAndApplyUpdate(): Promise<UpdateResult> {
  const U = loadUpdates();
  if (!U || !U.isEnabled) return { kind: 'off' };
  try {
    const found = await U.checkForUpdateAsync();
    if (!found.isAvailable) return { kind: 'current' };
    await U.fetchUpdateAsync();
    await U.reloadAsync();
    return { kind: 'reloading' };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
