// The plan numbers of CaminoPlus, in ONE place. Every screen that names a size or a price takes it from here.
//
//   Free           500 MB of cloud storage
//   Pilgrim Plus   $12 a year: 10 GB, offline maps, higher resolution photos and video
//   Extra storage  +10 GB for $5 a year: Pilgrim Plus only, ONE at a time (it does not stack)
//
// The server enforces the storage numbers (supabase/migrations/20261114030000_plan_storage.sql: billing_products,
// app_config free_storage_bytes, private.storage_quota_bytes). tools/tests/test_plan_numbers.py fails when that file, the
// seed, this file, the website (tools/build_web.py) and the design page (design/index.html) disagree, or when a comparison
// ("more than", "best", "unlimited") stands next to a plan claim.
//
// Bytes are DECIMAL (1 GB = 1,000,000,000 bytes): formatBytes (lib/format.ts) divides by 1000, so the screens print
// "500 MB" and "10 GB", the words of the marketing. A binary 0.5 GiB would print "537 MB" and 10 GiB "11 GB".
import { formatBytes } from './format';

export const FREE_STORAGE_BYTES = 500_000_000;
export const PLUS_STORAGE_BYTES = 10_000_000_000;
export const ADDON_STORAGE_BYTES = 10_000_000_000;

export const PLUS_PRICE_USD = 12;
export const ADDON_PRICE_USD = 5;

/** What the screens say: "500 MB" and "10 GB". */
export const FREE_STORAGE_LABEL = formatBytes(FREE_STORAGE_BYTES);
export const PLUS_STORAGE_LABEL = formatBytes(PLUS_STORAGE_BYTES);
export const ADDON_STORAGE_LABEL = formatBytes(ADDON_STORAGE_BYTES);

export const PLUS_PRICE_LABEL = `$${PLUS_PRICE_USD} / year`;
export const ADDON_PRICE_LABEL = `$${ADDON_PRICE_USD} / year`;

// Photo and video limits in the words of the screens. They mirror the rules the upload code enforces (src/lib/media/limits.ts on
// the media branch). Photos: the same on every phone. Video: only what holds on every phone, how long and how big; no word about
// 720p or 1080p, because on Android a clip goes up as it was recorded. 4K video is planned, not built.
export const FREE_PHOTO_PX = 1280;
export const PLUS_PHOTO_PX = 3840;
export const VIDEO_SECONDS = 60;
export const FREE_VIDEO_MB = 25;
export const PLUS_VIDEO_MB = 45;

const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The owner's headline for what Pilgrim Plus adds to photos and video. */
export const MEDIA_HEADLINE = 'Higher resolution photos and video';
export const FREE_MEDIA_FACTS = `Photos up to ${withCommas(FREE_PHOTO_PX)} px on the long side. Video up to ${VIDEO_SECONDS} seconds, up to ${FREE_VIDEO_MB} MB.`;
export const PLUS_MEDIA_FACTS = `Photos up to ${withCommas(PLUS_PHOTO_PX)} px on the long side. Video up to ${VIDEO_SECONDS} seconds, up to ${PLUS_VIDEO_MB} MB. 4K video is planned.`;

/** Settings, under the storage meter, when the account has no cloud storage at all (a quota of 0: switched off on the server). */
export const NO_CLOUD_STORAGE_TEXT = 'Cloud storage is switched off for now. Photos and videos cannot be saved yet.';
