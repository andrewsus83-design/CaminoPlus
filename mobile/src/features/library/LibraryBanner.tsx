import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { c, fonts, radius, role } from '@/theme';
import { todayLine } from './bible/today';

// The banner at the top of the Bible tab and of the Books tab, under the tab strip. It is the look of the promo banner of the design
// system (components/PromoBanner.tsx, the one on Stays): a dark blue card, a big gold glyph in the corner, a small gold caps line, a
// serif title and a gold button. Here it is one card with no dots, because there is only one thing to say. Its own file, apart from
// the rows (LibraryTabs.tsx), because this is the one thing of the Library that can be pressed besides a bookmark: the rows of the tabs
// are pictures of what will be there, and a test keeps anything pressable out of them.

export const DAILY_KICKER = 'Today · Daily reading';
export const DAILY_TITLE = "Today's reading and a short reflection";
export const DAILY_CTA = 'Read today';
export const BOOKS_KICKER = 'Preview · Books';
export const BOOKS_TITLE = 'Twelve free companions for the road';
export const BOOKS_LINE = 'Classics to read on the way. Free to read.';

type BannerProps = {
  kicker: string;
  title: string;
  /** A line under the title: the date, or one short sentence. */
  line?: string;
  /** The big gold glyph in the corner. */
  icon: IconName;
  /** The gold button. Without one the banner only says something and cannot be pressed. */
  cta?: string;
  /** What the banner does when it is pressed (the whole card, the button included). Only with a `cta`. */
  onOpen?: () => void;
  hint?: string;
};

/**
 * One banner card. With a button the whole card is ONE button for a screen reader (the gold button is its look, not a second stop),
 * so a tap anywhere on it, the gold pill included, does the same. Colours are roles and the gold, as on the promo banner: the card is
 * role.inverse (dark blue in light mode, a lighter blue in dark mode) and what is on it keeps its contrast in both.
 */
export function LibraryBanner({ kicker, title, line, icon, cta, onOpen, hint }: BannerProps) {
  const card = (
    <View style={{ minHeight: 190, borderRadius: radius.xl, backgroundColor: role.inverse, padding: 24, overflow: 'hidden', justifyContent: 'space-between' }}>
      <View style={{ position: 'absolute', right: -36, bottom: -44, opacity: 0.9 }}><Icon name={icon} color={c.gold} size={200} strokeWidth={1.2} /></View>
      <View style={{ gap: 8 }}>
        <AppText variant="mono" color={role.onInverseAccent} style={{ textTransform: 'uppercase', letterSpacing: 1.5 }}>{kicker}</AppText>
        <AppText style={{ fontFamily: fonts.title, fontSize: 28, lineHeight: 34, color: role.onInverse, maxWidth: 230 }}>{title}</AppText>
        {!!line && <AppText variant="small" color={role.onInverse} style={{ maxWidth: 230 }}>{line}</AppText>}
      </View>
      {!!cta && (
        <View style={{ alignSelf: 'flex-start', height: 48, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
          <AppText variant="label" color={role.onHighlight}>{cta}</AppText>
        </View>
      )}
    </View>
  );
  if (!cta || !onOpen) return card;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[cta, title, line].filter(Boolean).join('. ')}
      accessibilityHint={hint}
      onPress={onOpen}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
    >
      {card}
    </Pressable>
  );
}

/**
 * The banner of the Bible tab: today's reading and a short reflection, with today's date and a gold "Read today". The whole card opens
 * the daily reading (the screen decides where: app/(tabs)/library.tsx). The date is read again each time the Library comes into view,
 * so the banner never says yesterday after a night with the app open.
 */
export function DailyBanner({ onOpen }: { onOpen: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => { setNow(new Date()); }, []));
  return <LibraryBanner kicker={DAILY_KICKER} title={DAILY_TITLE} line={todayLine(now)} icon="book" cta={DAILY_CTA} onOpen={onOpen} hint="Opens today's reading and the calendar" />;
}

/** The banner of the Books tab: it says what the tab is for, and has no button, because no book opens yet. */
export function BooksBanner() {
  return <LibraryBanner kicker={BOOKS_KICKER} title={BOOKS_TITLE} line={BOOKS_LINE} icon="library" />;
}
