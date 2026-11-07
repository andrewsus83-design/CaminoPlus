// What the diary asks of the phone beyond its storage: the photo and video picker, the position, the maps app, video playback.
//
// Every one of them is a native module that an older installed app may not have, and in a development build Metro shows a module
// whose evaluation throws as a fatal red screen even when the require sits in a try/catch (it did for expo-updates on Settings).
// So each module is first asked for by its native name (hasNativeModule, src/lib/optionalNative.ts, which asks
// requireOptionalNativeModule), and only when the phone has it is the package required; when it is missing the matching button is
// not drawn and the screen says, in one line, that it needs the newest app. Nothing is imported at the top of this file except
// React Native and the helper. On the web (device.web.ts) none of it exists.
//
// Nothing here sends anything anywhere. The one thing that can reach a server is outside this app's code: the phone's own map
// service, asked by expo-location's reverse geocoding for the name of a place (Apple Maps on an iPhone, Google on Android), which is
// why the screen says so before the position is read.
import { Linking, Platform } from 'react-native';
import { NativeName, hasNativeModule } from '@/lib/optionalNative';
import { mediaUri } from './files';
import type { PickedAsset } from './media';
import { mapsUrl, nameFromAddress, placeFromFix, type PlaceFailure } from './place';
import type { Device, PickResult, PlaceAccess, PlaceTry } from './deviceTypes';

type Picker = typeof import('expo-image-picker');
type Loc = typeof import('expo-location');
type Vid = typeof import('expo-video');

let picker: Picker | null | undefined;
let location: Loc | null | undefined;
let video: Vid | null | undefined;

function loadPicker(): Picker | null {
  if (picker !== undefined) return picker;
  picker = null;
  if (Platform.OS === 'web' || !hasNativeModule(NativeName.imagePicker)) return picker;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-image-picker') as Picker;
    if (typeof m.launchImageLibraryAsync === 'function') picker = m;
  } catch {
    picker = null;
  }
  return picker;
}

function loadLocation(): Loc | null {
  if (location !== undefined) return location;
  location = null;
  if (Platform.OS === 'web' || !hasNativeModule(NativeName.location)) return location;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-location') as Loc;
    if (typeof m.getCurrentPositionAsync === 'function') location = m;
  } catch {
    location = null;
  }
  return location;
}

function loadVideo(): Vid | null {
  if (video !== undefined) return video;
  video = null;
  if (Platform.OS === 'web' || !hasNativeModule(NativeName.video)) return video;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-video') as Vid;
    if (typeof m.useVideoPlayer === 'function') video = m;
  } catch {
    video = null;
  }
  return video;
}

/** How long the phone gets to find its position, and to find a name for it. A late answer is no answer. */
const FIX_MS = 15_000;
const NAME_MS = 6_000;
/** A position the phone already had is good enough when it is this recent (the pilgrim has not gone far). */
const LAST_KNOWN_MS = 10 * 60 * 1000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

async function pickMedia(limit: number): Promise<PickResult> {
  const P = loadPicker();
  if (!P) return { status: 'unavailable' };
  try {
    // No permission is asked for: the system's own picker hands over only what the person chooses (iOS and Android 13 or newer).
    const res = await P.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, Math.floor(limit)),
      orderedSelection: true,
      quality: 0.85,
      exif: false,
      base64: false,
    });
    if (res.canceled || !res.assets || res.assets.length === 0) return { status: 'cancelled' };
    const assets: PickedAsset[] = [];
    for (const a of res.assets) {
      if (!a || typeof a.uri !== 'string' || a.uri === '' || a.type === 'livePhoto' || a.type === 'pairedVideo') continue;
      const kind = a.type === 'video' || (typeof a.mimeType === 'string' && a.mimeType.startsWith('video/')) ? 'video' : 'image';
      assets.push({
        uri: a.uri, kind, fileName: a.fileName ?? null, mimeType: a.mimeType ?? null,
        width: a.width > 0 ? a.width : null, height: a.height > 0 ? a.height : null,
        durationMs: kind === 'video' && typeof a.duration === 'number' ? a.duration : null,
        bytes: typeof a.fileSize === 'number' ? a.fileSize : null,
      });
    }
    return assets.length > 0 ? { status: 'picked', assets } : { status: 'cancelled' };
  } catch {
    return { status: 'error' };
  }
}

async function placeAccess(): Promise<PlaceAccess> {
  const L = loadLocation();
  if (!L) return 'unsupported';
  try {
    const perm = await L.getForegroundPermissionsAsync();
    if (perm.granted) return 'granted';
    return perm.canAskAgain === false ? 'blocked' : 'ask';
  } catch {
    return 'unsupported';
  }
}

async function findPlace(): Promise<PlaceTry> {
  const L = loadLocation();
  if (!L) return { status: 'unsupported' };
  // The foreground permission only, asked once per tap: when the phone will not ask again the answer is "blocked" and the screen
  // says how to open the settings, so there is never a loop of prompts.
  try {
    let perm = await L.getForegroundPermissionsAsync();
    if (!perm.granted) {
      if (perm.canAskAgain === false) return { status: 'blocked' };
      perm = await L.requestForegroundPermissionsAsync();
      if (!perm.granted) return { status: perm.canAskAgain === false ? 'blocked' : 'denied' };
    }
  } catch {
    return { status: 'unavailable' };
  }

  let fix: { lat: number; lon: number; at: number } | null = null;
  let failure: PlaceFailure = 'unavailable';
  try {
    if (!(await L.hasServicesEnabledAsync())) return { status: 'services-off' };
    const p = await withTimeout(L.getCurrentPositionAsync({ accuracy: L.Accuracy.High }), FIX_MS);
    fix = { lat: p.coords.latitude, lon: p.coords.longitude, at: p.timestamp };
  } catch (e) {
    failure = e instanceof Error && e.message === 'timeout' ? 'timeout' : 'unavailable';
  }
  if (!fix) {
    try {
      const last = await L.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MS });
      if (last) fix = { lat: last.coords.latitude, lon: last.coords.longitude, at: last.timestamp };
    } catch {
      /* no position the phone already had */
    }
  }
  if (!fix) return { status: failure };

  // A name is a bonus. Offline, or when the service says nothing, the place keeps its coordinates and the pilgrim can type a name.
  let name: string | undefined;
  try {
    const found = await withTimeout(L.reverseGeocodeAsync({ latitude: fix.lat, longitude: fix.lon }), NAME_MS);
    name = nameFromAddress(found[0]);
  } catch {
    name = undefined;
  }
  const place = placeFromFix(fix, name);
  return place ? { status: 'ok', place } : { status: 'unavailable' };
}

export const device: Device = {
  canPickMedia: () => loadPicker() !== null,
  canFindPlace: () => loadLocation() !== null,
  canPlayVideo: () => loadVideo() !== null,
  pickMedia,
  placeAccess,
  findPlace,
  async openMaps(place) {
    try {
      await Linking.openURL(mapsUrl(place, Platform.OS));
      return true;
    } catch {
      return false;
    }
  },
  async openSettings() {
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
  },
  fileUri: (uid, name) => mediaUri(uid, name),
  video: () => loadVideo(),
};
