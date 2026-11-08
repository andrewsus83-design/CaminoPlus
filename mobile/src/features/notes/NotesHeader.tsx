import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { layout, radius, role, space } from '@/theme';
import { NOTES_PRIVACY, WRITE_CARD_MIN, WRITE_NOTE, WRITE_NOTE_HINT } from './timeline';

// The top of the feed: ONE card that writes a note, and nothing else (no composer row with a prompt and shortcuts, no filter tabs). It is the way in to a
// new page: the whole card is one button, so it is easy to find and easy to understand. A gold circle with the compose glyph, the title "Write a note", and
// the one quiet line that says where the notes are (they stay on this phone). The card is the card of Me (the surface colour of a card with a hairline,
// the corners of a card), drawn in roles only, so it is the same card in light and in dark. The gold button that floated over this tab is gone: the chat
// button, which Me draws on every sub-tab, took its place at the bottom right.

export function NotesHeader({ onWrite }: { onWrite: () => void }) {
  return (
    <View style={{ paddingHorizontal: layout.screenMargin, paddingBottom: space[1] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={WRITE_NOTE}
        accessibilityHint={WRITE_NOTE_HINT}
        onPress={onWrite}
        style={({ pressed }) => ({ minHeight: WRITE_CARD_MIN, flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: space[4], paddingHorizontal: space[4], borderRadius: radius.lg, borderWidth: 1, borderColor: role.border, backgroundColor: pressed ? role.sunken : role.surface })}
      >
        <View style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: role.highlight, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="compose" color={role.onHighlight} size={28} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="h4">{WRITE_NOTE}</AppText>
          <AppText variant="caption" muted>{NOTES_PRIVACY}</AppText>
        </View>
        <Icon name="chevron" color={role.muted} size={24} />
      </Pressable>
    </View>
  );
}
