import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppText } from '@/components/AppText';
import { c, radius, role, space } from '@/theme';
import { msUntilTomorrow, todayLine } from './bible/today';
import { todayOf } from './daily/calendar';
import { pillBesideTitle } from './daily/bannerLayout';
import { readingsLine, readingsSpoken } from './daily/content';
import { dateKey } from './daily/datekey';
import { dayBrief } from './daily/dayData';

// The two banners under the tab strip of the Library, in a file apart from the rows (LibraryTabs.tsx): the card of the daily reading at the top of the Bible tab (DailyBanner, below)
// and the compact banner that the Books tab is built on (books/BooksBanner.tsx).
//
// CompactBanner is the base of the Books tab's: a dark blue card no taller than 128 on a
// 390 wide phone (148 on a 320 wide one), in the four fonts of the brand: a small gold line in JetBrains Mono (a date, or a few words), the title in
// Fraunces, an optional short line in Inter, one short handwritten note in Caveat (the one accent of the card) and, on the right, the gold pill with its
// label in Inter. With a pill and something to do, the whole card is ONE button for a screen reader (the pill is its look, not a second stop), so a tap
// anywhere on it does the same; the note is decoration and is not said. Colours are roles and the gold, as on the promo banner: the card is role.inverse
// (dark blue in light mode, a lighter blue in dark mode) and what is on it keeps its contrast in both.

export const DAILY_TITLE = 'Daily reading';
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
 * The card of the daily reading is never taller than the first number on a phone 390 wide, nor than the second on one 320 wide (the phone's text at its normal size), on the longest day of the
 * readings we have: a day of two lines (a saint with a long name: the banner cuts it after two, the screen has it whole) and readings on three lines (four on a phone of 320, with the pill under them).
 * A Sunday is 166 high on a phone of 390 and 204 on one of 320; the tallest day of 2026 is 209 and 268 (measured in a browser, tools/web-smoke), and the numbers have a few points to spare.
 */
export const DAILY_BANNER_MAX_HEIGHT = 216;
export const DAILY_BANNER_MAX_HEIGHT_NARROW = 276;

/**
 * The banner of the Bible tab: the daily reading. In the four fonts of the brand and on the colours of a hero card (role.inverse, so it keeps its contrast in light and in dark): the
 * date and the weekday in a small gold line (JetBrains Mono, capitals), the title "Daily reading" (Fraunces) with the gold pill "Read today" at its right, then what the day is
 * (Inter: the memorial or feast the readings file names, else the Sunday or the weekday of the calendar, "32nd Sunday in Ordinary Time"), then the readings as one line of references
 * ("Wisdom 6:12-16 · Psalm 63 · Matthew 25:1-13": the first reading, the psalm, the second reading on a Sunday or a solemnity, the Gospel). A day we have no readings for says so, in
 * the same place. The pill moves under the last line on a phone too narrow, or with text too big, for the title and the pill to share a row (pillBesideTitle).
 *
 * The whole card is ONE button for a screen reader (the pill is its look, not a second stop) and opens the daily reading (the screen decides where: app/(tabs)/library.tsx); what it says
 * is the pill's words, the title, the date, the day and the readings, each reference in words ("Wisdom, chapter 6, verses 12 to 16"), a psalm by its number. The date is read again each
 * time the Library comes into view, when the app comes back to the front and when the day changes under an app that stays open (a timer to the next midnight), so the banner never says
 * yesterday. It has no handwritten note: Buen Camino! is said on the screens that have room for a greeting.
 */
export function DailyBanner({ onOpen }: { onOpen: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => { setNow(new Date()); }, []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') setNow(new Date()); });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), msUntilTomorrow(now) + 1000);
    return () => clearTimeout(timer);
  }, [now]);
  const { width, fontScale } = useWindowDimensions();
  const label = todayLine(now);
  const brief = useMemo(() => dayBrief(dateKey(todayOf(now))), [now]);
  const line = brief.readings ? readingsLine(brief.readings) : brief.unavailable;
  const spoken = brief.readings ? `Readings: ${readingsSpoken(brief.readings)}` : brief.unavailable;
  const beside = pillBesideTitle(width, fontScale, COMPACT_BANNER_MAX_FONT_SCALE);
  const pill = (
    <View style={{ height: 44, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' }}>
      <AppText variant="label" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} color={role.onHighlight}>{DAILY_CTA}</AppText>
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[DAILY_CTA, DAILY_TITLE, label, brief.title, spoken].filter(Boolean).join('. ')}
      accessibilityHint="Opens today's reading and the calendar"
      onPress={onOpen}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
    >
      <View style={{ borderRadius: radius.lg, backgroundColor: role.inverse, paddingHorizontal: space[4], paddingVertical: space[3], gap: space[1] }}>
        <AppText variant="mono" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} numberOfLines={1} color={role.onInverseAccent} style={{ textTransform: 'uppercase' }}>{label}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
          <AppText variant="h4" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} color={role.onInverse} style={{ flexShrink: 1 }}>{DAILY_TITLE}</AppText>
          {beside && pill}
        </View>
        <AppText variant="label" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} numberOfLines={2} color={role.onInverse}>{brief.title}</AppText>
        <AppText variant="caption" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} color={role.onInverseAccent}>{line}</AppText>
        {!beside && <View style={{ alignSelf: 'flex-end', marginTop: space[1] }}>{pill}</View>}
      </View>
    </Pressable>
  );
}
