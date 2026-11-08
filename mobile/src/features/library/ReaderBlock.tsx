import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { c, radius, role } from '@/theme';
import type { Block } from './books';
import { BlockBody, hasLink } from './BookText';
import { KeptMark } from './BookmarkToggle';

/** The margin of the page, where the marks of notes and bookmarks sit. The reading column is this much narrower than the screen. */
export const GUTTER = 28;

/** What a screen reader says for a block that can be worked on: what it carries, then its words. */
export const blockLabel = (text: string, notes: number, bookmarked: boolean): string =>
  `${bookmarked ? 'Bookmarked. ' : ''}${notes > 0 ? `${notes === 1 ? '1 note' : `${notes} notes`}. ` : ''}${text}`;

/**
 * One paragraph (or quote, or list) of a chapter that can carry a note or a bookmark. A tap on the words shows two buttons under them (Add a
 * note, Bookmark); a long press opens the note sheet at once. In the margin on the right a side mark shows what the paragraph carries: a
 * small pen for a note, which a tap opens, and a small bookmark. The mark of a note is a button of its own; the bookmark mark is only a
 * picture (the screen reader hears "Bookmarked" in front of the paragraph). A screen reader reads the paragraph (as a button, which is what a
 * double tap on it is: it shows the two buttons, which it can then reach).
 */
export function ReaderBlock({ block, italicReady, text, notes, bookmarked, active, onToggle, onNote, onBookmark }: {
  block: Block;
  italicReady: boolean;
  /** The words of the block, for the screen reader. */
  text: string;
  /** How many notes the paragraph has. */
  notes: number;
  bookmarked: boolean;
  /** The two buttons are shown under it. */
  active: boolean;
  onToggle: () => void;
  /** Opens the note sheet on this paragraph (new, or the notes it has). */
  onNote: () => void;
  onBookmark: () => void;
}) {
  const label = blockLabel(text, notes, bookmarked);
  // A paragraph with a link in it is not one single thing for a screen reader, or its links could not be reached.
  const whole = !hasLink(block);
  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={[{ flex: 1, minWidth: 0 }, active && { backgroundColor: role.sunken, borderRadius: radius.sm, marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 6, marginVertical: -6 }]}>
        <Pressable
          accessible={whole}
          accessibilityRole={whole ? 'button' : undefined}
          accessibilityLabel={whole ? label : undefined}
          accessibilityHint={whole ? 'Shows Add a note and Bookmark for this paragraph' : undefined}
          accessibilityActions={[{ name: 'note', label: 'Add a note' }, { name: 'bookmark', label: bookmarked ? 'Remove bookmark' : 'Bookmark this paragraph' }]}
          onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'note') onNote(); else if (e.nativeEvent.actionName === 'bookmark') onBookmark(); }}
          onPress={onToggle}
          onLongPress={onNote}
          delayLongPress={400}
        >
          <BlockBody block={block} italicReady={italicReady} />
        </Pressable>
        {active && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <Action icon="pen" label={notes > 0 ? `Notes (${notes})` : 'Add a note'} hint={notes > 0 ? 'Opens the notes on this paragraph' : 'Writes a note beside this paragraph'} onPress={onNote} />
            <Action icon="bookmark" filled={bookmarked} label={bookmarked ? 'Remove bookmark' : 'Bookmark'} hint={bookmarked ? 'Takes the bookmark off this paragraph' : 'Keeps this paragraph in your bookmarks'} onPress={onBookmark} />
          </View>
        )}
      </View>
      <View style={{ width: GUTTER, alignItems: 'flex-end', paddingTop: 3, gap: 8 }}>
        {notes > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={notes === 1 ? 'Note on this paragraph' : `${notes} notes on this paragraph`}
            accessibilityHint="Opens the note"
            onPress={onNote}
            hitSlop={{ top: 10, bottom: 10, left: 12, right: 6 }}
            style={{ width: 24, height: 24, borderRadius: radius.pill, backgroundColor: c.goldWash, borderWidth: 1, borderColor: c.goldSoft, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="pen" color={c.goldInk} size={13} />
          </Pressable>
        )}
        {bookmarked && (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 24, alignItems: 'center' }}>
            <KeptMark size={17} />
          </View>
        )}
      </View>
    </View>
  );
}

function Action({ icon, label, hint, filled, onPress }: { icon: 'pen' | 'bookmark'; label: string; hint: string; filled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: role.border, backgroundColor: role.surface, opacity: pressed ? 0.8 : 1 })}
    >
      <Icon name={icon} color={role.text} size={20} filled={filled} />
      <AppText variant="label">{label}</AppText>
    </Pressable>
  );
}
