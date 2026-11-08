import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { copyText } from '@/lib/clipboard';
import { NativeName, hasNativeModule } from '@/lib/optionalNative';
import { radius, role, shadowStyle } from '@/theme';
import { bookmarkLabel } from '../BookmarkToggle';
import {
  ACTION_GAP, ACTION_ICON, ACTION_LABEL, ACTION_LABEL_LINE, ACTION_MIN_HEIGHT, ACTION_MIN_WIDTH, BAR_BOTTOM, BAR_HEADER, BAR_PAD_X, BAR_PAD_Y, BAR_ROW_GAP, BAR_SIDE, PLACE_LINE, PLACE_SIZE,
} from './actionBar';
import { COPIED, COPIED_MS, chosenAnnouncement, verseShareText } from './verseActions';

type ButtonProps = { icon: IconName; label: string; spoken: string; filled?: boolean; disabled?: boolean; onPress: () => void };

/**
 * One action: a glyph (30) over a short word (Inter SemiBold 16), at least 88 wide and 68 high, a third of the bar wide. The word never changes with the state
 * (it would not fit 88 at 16: "Bookmarked"); a verse that is bookmarked has its glyph filled and its button tinted, and a screen reader says "Remove bookmark".
 * The word may shrink a little when the phone's own text is large, never under 16.
 */
function ActionButton({ icon, label, spoken, filled, disabled, onPress }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minWidth: ACTION_MIN_WIDTH, minHeight: ACTION_MIN_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.md, backgroundColor: pressed || filled ? role.sunken : 'transparent', opacity: disabled ? 0.5 : 1 })}
    >
      <Icon name={icon} color={role.action} size={ACTION_ICON} filled={filled} />
      <AppText variant="label" maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.77} style={{ fontSize: ACTION_LABEL, lineHeight: ACTION_LABEL_LINE }}>{label}</AppText>
    </Pressable>
  );
}

/**
 * The bar that comes up when a verse is chosen, over the bottom of the reader (it floats above the safe area; the reader makes room under the last words
 * while it is there, and scrolls a verse that is under it into view, Reader.tsx). One verse at a time. The first row says which verse it is, in JetBrains Mono
 * ("Psalm 121:3", 17, a polite live region, and the screen reader is told when it changes), and has the close button; the second row has the actions: Bookmark
 * (into the Library's bookmarks, under the place of the verse, which says nothing about the translation), Copy (only on a phone that has the clipboard module:
 * it is asked for first, lib/optionalNative.ts; without it the button is not drawn) and Share (the phone's own share sheet, from React Native). What is copied and
 * shared is the verse, then where it is and "(World English Bible)". The sizes are in actionBar.ts: a glyph of 30, a word of 16, every action at least 88 by 68.
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
      style={{ position: 'absolute', left: BAR_SIDE, right: BAR_SIDE, bottom: insets.bottom + BAR_BOTTOM, paddingVertical: BAR_PAD_Y, paddingHorizontal: BAR_PAD_X, gap: BAR_ROW_GAP, borderRadius: radius.lg, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, ...shadowStyle('lg') }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: BAR_HEADER, paddingLeft: 10 }}>
        <AppText variant="mono" maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite" accessibilityLabel={`${place} selected`} numberOfLines={1} color={role.accentText} style={{ flex: 1, fontSize: PLACE_SIZE, lineHeight: PLACE_LINE }}>{place}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Close the verse actions" onPress={onClose} style={{ width: BAR_HEADER, height: BAR_HEADER, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={role.muted} size={24} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: ACTION_GAP }}>
        <ActionButton icon="bookmark" filled={bookmarked} label="Bookmark" spoken={bookmarkLabel(bookmarked, place)} disabled={!canBookmark} onPress={onBookmark} />
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
