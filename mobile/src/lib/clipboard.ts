import { Share } from 'react-native';
import { NativeName, hasNativeModule } from './optionalNative';

/** Copy text to the clipboard. Returns true when it was copied.
 *  expo-clipboard is a native module: until the dev build includes it we fall back to the
 *  share sheet (the user can still pick "Copy" there) and return false. The native part is asked for first:
 *  requiring the package without it is a fatal error that no try/catch catches (see optionalNative.ts). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!hasNativeModule(NativeName.clipboard)) throw new Error('missing');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard: typeof import('expo-clipboard') = require('expo-clipboard');
    if (!Clipboard.setStringAsync) throw new Error('missing');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    await Share.share({ message: text }).catch(() => {});
    return false;
  }
}
