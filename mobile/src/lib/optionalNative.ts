import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Does the installed app contain the native part of an Expo package?
 *
 * An app or dev client that was made before a package was added does not have its native part. Importing the package
 * there throws while the package is being evaluated. A `try { require('expo-x') } catch {}` does NOT help once the app has
 * started: Metro loads a module that is first required later through a guard that reports the error as FATAL and returns
 * nothing (a red screen in development, a crash in a release build) instead of throwing into the try/catch. So ask first,
 * and require the package only when its native part is there:
 *
 *     if (!hasNativeModule(NativeName.clipboard)) return fallback();
 *     const Clipboard = require('expo-clipboard');
 *
 * On the web the Expo packages ship their own JavaScript, so there is nothing to ask and the answer is yes.
 * Add a name here when another dynamic `require` of a package with a native part is added; src/lib/__tests__/optionalNative.test.ts
 * fails for a require that is not guarded.
 */
export const NativeName = {
  updates: 'ExpoUpdates',
  clipboard: 'ExpoClipboard',
  video: 'ExpoVideo',
  imagePicker: 'ExponentImagePicker',
  location: 'ExpoLocation',
  appleAuthentication: 'ExpoAppleAuthentication',
} as const;

export function hasNativeModule(name: string): boolean {
  if (Platform.OS === 'web') return true;
  try {
    return requireOptionalNativeModule(name) != null;
  } catch {
    return false;
  }
}
