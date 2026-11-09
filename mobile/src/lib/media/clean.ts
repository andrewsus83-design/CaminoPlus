// The last step before bytes go to cloud storage (mediaStorage.upload): what the file really is is read from its first
// bytes (never trusted from the name or the type the picker gave), the location is removed, and anything that cannot be
// sent without its location is refused. Pure, checked by src/lib/__tests__/media.test.ts.
import { isJpeg, stripJpegLocation } from './exif';
import { isIsoMedia, stripVideoLocation } from './videoLocation';
import { LOCATION_REFUSED_MESSAGE, UNSUPPORTED_TYPE_MESSAGE, UPLOAD_VIDEO_TYPES, VIDEO_LOCATION_REFUSED_MESSAGE } from './limits';

/** The file cannot go up: `message` says why, in plain words. */
export class UploadRefused extends Error {}

/** image/jpg is not a real type (and the bucket refuses it): it is image/jpeg. */
export const normaliseType = (t: string | null | undefined) => {
  const v = (t ?? '').toLowerCase().trim();
  return v === 'image/jpg' || v === 'image/pjpeg' ? 'image/jpeg' : v;
};

/**
 * The bytes to upload and their type. Photos must be JPEG by their bytes (prepareImage turns every photo into one);
 * videos must be MP4 or MOV (not a HEIF / AVIF photo in disguise). The location is removed from both (photos: a copy;
 * videos: in place); a clip that cannot be read to the end is refused. Throws UploadRefused.
 */
export function cleanForUpload(bytes: Uint8Array, contentType: string | null | undefined): { bytes: Uint8Array; contentType: string } {
  const type = normaliseType(contentType);
  if (isJpeg(bytes)) {
    if (type.startsWith('video/')) throw new UploadRefused(UNSUPPORTED_TYPE_MESSAGE);
    return { bytes: stripJpegLocation(bytes).bytes, contentType: 'image/jpeg' };
  }
  if (type.startsWith('image/') || type === '') throw new UploadRefused(type === '' ? UNSUPPORTED_TYPE_MESSAGE : LOCATION_REFUSED_MESSAGE);
  if ((UPLOAD_VIDEO_TYPES as readonly string[]).includes(type) && isIsoMedia(bytes)) {
    const v = stripVideoLocation(bytes);
    // a clip we could not read to the end may keep its place in the part we did not read: never upload it
    if (!v.complete) throw new UploadRefused(VIDEO_LOCATION_REFUSED_MESSAGE);
    return { bytes: v.bytes, contentType: type };
  }
  throw new UploadRefused(UNSUPPORTED_TYPE_MESSAGE);
}
