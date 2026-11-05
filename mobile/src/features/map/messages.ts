import type { PackErrorCode } from './packs/api';

export const packErrorText: Record<PackErrorCode, string> = {
  not_configured: 'Downloads need the backend keys in .env (developer setting).',
  not_signed_in: 'Sign in to download offline maps.',
  subscription_required: 'Offline maps are part of Pilgrim Plus.',
  pack_not_found: 'This stage map is not published yet.',
  not_built_yet: 'This stage map is not published yet.',
  storage_not_configured: 'Map storage is not ready on the server yet. Try again later.',
  offline: 'No connection. Connect to Wi-Fi to download.',
  no_space: 'Not enough free space on this phone.',
  checksum_mismatch: 'The download was damaged. Please try again.',
  cancelled: 'Download cancelled.',
  unknown: 'Download failed. Please try again.',
};
