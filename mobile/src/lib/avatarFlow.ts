// Saving a new profile picture, in the order that never loses one. Pure (the storage and profile calls are handed in),
// checked by src/lib/__tests__/media.test.ts. avatar.ts hands in the real calls.
//
// 1. Upload the new picture as <user id>/avatar.jpg (every photo is a JPEG after prepareImage).
// 2. Point the profile at it.
// 3. Only then delete a picture left from before under another name (builds before 1.2.0 could save avatar.png).
// If step 2 fails, the old picture is still there and the profile still points at it.

export type AvatarDeps = {
  upload: (path: string, uri: string, contentType: string) => Promise<unknown>;
  publicUrl: (path: string) => string;
  updateProfile: (avatarUrl: string) => Promise<unknown>;
  deleteOld: (paths: string[]) => Promise<unknown> | unknown;
  now: () => number;
};

/** Older names of the picture that a new one replaces. */
export const OLD_AVATAR_NAMES = ['avatar.png', 'avatar.webp', 'avatar.heic'] as const;

export async function storeAvatar(userId: string, photoUri: string, d: AvatarDeps): Promise<string> {
  const path = `${userId}/avatar.jpg`; // fixed name: a new photo replaces the old one instead of piling up in storage
  await d.upload(path, photoUri, 'image/jpeg');
  const url = `${d.publicUrl(path)}?v=${d.now()}`; // busts the CDN/image cache
  await d.updateProfile(url);
  try {
    await d.deleteOld(OLD_AVATAR_NAMES.map((n) => `${userId}/${n}`));
  } catch { /* an old file left behind only costs a little storage */ }
  return url;
}
