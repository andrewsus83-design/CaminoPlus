import { useCallback, useEffect, useReducer } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { addMonths, clampMonth, dayLabel, monthTitle, sameDay, sameMonth, todayOf, type Range, type Ym, type Ymd } from './calendar';
import { arrows, dailyReducer, initDaily } from './state';

// The state of the Daily reading screen for React: the reducer of state.ts, and the clock.
//
// The clock is a parameter (`now`), so a test or a preview can hand in any day; the screen passes nothing and gets the phone's clock.
// Today is read again every time the screen draws, and the screen draws again when the app comes back to the front, so a phone left
// open overnight shows the new day's ring in the morning. What was selected stays selected: Today goes to the new day.
//
// A screen reader on a phone does not say that the month changed after the arrow was pressed (the focus stays on the arrow), so the new
// month, and the day that was picked, are said out loud. Android and the web say them already, from the live regions of the screen.
const systemNow = (): Date => new Date();

const say = (text: string): void => { if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text); };

export type DailyReading = {
  today: Ymd;
  shown: Ym;
  selected: Ymd;
  range: Range;
  canGoBack: boolean;
  canGoForward: boolean;
  select: (day: Ymd) => void;
  previousMonth: () => void;
  nextMonth: () => void;
  goToday: () => void;
};

export function useDailyReading(now: () => Date = systemNow): DailyReading {
  const [state, dispatch] = useReducer(dailyReducer, undefined, () => initDaily(todayOf(now())));
  const [, redraw] = useReducer((k: number) => k + 1, 0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') redraw(); });
    return () => sub.remove();
  }, []);

  const today = todayOf(now());
  const { shown, selected, range } = state;
  const flags = arrows(state);

  const move = useCallback((by: number) => {
    const to = clampMonth(addMonths(shown, by), range);
    if (sameMonth(to, shown)) return;
    dispatch({ type: 'month', by });
    say(monthTitle(to));
  }, [shown, range]);

  const select = useCallback((day: Ymd) => {
    dispatch({ type: 'select', day });
    say(dayLabel(day, { today: sameDay(day, todayOf(now())), selected: true }));
  }, [now]);

  const goToday = useCallback(() => {
    const t = todayOf(now());
    dispatch({ type: 'today', today: t });
    say(dayLabel(t, { today: true, selected: true }));
  }, [now]);

  return {
    today, shown, selected, range,
    canGoBack: flags.back, canGoForward: flags.forward,
    select, previousMonth: () => move(-1), nextMonth: () => move(1), goToday,
  };
}
