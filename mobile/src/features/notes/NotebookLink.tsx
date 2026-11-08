import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { c, radius, role, shadowStyle } from '@/theme';

export const NOTEBOOK_ROUTE = '/library/notes';
export const NOTEBOOK_LINK_LINE = 'Your notes on the books, and your reflections. Only on this phone.';

/** The way into the Notebook: a quiet row on the Bookmarks screen (the Library's header is full, and the notes are things the pilgrim keeps, like bookmarks). */
export function NotebookLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Notebook"
      accessibilityHint="Opens your notes"
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: role.surface, opacity: pressed ? 0.85 : 1, ...shadowStyle('sm') })}
    >
      <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.goldWash, borderWidth: 1, borderColor: c.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="pen" color={c.goldInk} size={22} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="label">Notebook</AppText>
        <AppText variant="caption" muted>{NOTEBOOK_LINK_LINE}</AppText>
      </View>
      <Icon name="chevron" color={role.muted} size={22} />
    </Pressable>
  );
}
