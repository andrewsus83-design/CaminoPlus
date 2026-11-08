// PLACEHOLDER, replaced by agent B: the Notes tab of the Library (the diary as a feed, in the style of X) is built on another branch and
// its real NotesTab.tsx takes the place of this file when the two are merged. This stand-in only keeps the Library whole until then.
// How the shell hosts it (app/(tabs)/library.tsx): the search row and the tabs stay at the top, and NotesTab fills the box under them
// (flex: 1, as wide as the screen, no banner, no ScrollView around it), so a tab that is a list of its own can scroll by itself.
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { layout } from '@/theme';

export function NotesTab() {
  return (
    <View accessibilityLabel="Notes" style={{ flex: 1, paddingHorizontal: layout.screenMargin, paddingTop: 8 }}>
      <AppText variant="small" muted>Your notes will be here.</AppText>
    </View>
  );
}
