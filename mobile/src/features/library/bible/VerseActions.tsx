import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { copyText } from '@/lib/clipboard';
import { NativeName, hasNativeModule } from '@/lib/optionalNative';
import { radius, role, shadowStyle } from '@/theme';
import { bookmarkLabel } from '../BookmarkToggle';
import { COPIED, COPIED_MS, chosenAnnouncement, verseShareText } from './verseActions';

type ButtonProps = { icon: IconName; label: string; spoken: string; filled?: boolean; disabled?: boolean; onPress: () => void };

/** One action: a glyph over a short word, at least 56 high, a third of the bar wide. */
function ActionButton({ icon, label, spoken, filled, disabled, onPress }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.sm, backgroundColor: pressed ? role.sunken : 'transparent', opacity: disabled ? 0.5 : 1 })}
    >
      <Icon name={icon} color={role.action} size={22} filled={filled} />
      <AppText variant="label" maxFontSizeMultiplier={1.3} style={{ fontSize: 13, lineHeight: 17 }}>{label}</AppText>
    </Pressable>
  );
}

/**
 * The bar that comes up when a verse is chosen, over the bottom of the reader (it floats above the safe area; the reader makes room under the last words
 * while it is there). One verse at a time. The first row says which verse it is, in JetBrains Mono ("Psalm 121:3", a polite live region, and the screen reader is
 * told when it changes), and has the close button; the second row has the actions: Bookmark (into the Library's bookmarks, under the place of the verse, which
 * says nothing about the translation), Copy (only on a phone that has the clipboard module: it is asked for first, lib/optionalNative.ts; without it the button is
 * not drawn) and Share (the phone's own share sheet, from React Native). What is copied and shared is the verse, then where it is and "(World English Bible)".
 * All three are at least 56 high and a third of the bar wide.
 */
export function VerseActions({ place, words, bookmarked, canBookmark, onBookmark, onClose }: { place: string; words: string; bookmarked: boolean; canBookmark: boolean; onBookmark: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const canCopy = hasNativeModule(NativeName.clipboard);
  const text = verseShareText(place, words);

  // a screen reader hears which verse was chosen (the announcement is also the name of the live region below, so it is said once on the web too)
  useEffect(() => { AccessibilityInfo.announceForAccessibility?.(chosenAnnouncement(place)); }, [place]);
  // "Copied" goes away by itself, and a new verse starts again
  useEffect(() => { setCopied(false); }, [place]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={`Actions for ${place}`}
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, paddingTop: 6, paddingBottom: 6, paddingHorizontal: 8, borderRadius: radius.lg, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, ...shadowStyle('lg') }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: 8 }}>
        <AppText variant="mono" accessibilityLiveRegion="polite" accessibilityLabel={`${place} selected`} numberOfLines={1} color={role.accentText} style={{ flex: 1, fontSize: 16, lineHeight: 24 }}>{place}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Close the verse actions" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={role.muted} size={22} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <ActionButton icon="bookmark" filled={bookmarked} label={bookmarked ? 'Bookmarked' : 'Bookmark'} spoken={bookmarkLabel(bookmarked, place)} disabled={!canBookmark} onPress={onBookmark} />
        {canCopy && (
          <ActionButton
            icon="copy"
            label={copied ? COPIED : 'Copy'}
            spoken={copied ? `${COPIED}: ${place}` : `Copy: ${place}`}
            onPress={() => { void copyText(text).then((ok) => { if (ok) setCopied(true); }); }}
          />
        )}
        <ActionButton icon="share" label="Share" spoken={`Share: ${place}`} onPress={() => { void Share.share({ message: text }).catch(() => {}); }} />
      </View>
    </View>
  );
}
