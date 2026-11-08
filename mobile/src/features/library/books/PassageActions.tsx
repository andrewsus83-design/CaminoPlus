import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, Share, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { copyText } from '@/lib/clipboard';
import { NativeName, hasNativeModule } from '@/lib/optionalNative';
import { radius, role, shadowStyle } from '@/theme';
import { ACTION_GAP, ACTION_ICON, ACTION_LABEL, ACTION_LABEL_LINE, ACTION_MIN_HEIGHT, ACTION_MIN_WIDTH, BAR_HEADER, BAR_PAD_X, BAR_PAD_Y, BAR_ROW_GAP, BAR_SIDE, PLACE_LINE, PLACE_SIZE } from '../bible/actionBar';
import { COPIED } from '../bible/verseActions';
import { bookmarkLabel } from '../BookmarkToggle';
import { chosenAnnouncement } from './passages';

type ButtonProps = { icon: IconName; label: string; spoken: string; filled?: boolean; disabled?: boolean; compact?: boolean; onPress: () => void };

/**
 * One action, the size of the Bible's (actionBar.ts): a glyph (30) over a short word (Inter SemiBold 16), at least 88 wide and 68 high, a third of the bar wide. The
 * word never changes with the state; a passage that is bookmarked has its glyph filled and its button tinted, and a screen reader says "Remove bookmark". With four
 * actions (Copy is there) they share the bar and are as wide as 320 allows, a little under 88: the word shrinks to fit, never under 12.
 */
function ActionButton({ icon, label, spoken, filled, disabled, compact, onPress }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minWidth: compact ? 0 : ACTION_MIN_WIDTH, minHeight: ACTION_MIN_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.md, backgroundColor: pressed || filled ? role.sunken : 'transparent', opacity: disabled ? 0.5 : 1 })}
    >
      <Icon name={icon} color={role.action} size={ACTION_ICON} filled={filled} />
      <AppText variant="label" maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.77} style={{ fontSize: ACTION_LABEL, lineHeight: ACTION_LABEL_LINE }}>{label}</AppText>
    </Pressable>
  );
}

/**
 * The bar that comes up when a passage is chosen, as the Bible's does for a verse. It sits between the chapter and the bar at the bottom of the reader (the chapter
 * has a little less room while it is there, so nothing is hidden behind it). One passage at a time. The first row says which passage it is, in JetBrains Mono
 * ("Chapter III, passage 4", a polite live region, and the screen reader is told when it changes), and has the close button; the second row has the actions:
 * Bookmark (into the Library's bookmarks, under the place of the passage), Note (a new note of the diary that starts with the passage as a quotation, the way a
 * reply in a chat starts with the message it answers; the person adds words and photos, and it appears in Notes), Copy (only on a phone that has the clipboard module:
 * it is asked for first, lib/optionalNative.ts; without it the button is not drawn) and Share (the phone's own share sheet, from React Native). What is copied and shared is the passage,
 * then where it is and which book. The sizes are the Bible's (actionBar.ts).
 */
export function PassageActions({ label, text, bookmarked, canBookmark, canNote, onBookmark, onNote, onClose }: { label: string; text: string; bookmarked: boolean; canBookmark: boolean; canNote: boolean; onBookmark: () => void; onNote: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const canCopy = hasNativeModule(NativeName.clipboard);
  const compact = canCopy;

  // a screen reader hears which passage was chosen (the announcement is also the name of the live region below, so it is said once on the web too)
  useEffect(() => { AccessibilityInfo.announceForAccessibility?.(chosenAnnouncement(label)); }, [label]);
  // "Copied" stays on the button while this passage is chosen (no timer: the only timer of the Books screens waits to save a place), and a new passage starts again
  useEffect(() => { setCopied(false); }, [label]);

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={`Actions for ${label}`}
      style={{ marginHorizontal: BAR_SIDE, marginBottom: 8, paddingVertical: BAR_PAD_Y, paddingHorizontal: BAR_PAD_X, gap: BAR_ROW_GAP, borderRadius: radius.lg, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, ...shadowStyle('lg') }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: BAR_HEADER, paddingLeft: 10 }}>
        <AppText variant="mono" maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite" accessibilityLabel={`${label} selected`} numberOfLines={1} color={role.accentText} style={{ flex: 1, fontSize: PLACE_SIZE, lineHeight: PLACE_LINE }}>{label}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Close the passage actions" onPress={onClose} style={{ width: BAR_HEADER, height: BAR_HEADER, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={role.muted} size={24} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: ACTION_GAP }}>
        <ActionButton icon="bookmark" filled={bookmarked} label="Bookmark" spoken={bookmarkLabel(bookmarked, label)} disabled={!canBookmark} compact={compact} onPress={onBookmark} />
        <ActionButton icon="pen" label="Note" spoken={`Write a note: ${label}`} disabled={!canNote} compact={compact} onPress={onNote} />
        {canCopy && (
          <ActionButton
            icon="copy"
            label={copied ? COPIED : 'Copy'}
            spoken={copied ? `${COPIED}: ${label}` : `Copy: ${label}`}
            compact={compact}
            onPress={() => { void copyText(text).then((ok) => { if (ok) setCopied(true); }); }}
          />
        )}
        <ActionButton icon="share" label="Share" spoken={`Share: ${label}`} compact={compact} onPress={() => { void Share.share({ message: text }).catch(() => {}); }} />
      </View>
    </View>
  );
}
