import { Pressable, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/ui';
import { layout, liturgical, radius, role } from '@/theme';
import { dayInRange, sameDay, weekdayIndex, type Range, type Ymd } from './calendar';
import { GRID_MAX, TOUCH, calendarMetrics } from './layout';
import { liturgicalDayOf } from './liturgy';
import { WEEKDAY_LETTERS, dayCellLabel, nextWeekLabel, previousWeekLabel, weekDays, weekSpoken, weekTitle } from './week';

// The week strip of the Daily reading screen: the title of the week with its two arrows (and a Today button when the picked day is not today),
// then the seven days of the week that holds the picked day, Monday first. Each day shows its weekday letter, its number and a small dot in the
// liturgical colour of that day. Today has a ring, the picked day is filled, both: filled with a thin ring of the page colour inside it. The seven
// days are equal and at least 44 wide and 44 high on every phone from 320 up (the card reaches into the margins on the smallest ones, as the month
// calendar's does: layout.ts). A screen reader reads each day with its date and its liturgical name, and the picked one as selected. The text of the
// numbers and letters stops growing at 1.3 times, so that a number never leaves its place; every other text grows without a limit.
const FONT_LIMIT = 1.3;
const MARKER = 40;
const DOT = 8;

function Arrow({ direction, label, enabled, onPress }: { direction: 'back' | 'chevron'; label: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: TOUCH, height: TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      {/* An arrow that cannot go is quieter (the placeholder grey, still 3 : 1) and marked disabled. */}
      <Icon name={direction} color={enabled ? role.text : role.placeholder} />
    </Pressable>
  );
}

function Cell({ day, today, selected, enabled, onSelect }: { day: Ymd; today: boolean; selected: boolean; enabled: boolean; onSelect: (day: Ymd) => void }) {
  const colour = liturgicalDayOf(day).colour;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dayCellLabel(day, today)}
      accessibilityState={{ selected, disabled: !enabled }}
      disabled={!enabled}
      onPress={() => onSelect(day)}
      style={({ pressed }) => ({ flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: pressed ? 0.6 : 1 })}
    >
      <AppText variant="caption" muted maxFontSizeMultiplier={FONT_LIMIT}>{WEEKDAY_LETTERS[weekdayIndex(day)]}</AppText>
      {/* Today: a ring. Picked: filled. Both: filled, with a thin ring of the page colour inside it, so today still shows. */}
      <View style={{ width: MARKER, height: MARKER, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: today ? 2 : 0, borderColor: role.action, backgroundColor: selected ? role.action : 'transparent' }}>
        {selected && today && <View pointerEvents="none" style={{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: radius.pill, borderWidth: 2, borderColor: role.onAction }} />}
        <AppText variant={selected || today ? 'label' : 'small'} color={selected ? role.onAction : enabled ? role.text : role.placeholder} maxFontSizeMultiplier={FONT_LIMIT}>{day.d}</AppText>
      </View>
      {/* The colour of the day. The white of the Church is paper white, so it has a ring: it would not show on a card. */}
      <View aria-hidden style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: liturgical[colour], borderWidth: colour === 'white' ? 1.5 : 0, borderColor: role.muted }} />
    </Pressable>
  );
}

export type WeekStripProps = {
  selected: Ymd;
  today: Ymd;
  range: Range;
  canGoBack: boolean;
  canGoForward: boolean;
  onSelect: (day: Ymd) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

export function WeekStrip({ selected, today, range, canGoBack, canGoForward, onSelect, onPrevious, onNext, onToday }: WeekStripProps) {
  const { width } = useWindowDimensions();
  const metrics = calendarMetrics(width, layout.screenMargin);
  const days = weekDays(selected);
  const away = !sameDay(selected, today);
  return (
    <View style={{ marginHorizontal: -metrics.bleed }}>
      <Card style={{ paddingHorizontal: metrics.pad, paddingVertical: 8 }}>
        <View style={{ width: '100%', maxWidth: GRID_MAX, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TOUCH }}>
            <Arrow direction="back" label={previousWeekLabel(selected, range)} enabled={canGoBack} onPress={onPrevious} />
            <AppText variant="label" accessibilityRole="header" accessibilityLiveRegion="polite" accessibilityLabel={weekSpoken(days)} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>{weekTitle(days)}</AppText>
            {away && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Today"
                accessibilityHint="Goes back to today"
                onPress={onToday}
                style={({ pressed }) => ({ minHeight: TOUCH, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
              >
                <View style={{ height: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: role.border }}>
                  <AppText variant="label" color={role.action}>Today</AppText>
                </View>
              </Pressable>
            )}
            <Arrow direction="chevron" label={nextWeekLabel(selected, range)} enabled={canGoForward} onPress={onNext} />
          </View>
          <View style={{ flexDirection: 'row' }}>
            {days.map((d) => (
              <Cell key={`${d.y}-${d.m}-${d.d}`} day={d} today={sameDay(d, today)} selected={sameDay(d, selected)} enabled={dayInRange(d, range)} onSelect={onSelect} />
            ))}
          </View>
        </View>
      </Card>
    </View>
  );
}
