import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { layout, role } from '@/theme';
import { SizeTap } from './BookUi';
import { sizeLine } from './readerType';

// The header of the reader, which stays at the top while the chapter scrolls under it, and has only one row, as the top of a Kindle has: the Back button of the app
// (components/BackButton.tsx, the round 48 px one every screen has; here it goes to the table of contents, the book page, and says so to a screen reader), and the two
// "A" buttons that make the text smaller and larger, round and 48 like it. The title of the book, Previous and Next, and the line that shows how far down the chapter
// you are are at the bottom (ReaderBar.tsx).
// Everything is 48 by 48, at the same distance from the edge as the Back button of every other screen (layout.screenMargin).

/** Said, not drawn: a polite live region for a screen reader, so that "Larger text" is answered with "Text size 4 of 5". */
const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' } as const;

type Props = {
  step: number;
  canShrink: boolean;
  canGrow: boolean;
  onSmaller: () => void;
  onLarger: () => void;
  onContents: () => void;
};

export function ReaderHeader({ step, canShrink, canGrow, onSmaller, onLarger, onContents }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: role.bg, paddingTop: insets.top + layout.screenTop }}>
      <View style={{ paddingHorizontal: layout.screenMargin, gap: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackButton onPress={onContents} hint="Back to the contents of this book" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SizeTap larger={false} disabled={!canShrink} onPress={onSmaller} />
            <SizeTap larger disabled={!canGrow} onPress={onLarger} />
          </View>
        </View>
        <AppText accessibilityLiveRegion="polite" style={VISUALLY_HIDDEN}>{sizeLine(step)}</AppText>
      </View>
    </View>
  );
}
