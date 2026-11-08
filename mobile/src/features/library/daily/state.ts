// What the Daily reading screen remembers, and what each tap does to it, as a plain reducer: no React in this file, so node tests can
// press the arrows sixty times and see where the calendar stops (npm run test:library). useDailyReading.ts hands it to React.
//
// Three things are kept: the selected day (the week strip always shows the week that holds it), the month on show in the calendar sheet, and how
// far the calendar goes (five years back and ahead of the day the screen was opened; it does not move while the screen is open, and it grows to
// hold a day that was asked for from outside it, so a bookmark of an old day still opens). Today is not kept here: it is read off the clock when
// the screen draws, so that the ring follows the clock when the phone comes back the next morning.
import { addDays, addMonths, canGoBack, canGoForward, clampMonth, dayInRange, isValidDay, monthNumber, rangeAround, sameMonth, type Range, type Ym, type Ymd } from './calendar';

export type DailyState = {
  range: Range;
  /** The month the calendar sheet shows. */
  shown: Ym;
  /** The day whose reading is shown: today when the screen opens. */
  selected: Ymd;
};

export type DailyAction =
  | { type: 'select'; day: Ymd }
  | { type: 'week'; by: number }
  | { type: 'month'; by: number }
  | { type: 'show'; day: Ymd }
  | { type: 'today'; today: Ymd };

const monthOf = (day: Ymd): Ym => ({ y: day.y, m: day.m });

/** The screen as it opens: on today, or on the day that was asked for (a bookmark, a link) when it is a real day. */
export function initDaily(today: Ymd, requested?: Ymd | null): DailyState {
  const around = rangeAround(today);
  const start = requested && isValidDay(requested) ? requested : today;
  const month = monthOf(start);
  const range = { min: monthNumber(month) < monthNumber(around.min) ? month : around.min, max: monthNumber(month) > monthNumber(around.max) ? month : around.max };
  return { range, shown: month, selected: start };
}

export function dailyReducer(state: DailyState, action: DailyAction): DailyState {
  switch (action.type) {
    case 'select':
      // A day that does not exist, or is past the limits, is not taken (the calendar only draws days inside them).
      if (!isValidDay(action.day) || !dayInRange(action.day, state.range)) return state;
      return { ...state, selected: action.day, shown: monthOf(action.day) };
    case 'week': {
      // The arrows of the strip move the picked day by whole weeks, to the same weekday, and stop at the limits.
      const next = addDays(state.selected, 7 * action.by);
      if (!dayInRange(next, state.range)) return state;
      return { ...state, selected: next, shown: monthOf(next) };
    }
    case 'month': {
      // The arrows of the calendar sheet move the month on show and leave the selected day where it is.
      const shown = clampMonth(addMonths(state.shown, action.by), state.range);
      return sameMonth(shown, state.shown) ? state : { ...state, shown };
    }
    case 'show':
      // Opening the calendar sheet: it starts on the month of the picked day, whatever month it was left on.
      return { ...state, shown: clampMonth(monthOf(action.day), state.range) };
    case 'today': {
      // Back to today: its month on show, and it selected. A clock that went past the limits stops at the limit.
      const month = clampMonth(monthOf(action.today), state.range);
      const day = sameMonth(month, action.today) ? action.today : { ...month, d: 1 };
      return { ...state, shown: month, selected: day };
    }
  }
}

/** What the two arrows of the calendar sheet may do from here. */
export const arrows = (state: DailyState): { back: boolean; forward: boolean } => ({ back: canGoBack(state.shown, state.range), forward: canGoForward(state.shown, state.range) });

/** What the two arrows of the week strip may do from here. */
export const weekArrows = (state: DailyState): { back: boolean; forward: boolean } => ({
  back: dayInRange(addDays(state.selected, -7), state.range),
  forward: dayInRange(addDays(state.selected, 7), state.range),
});
