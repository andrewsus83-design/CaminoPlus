import { useFonts } from 'expo-font';
import { Inter_400Regular_Italic, Inter_600SemiBold_Italic } from '@expo-google-fonts/inter';

// The two italic faces of Inter. They are part of the font package the app already bundles and are loaded the first time a screen that needs
// them is read (until then italic falls back to the system's slant, so text is never held up by a font). The diary's RichText loads the same two.
export const ITALIC_FACE = 'Inter_400Regular_Italic';
export const BOLD_ITALIC_FACE = 'Inter_600SemiBold_Italic';

/** True once the italic faces are loaded. */
export function useItalicFaces(): boolean {
  const [loaded] = useFonts({ Inter_400Regular_Italic, Inter_600SemiBold_Italic });
  return loaded;
}
