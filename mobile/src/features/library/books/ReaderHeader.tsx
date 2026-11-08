import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { layout, radius, role } from '@/theme';
import { SizeTap } from './BookUi';
import { sizeLine } from './readerType';

// The header of the reader, which stays at the top while the chapter scrolls under it, and has only one row, as the top of a Kindle has: the way back to the
// table of contents (the chevron and "Contents": the book page), and the two "A" buttons that make the text smaller and larger. The title of the book, Previous
// and Next, and the line that shows how far down the chapter you are are at the bottom (ReaderBar.tsx).
// Everything is at least 44 by 44, and the texts grow with the phone's text size only up to 1.3 times, so that the header never takes the page.

const HEADER_FONT_LIMIT = 1.3;
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
      <View style={{ paddingHorizontal: 8, gap: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Contents"
            accessibilityHint="Back to the table of contents of this book"
            onPress={onContents}
            hitSlop={2}
            style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 6, paddingRight: 14, borderRadius: radius.pill, backgroundColor: pressed ? role.sunken : 'transparent' })}
          >
            <Icon name="back" color={role.text} size={24} />
            <AppText variant="label" maxFontSizeMultiplier={HEADER_FONT_LIMIT} style={{ fontSize: 16, lineHeight: 22 }}>Contents</AppText>
          </Pressable>
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
