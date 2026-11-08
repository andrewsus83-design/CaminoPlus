// What the Daily reading screen remembers, and what each tap does to it, as a plain reducer: no React in this file, so node tests can
// press the arrows sixty times and see where the calendar stops (npm run test:library). useDailyReading.ts hands it to React.
//
// Three things are kept: the month on show, the selected day, and how far the calendar goes (five years back and ahead of the day the
// screen was opened; it does not move while the screen is open). Today is not kept here: it is read off the clock when the screen draws,
// so that the ring follows the clock when the phone comes back the next morning.
import { addMonths, canGoBack, canGoForward, clampMonth, dayInRange, isValidDay, rangeAround, sameMonth, type Range, type Ym, type Ymd } from './calendar';

export type DailyState = {
  range: Range;
  /** The month the grid shows. */
  shown: Ym;
  /** The day whose reading is shown: today when the screen opens. It may be in another month than the one on show. */
  selected: Ymd;
};

export type DailyAction =
  | { type: 'select'; day: Ymd }
  | { type: 'month'; by: number }
  | { type: 'today'; today: Ymd };

/** The screen as it opens: this month, with today selected. */
export const initDaily = (today: Ymd): DailyState => ({ range: rangeAround(today), shown: { y: today.y, m: today.m }, selected: today });

export function dailyReducer(state: DailyState, action: DailyAction): DailyState {
  switch (action.type) {
    case 'select':
      // A day that does not exist, or is past the limits, is not taken (the grid only draws days inside them).
      if (!isValidDay(action.day) || !dayInRange(action.day, state.range)) return state;
      return { ...state, selected: action.day, shown: { y: action.day.y, m: action.day.m } };
    case 'month': {
      // The arrows move the month on show and leave the selected day where it is: the reading does not change until a day is tapped.
      const shown = clampMonth(addMonths(state.shown, action.by), state.range);
      return sameMonth(shown, state.shown) ? state : { ...state, shown };
    }
    case 'today': {
      // Back to today: its month on show, and it selected. A clock that went past the limits stops at the limit.
      const month = clampMonth({ y: action.today.y, m: action.today.m }, state.range);
      const day = sameMonth(month, action.today) ? action.today : { ...month, d: 1 };
      return { ...state, shown: month, selected: day };
    }
  }
}

/** What the two arrows may do from here. */
export const arrows = (state: DailyState): { back: boolean; forward: boolean } => ({ back: canGoBack(state.shown, state.range), forward: canGoForward(state.shown, state.range) });
