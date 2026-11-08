// PLACEHOLDER, replaced by agent B: the Notes tab of the Library (the diary as a feed, in the style of X) is built on another branch and
// its real NotesTab.tsx takes the place of this file when the two are merged. This stand-in only keeps the Library whole until then:
// it is the third tab, directly under the tab strip, with no banner, as the real one will be.
import { View } from 'react-native';
import { AppText } from '@/components/AppText';

export function NotesTab() {
  return (
    <View accessibilityLabel="Notes">
      <AppText variant="small" muted>Your notes will be here.</AppText>
    </View>
  );
}
