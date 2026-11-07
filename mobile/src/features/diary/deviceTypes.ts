// What the diary asks of the phone beyond its storage: choosing photos and videos, reading the position, opening the maps app,
// playing a video. device.ts is the phone's (native modules, each asked for first), device.web.ts the web's (nothing). No React,
// no React Native here: only the shapes both of them answer in, so the screens do not care which one they have.
import type { PickedAsset } from './media';
import type { DiaryPlace, PlaceFailure } from './place';

export type PickResult =
  | { status: 'picked'; assets: PickedAsset[] }
  | { status: 'cancelled' }
  /** This build of the app has no picker (an older app), or this is the web. */
  | { status: 'unavailable' }
  | { status: 'error' };

export type PlaceAccess = 'granted' | 'ask' | 'blocked' | 'unsupported';
export type PlaceTry = { status: 'ok'; place: DiaryPlace } | { status: PlaceFailure };

export type Device = {
  /** The photo and video picker is there. */
  canPickMedia(): boolean;
  /** The position can be read. */
  canFindPlace(): boolean;
  /** A video can be played. */
  canPlayVideo(): boolean;
  /** Opens the phone's own picker for up to `limit` photos and videos. Never throws. */
  pickMedia(limit: number): Promise<PickResult>;
  /** Whether the position may be read now, would be asked for, is blocked for good, or cannot be asked at all. Never asks. */
  placeAccess(): Promise<PlaceAccess>;
  /** Asks for the permission when it is allowed to, reads the position once and tries for a name. Never throws, never asks twice. */
  findPlace(): Promise<PlaceTry>;
  /** Hands the place to the phone's maps app. True when something took it. */
  openMaps(place: DiaryPlace): Promise<boolean>;
  /** Opens the phone's settings for this app. True when it opened. */
  openSettings(): Promise<boolean>;
  /** The address a file of the diary is shown from, or null when it is not on this phone. */
  fileUri(uid: string, name: string): string | null;
  /** The video module (useVideoPlayer, VideoView) when the app has it, else null. */
  video(): typeof import('expo-video') | null;
};
