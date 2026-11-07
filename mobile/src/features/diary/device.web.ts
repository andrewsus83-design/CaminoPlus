// The diary on the web (the browser version of the app, which is what the smoke test opens): there are no files of the phone, no
// picker, no position. Everything answers "not here", and the screens say so in one line instead of showing buttons that do
// nothing. Nothing is imported, so nothing can throw.
import type { Device } from './deviceTypes';

export const device: Device = {
  canPickMedia: () => false,
  canFindPlace: () => false,
  canPlayVideo: () => false,
  pickMedia: () => Promise.resolve({ status: 'unavailable' }),
  placeAccess: () => Promise.resolve('unsupported'),
  findPlace: () => Promise.resolve({ status: 'unsupported' }),
  openMaps: () => Promise.resolve(false),
  openSettings: () => Promise.resolve(false),
  fileUri: () => null,
  video: () => null,
};
