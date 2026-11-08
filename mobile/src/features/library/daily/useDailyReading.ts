import { useCallback, useEffect, useReducer } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { addMonths, clampMonth, monthTitle, sameDay, sameMonth, todayOf, type Range, type Ym, type Ymd } from './calendar';
import { arrows, dailyReducer, initDaily, weekArrows } from './state';
import { dayCellLabel } from './week';

// The state of the Daily reading screen for React: the reducer of state.ts, and the clock.
//
// The clock is a parameter (`now`), so a test or a preview can hand in any day; the screen passes nothing and gets the phone's clock.
// Today is read again every time the screen draws, and the screen draws again when the app comes back to the front, so a phone left
// open overnight shows the new day's ring in the morning. What was selected stays selected: Today goes to the new day. `requested` is the
// day the screen was asked to open on (the `date` of a bookmark); anything that is not a real day is already null by then and means today.
//
// A screen reader on a phone does not say that the day changed after a button was pressed (the focus stays on the button), so the new day
// is said out loud. Android and the web say it already, from the live region of the strip.
const systemNow = (): Date => new Date();

const say = (text: string): void => { if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text); };

export type DailyReading = {
  today: Ymd;
  selected: Ymd;
  range: Range;
  /** The week arrows of the strip. */
  canGoBackWeek: boolean;
  canGoForwardWeek: boolean;
  select: (day: Ymd) => void;
  previousWeek: () => void;
  nextWeek: () => void;
  goToday: () => void;
  /** The month the calendar sheet shows, and its arrows. */
  shown: Ym;
  canGoBack: boolean;
  canGoForward: boolean;
  previousMonth: () => void;
  nextMonth: () => void;
  /** Opening the calendar sheet: it starts on the month of the picked day. */
  showMonth: () => void;
};

export function useDailyReading(now: () => Date = systemNow, requested: Ymd | null = null): DailyReading {
  const [state, dispatch] = useReducer(dailyReducer, undefined, () => initDaily(todayOf(now()), requested));
  const [, redraw] = useReducer((k: number) => k + 1, 0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') redraw(); });
    return () => sub.remove();
  }, []);

  const today = todayOf(now());
  const { shown, selected, range } = state;
  const flags = arrows(state);
  const weeks = weekArrows(state);

  const move = useCallback((by: number) => {
    const to = clampMonth(addMonths(shown, by), range);
    if (sameMonth(to, shown)) return;
    dispatch({ type: 'month', by });
    say(monthTitle(to));
  }, [shown, range]);

  const week = useCallback((by: number) => {
    dispatch({ type: 'week', by });
  }, []);

  const select = useCallback((day: Ymd) => {
    dispatch({ type: 'select', day });
    say(dayCellLabel(day, sameDay(day, todayOf(now()))));
  }, [now]);

  const goToday = useCallback(() => {
    const t = todayOf(now());
    dispatch({ type: 'today', today: t });
    say(dayCellLabel(t, true));
  }, [now]);

  return {
    today, selected, range,
    canGoBackWeek: weeks.back, canGoForwardWeek: weeks.forward,
    select, previousWeek: () => week(-1), nextWeek: () => week(1), goToday,
    shown, canGoBack: flags.back, canGoForward: flags.forward,
    previousMonth: () => move(-1), nextMonth: () => move(1),
    showMonth: () => dispatch({ type: 'show', day: selected }),
  };
}
