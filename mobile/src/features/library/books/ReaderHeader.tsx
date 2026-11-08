import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { layout, radius, role } from '@/theme';
import { IconTap, SizeTap } from './BookUi';
import { nextLabel, positionLine, previousLabel, type ChapterNav } from './reading';
import { sizeLine } from './readerType';

// The header of the reader, which stays at the top while the chapter scrolls under it: two rows and a thin line.
//  Row 1: the way back to the table of contents (the chevron and "Contents": the book page), and the two "A" buttons that make the text smaller and larger.
//  Row 2: Previous, the title of the book with "Chapter 7 of 40" under it (JetBrains Mono), and Next. Both buttons are named by where they go ("Previous: Chapter
//  VI. Of inordinate affections", "Next: Book Two, Chapter I..."), they cross the parts, and at the first and the last chapter they are dimmed and disabled.
//  The line: how far down the chapter the person is. It is a picture of that and says nothing to a screen reader, which has the position in words.
// Everything is at least 44 by 44, and the texts grow with the phone's text size only up to 1.3 times, so that the header never takes the page.

const HEADER_FONT_LIMIT = 1.3;
/** Said, not drawn: a polite live region for a screen reader, so that "Larger text" is answered with "Text size 4 of 5". */
const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' } as const;

export type ProgressApi = { current: ((fraction: number) => void) | null };

/** The thin line under the header. It keeps its own number, so a scroll draws this line and nothing else. */
export const ReadingProgress = memo(function ReadingProgress({ api }: { api: ProgressApi }) {
  const [fraction, setFraction] = useState(0);
  const last = useRef(0);
  useEffect(() => {
    api.current = (f: number) => {
      // a hundredth is the least that can be seen on a phone, so nothing is drawn for less
      const next = Math.round(Math.min(Math.max(f, 0), 1) * 100) / 100;
      if (next === last.current) return;
      last.current = next;
      setFraction(next);
    };
    return () => { api.current = null; };
  }, [api]);
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 3, backgroundColor: role.border }}>
      <View style={{ height: 3, width: `${Math.round(fraction * 100)}%`, backgroundColor: role.action }} />
    </View>
  );
});

type Props = {
  bookTitle: string;
  nav: ChapterNav;
  step: number;
  canShrink: boolean;
  canGrow: boolean;
  onSmaller: () => void;
  onLarger: () => void;
  onContents: () => void;
  onPrevious: () => void;
  onNext: () => void;
  progress: ProgressApi;
};

export function ReaderHeader({ bookTitle, nav, step, canShrink, canGrow, onSmaller, onLarger, onContents, onPrevious, onNext, progress }: Props) {
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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconTap icon="back" label={previousLabel(nav)} disabled={!nav.prev} onPress={onPrevious} />
          <View style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4 }}>
            <AppText variant="label" numberOfLines={1} maxFontSizeMultiplier={HEADER_FONT_LIMIT} style={{ fontSize: 15, lineHeight: 20, textAlign: 'center' }}>{bookTitle}</AppText>
            <AppText variant="mono" muted numberOfLines={1} maxFontSizeMultiplier={HEADER_FONT_LIMIT} style={{ fontSize: 12, lineHeight: 16, textAlign: 'center' }}>{positionLine(nav)}</AppText>
          </View>
          <IconTap icon="chevron" label={nextLabel(nav)} disabled={!nav.next} onPress={onNext} />
        </View>
      </View>
      <ReadingProgress api={progress} />
    </View>
  );
}
