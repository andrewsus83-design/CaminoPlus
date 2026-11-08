import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { c, fonts, radius, role } from '@/theme';
import { todayLine } from './bible/today';

// The banners at the top of the Bible tab and of the Books tab, under the tab strip. Its own file, apart from the rows (LibraryTabs.tsx).
//
// CompactBanner is the one the Bible tab has (the daily reading), and the base the Books tab builds its banner on: a dark blue card no taller than 120 on a
// 390 wide phone (140 on a 320 wide one), in the four fonts of the brand: a small gold line in JetBrains Mono (a date, or a few words), the title in
// Fraunces, an optional short line in Inter, one short handwritten note in Caveat (the one accent of the card) and, on the right, the gold pill with its
// label in Inter. With a pill and something to do, the whole card is ONE button for a screen reader (the pill is its look, not a second stop), so a tap
// anywhere on it does the same; the note is decoration and is not said. Colours are roles and the gold, as on the promo banner: the card is role.inverse
// (dark blue in light mode, a lighter blue in dark mode) and what is on it keeps its contrast in both.
//
// LibraryBanner further down is the earlier, taller banner (the look of components/PromoBanner.tsx, the one on Stays). The Books tab still draws it, until
// its banner is rebuilt on CompactBanner.

export const DAILY_TITLE = 'Daily reading';
export const DAILY_NOTE = 'Buen Camino!';
export const DAILY_CTA = 'Read today';
export const BOOKS_KICKER = 'Preview · Books';
export const BOOKS_TITLE = 'Twelve free companions for the road';
export const BOOKS_LINE = 'Classics to read on the way. Free to read.';

/** The compact banner is never taller than the first number on a phone 390 wide, nor than the second on one 320 wide (with the phone's text at its normal size). */
export const COMPACT_BANNER_MAX_HEIGHT = 120;
export const COMPACT_BANNER_MAX_HEIGHT_NARROW = 140;
/** What the phone's own text size may add to the words of the banner: a handwritten note beside a pill has no room to grow without end. */
export const COMPACT_BANNER_MAX_FONT_SCALE = 1.2;

export type CompactBannerProps = {
  /** The small gold line, in JetBrains Mono capitals: a date ("Sunday 8 November") or a few words ("Preview · Books"). */
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
 * the right. 12 above and below, 16 at the sides; the pill is 44 high; a title of one line is 28 high, so a card with a note and a pill is 116 high at the
 * phone's normal text size.
 */
export function CompactBanner({ label, title, line, note, cta, onPress, hint }: CompactBannerProps) {
  const card = (
    <View style={{ borderRadius: radius.lg, backgroundColor: role.inverse, paddingHorizontal: 16, paddingVertical: 12, gap: 2 }}>
      <AppText variant="mono" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} numberOfLines={1} color={role.onInverseAccent} style={{ fontSize: 12, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 1.5 }}>{label}</AppText>
      <AppText variant="h4" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} color={role.onInverse} style={{ fontSize: 24, lineHeight: 28 }}>{title}</AppText>
      {(!!line || !!note || !!cta) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {!!line && <AppText variant="small" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} color={role.onInverse} style={{ fontSize: 15, lineHeight: 20 }}>{line}</AppText>}
            {!!note && <AppText variant="accent" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} color={role.onInverseAccent} style={{ fontSize: 24, lineHeight: 28 }}>{note}</AppText>}
          </View>
          {!!cta && (
            <View style={{ height: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="label" maxFontSizeMultiplier={COMPACT_BANNER_MAX_FONT_SCALE} color={role.onHighlight} style={{ fontSize: 16, lineHeight: 20 }}>{cta}</AppText>
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
 * The banner of the Bible tab: the daily reading, with today's date and a gold "Read today", and one handwritten note. The whole card opens the
 * daily reading (the screen decides where: app/(tabs)/library.tsx). The date is read again each time the Library comes into view, so the banner
 * never says yesterday after a night with the app open.
 */
export function DailyBanner({ onOpen }: { onOpen: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => { setNow(new Date()); }, []));
  return <CompactBanner label={todayLine(now)} title={DAILY_TITLE} note={DAILY_NOTE} cta={DAILY_CTA} onPress={onOpen} hint="Opens today's reading and the calendar" />;
}

/** The banner of the Books tab: it says what the tab is for, and has no button, because no book opens yet. */
export function BooksBanner() {
  return <LibraryBanner kicker={BOOKS_KICKER} title={BOOKS_TITLE} line={BOOKS_LINE} icon="library" />;
}
