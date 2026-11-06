import { Share } from 'react-native';

/** Copy text to the clipboard. Returns true when it was copied.
 *  expo-clipboard is a native module: until the dev build includes it we fall back to the
 *  share sheet (the user can still pick "Copy" there) and return false. */
export async function copyText(text: string): Promise<boolean> {
  try {
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
