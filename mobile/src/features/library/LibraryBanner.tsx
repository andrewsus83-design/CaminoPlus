import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppText } from '@/components/AppText';
import { c, radius, role, space } from '@/theme';
import { todayLine } from './bible/today';

// The compact banner at the top of the Bible tab (the daily reading) and the base the banner of the Books tab is built on (books/BooksBanner.tsx), under the tab
// strip. Its own file, apart from the rows (LibraryTabs.tsx).
//
// CompactBanner is the one the Bible tab has, and the base of the Books tab's: a dark blue card no taller than 128 on a
// 390 wide phone (148 on a 320 wide one), in the four fonts of the brand: a small gold line in JetBrains Mono (a date, or a few words), the title in
// Fraunces, an optional short line in Inter, one short handwritten note in Caveat (the one accent of the card) and, on the right, the gold pill with its
// label in Inter. With a pill and something to do, the whole card is ONE button for a screen reader (the pill is its look, not a second stop), so a tap
// anywhere on it does the same; the note is decoration and is not said. Colours are roles and the gold, as on the promo banner: the card is role.inverse
// (dark blue in light mode, a lighter blue in dark mode) and what is on it keeps its contrast in both.

export const DAILY_TITLE = 'Daily reading';
export const DAILY_NOTE = 'Buen Camino!';
export const DAILY_CTA = 'Read today';

/** The compact banner is never taller than the first number on a phone 390 wide, nor than the second on one 320 wide (with the phone's text at its normal size). */
export const COMPACT_BANNER_MAX_HEIGHT = 128;
export const COMPACT_BANNER_MAX_HEIGHT_NARROW = 148;
/** What the phone's own text size may add to the words of the banner: a handwritten note beside a pill has no room to grow without end. */
export const COMPACT_BANNER_MAX_FONT_SCALE = 1.2;

export type CompactBannerProps = {
  /** The small gold line, in JetBrains Mono capitals: a date ("Sunday 8 November") or a few words ("The French Way"). */
  label: string;
  /** The title, in Fraunces. */
  title: string;
  /** A short line under the title, in Inter (optional). */
  line?: string;
  /** One short handwritten note, a few words, in Caveat: the single accent of the card (optional). It never goes inside the pill and is not said by a screen reader. */
  note?: string;
  /** The label of the gold pill, in Inter. Without a pill, or without `onPress`, the banner only says something and cannot be pressed. */
  cta?: string;
  /** What the card does when it is pressed (the whole card, the pill included). Only with a `cta`. */
  onPress?: () => void;
  /** What a screen reader says after the label of the button ("Opens today's reading and the calendar"). */
  hint?: string;
};

/**
 * The compact banner: the label, the title and, if there is a line, a note or a pill, a bottom row with the line and the note on the left and the pill on
 * the right. 12 above and below, 16 at the sides; the label is 22 high (the 15 of the type scale), the title 30 and the pill 44, with 4 between them, so a card with a note and a pill
 * is 128 high at the phone's normal text size (it was 118 when the label was 12 px: the type scale has nothing under 15).
 */
export function CompactBanner({ label, title, line, note, cta, onPress, hint }: CompactBannerProps) {
  const card = (
    <View style={{ borderRadius: radius.lg, backgroundColor: role.inverse, paddingHorizontal: space[4], paddingVertical: space[3], gap: space[1] }}>
      <AppText variant="mono" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} numberOfLines={1} color={role.onInverseAccent} style={{ textTransform: 'uppercase' }}>{label}</AppText>
      <AppText variant="h4" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} color={role.onInverse}>{title}</AppText>
      {(!!line || !!note || !!cta) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {!!line && <AppText variant="caption" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} color={role.onInverse}>{line}</AppText>}
            {!!note && <AppText variant="accent" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} color={role.onInverseAccent} style={{ fontSize: 24, lineHeight: 28 }}>{note}</AppText>}
          </View>
          {!!cta && (
            <View style={{ height: 44, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="label" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} color={role.onHighlight}>{cta}</AppText>
            </View>
          )}
        </View>
      )}
    </View>
  );
  if (!cta || !onPress) return card;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[cta, title, label, line].filter(Boolean).join('. ')}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
    >
      {card}
    </Pressable>
  );
}

/**
 * The banner of the Bible tab: the daily reading, with today's date and a gold "Read today", and one handwritten note. The whole card opens the
 * daily reading (the screen decides where: app/(tabs)/library.tsx). The date is read again each time the Library comes into view, so the banner
 * never says yesterday after a night with the app open.
 */
export function DailyBanner({ onOpen }: { onOpen: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => { setNow(new Date()); }, []));
  return <CompactBanner label={todayLine(now)} title={DAILY_TITLE} note={DAILY_NOTE} cta={DAILY_CTA} onPress={onOpen} hint="Opens today's reading and the calendar" />;
}
