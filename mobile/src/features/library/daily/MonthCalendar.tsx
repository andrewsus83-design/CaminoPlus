import { Pressable, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/ui';
import { layout, radius, role } from '@/theme';
import { WEEKDAYS_SHORT, dayLabel, monthGrid, monthTitle, nextMonthLabel, previousMonthLabel, sameDay, type Range, type Ym, type Ymd } from './calendar';
import { GRID_MAX, TOUCH, calendarMetrics } from './layout';

// The month calendar of the Daily reading screen: the month and year with the two arrows and a Today button, the weekdays (Monday
// first), and six rows of days. Today has a ring, the selected day is filled, and a place before the 1st or after the last day is empty.
// What a day is and says comes from calendar.ts; how wide it is comes from layout.ts (every day is at least 44 by 44, also on a
// 320 phone, where the card reaches a little into the margins to make room). Colours are theme roles, read while drawing.
//
// A screen reader reads each day with its whole date ("Sunday 8 November 2026, today, selected") and skips the weekday row, which
// says nothing the days do not say. The text of the days and the weekdays stops growing at 1.3 times so that a number never leaves
// its 44 px place when the phone's text size is turned up; every other text on the screen grows without a limit.
const FONT_LIMIT = 1.3;
const MARKER = 40;

export type MonthCalendarProps = {
  shown: Ym;
  today: Ymd;
  selected: Ymd;
  range: Range;
  canGoBack: boolean;
  canGoForward: boolean;
  onSelect: (day: Ymd) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

function Arrow({ direction, label, enabled, onPress }: { direction: 'back' | 'chevron'; label: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: TOUCH, height: TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', opacity: !enabled ? 0.35 : pressed ? 0.6 : 1 })}
    >
      <Icon name={direction} color={role.text} />
    </Pressable>
  );
}

function Day({ day, today, selected, onSelect }: { day: Ymd; today: boolean; selected: boolean; onSelect: (day: Ymd) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dayLabel(day, { today, selected })}
      onPress={() => onSelect(day)}
      style={({ pressed }) => ({ flex: 1, height: TOUCH, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      {/* Today: a ring. Selected: filled. Both: filled, with a thin ring of the page colour inside it, so today still shows. */}
      <View style={{ width: MARKER, height: MARKER, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: today ? 2 : 0, borderColor: role.action, backgroundColor: selected ? role.action : 'transparent' }}>
        {selected && today && <View pointerEvents="none" style={{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: radius.pill, borderWidth: 2, borderColor: role.onAction }} />}
        <AppText variant={selected || today ? 'label' : 'small'} color={selected ? role.onAction : role.text} maxFontSizeMultiplier={FONT_LIMIT}>{day.d}</AppText>
      </View>
    </Pressable>
  );
}

export function MonthCalendar({ shown, today, selected, range, canGoBack, canGoForward, onSelect, onPrevious, onNext, onToday }: MonthCalendarProps) {
  const { width } = useWindowDimensions();
  const metrics = calendarMetrics(width, layout.screenMargin);
  return (
    <View style={{ marginHorizontal: -metrics.bleed }}>
      <Card style={{ paddingHorizontal: metrics.pad, paddingVertical: 8 }}>
        <View style={{ width: '100%', maxWidth: GRID_MAX, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TOUCH }}>
            <AppText variant="label" accessibilityRole="header" accessibilityLiveRegion="polite" style={{ flex: 1, paddingLeft: 8 }}>{monthTitle(shown)}</AppText>
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
            <Arrow direction="back" label={previousMonthLabel(shown, range)} enabled={canGoBack} onPress={onPrevious} />
            <Arrow direction="chevron" label={nextMonthLabel(shown, range)} enabled={canGoForward} onPress={onNext} />
          </View>

          {/* The weekdays: Monday first. Hidden from a screen reader, which reads the weekday in every day's label. */}
          <View aria-hidden style={{ flexDirection: 'row', height: 28, alignItems: 'center' }}>
            {WEEKDAYS_SHORT.map((w) => (
              <View key={w} style={{ flex: 1, alignItems: 'center' }}>
                <AppText variant="caption" muted maxFontSizeMultiplier={FONT_LIMIT}>{w}</AppText>
              </View>
            ))}
          </View>

          {monthGrid(shown).map((row, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {row.map((cell, c) => (cell
                ? <Day key={c} day={cell} today={sameDay(cell, today)} selected={sameDay(cell, selected)} onSelect={onSelect} />
                : <View key={c} style={{ flex: 1, height: TOUCH }} />))}
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
