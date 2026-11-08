import { memo, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { role, textStyle } from '@/theme';
import { IconTap } from './BookUi';
import { nextLabel, positionLine, previousLabel, type ChapterNav } from './reading';

// The bar at the bottom of the reader, where a Kindle keeps it: a thin line that shows how far down the chapter you are, and under it one row,
//  Previous, the title of the book with "Chapter 7 of 40" under it (JetBrains Mono), and Next. Both buttons are named by where they go ("Previous: Chapter
//  VI. Of inordinate affections", "Next: Book Two, Chapter I..."), they cross the parts, and at the first and the last chapter they are dimmed and disabled.
//  The line is a picture of how far you are and says nothing to a screen reader, which has the position in words.
// The bar stays under the chapter while it scrolls, above the home indicator of the phone. The title of the book is here and only here: the header at the top
// has the way back and the size of the text, nothing else. Everything is at least 44 by 44, and the texts grow with the phone's text size only up to 1.3 times,
// so that the bar never takes the page. It is the biggest part of the reader's chrome on purpose: the title is 19 (a label, SemiBold, at the size and the line of the type
// scale's body, 19 on 28), the place 14, the buttons 56.
// Why 19 and not more: the title is ONE line between the two 56 buttons, and one that does not fit is cut with an ellipsis. With the advances of Inter SemiBold (booksWiring.test.ts
// works it out again on every run) the widest of the 26 titles, "The Long Portuguese Way", is 243 px at 19 and 282 at 22, and the room between the buttons is 254 px on a phone 390
// wide (294 on 430, 224 on 360, 184 on 320). At 19 every title is whole on 390 and 430 (23 of 26 on 360, 15 of 26 on 320); at 22, the next size of the scale, five are cut on 390 and
// 18 on 320, or they take a second line and the bar is 28 px taller for those books.

const BAR_FONT_LIMIT = 1.3;
/** The title of the book: a label (Inter SemiBold) at the size and the line of the type scale's body, 19 on 28 (tokens.json), not a size of its own. */
const TITLE = { fontSize: textStyle('body').fontSize, lineHeight: textStyle('body').lineHeight };
/** The round buttons of the bar: larger than the 44 that is the least, because the bar is where the thumb rests. */
const BAR_BUTTON = 56;

export type ProgressApi = { current: ((fraction: number) => void) | null };

/** The thin line on top of the bar. It keeps its own number, so a scroll draws this line and nothing else. */
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
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 4, backgroundColor: role.border }}>
      <View style={{ height: 4, width: `${Math.round(fraction * 100)}%`, backgroundColor: role.action }} />
    </View>
  );
});

type Props = {
  bookTitle: string;
  nav: ChapterNav;
  onPrevious: () => void;
  onNext: () => void;
  progress: ProgressApi;
};

export function ReaderBar({ bookTitle, nav, onPrevious, onNext, progress }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: role.bg, paddingBottom: insets.bottom }}>
      <ReadingProgress api={progress} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 }}>
        <IconTap icon="back" label={previousLabel(nav)} disabled={!nav.prev} size={BAR_BUTTON} onPress={onPrevious} />
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4 }}>
          <AppText variant="label" numberOfLines={1} maxFontSizeMultiplier={BAR_FONT_LIMIT} style={{ ...TITLE, textAlign: 'center' }}>{bookTitle}</AppText>
          <AppText variant="mono" muted numberOfLines={1} maxFontSizeMultiplier={BAR_FONT_LIMIT} style={{ fontSize: 14, lineHeight: 20, textAlign: 'center' }}>{positionLine(nav)}</AppText>
        </View>
        <IconTap icon="chevron" label={nextLabel(nav)} disabled={!nav.next} size={BAR_BUTTON} onPress={onNext} />
      </View>
    </View>
  );
}
