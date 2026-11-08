// Scenarios of the Daily reading screen (mobile/app/library/daily.tsx, mobile/src/features/library/daily): what a person does there, step by step.
// scenarios.mjs adds them to its own list, so they run in light and in dark with everything else. They never name a date: the browser's clock is the
// phone's clock, so "today" is whatever day the run is on, and the scenarios find it the way a person does, by the day that says "today".
//
//   the header      Back, the title, the Calendar button and the Bookmark button are one row of buttons at least 44 by 44
//   the strip       exactly seven days, each at least 44 wide and tall; a tap on a day picks it and the liturgical title changes; Today brings it back
//   the sheet       the Calendar button opens the month calendar; Escape, Close and a tap outside close it; a day chosen in it, or Today, closes it and moves the strip
//   the bookmark    the button toggles and the day is kept; it is a row of Bookmarks that opens the Daily reading on that date
//   the date        ?date=YYYY-MM-DD opens that day (one far outside the five years too); anything that is not a day opens today
//   the readings    the references of the Roman Lectionary and the words from the Bible in the app: a Sunday, a memorial (the saint is the title), a reference with no words, a day with no readings;
//                   nothing is a sample, and nothing on the screen is under 15 px
import assert from 'node:assert/strict';
import { eventually, pathOf } from './harness.mjs';

const WEEKDAY = '(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December)';
/** A day of the strip: "Sunday 8 November, 32nd Sunday in Ordinary Time" (the days of the month calendar have the year and no comma: "Sunday 8 November 2026"). */
const STRIP_DAY = new RegExp(`^${WEEKDAY} \\d{1,2} ${MONTH}, `);
/** A reading of the day: its name and its reference are its label ("Gospel, Matthew 25:1-13"). */
const READING_ROW = /^(First Reading|Responsorial Psalm|Second Reading|Gospel), /;
const LITURGY_NOTE = 'General Roman Calendar, computed on this phone; your country may move some feasts to a Sunday';
const NO_READINGS = 'The readings for this day are not in the app yet.';
const READINGS_SOURCE = 'Readings: the Roman Lectionary (general calendar; your country may differ). Words: World English Bible, Catholic edition, not the lectionary translation.';
const WHOLE_PSALM = 'This is the whole psalm. Mass uses only the verses named above.';

const box = async (locator, what) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`${what} has no box (it is not on the screen)`);
  return b;
};
const waitPath = (page, want, what) => eventually(() => pathOf(page), (p) => p === want, { what: `${what} (wanted ${want})` });
const labelOf = (locator) => locator.getAttribute('aria-label');
/** The title of a day of the strip: what is after the first comma of its label, without ", today". */
const titleOf = (label) => label.replace(/^[^,]+, /, '').replace(/, today$/, '');

/** The seven buttons of the strip, and their labels. */
async function stripCells(page) {
  const cells = page.getByRole('button', { name: STRIP_DAY });
  await eventually(() => cells.count(), (n) => n === 7, { what: 'the number of days in the strip' });
  const labels = await cells.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  return { cells, labels };
}
const cellNamed = (page, label) => page.getByRole('button', { name: label, exact: true });
const isSelected = (cell) => cell.getAttribute('aria-selected');
const todayCell = (page) => page.getByRole('button', { name: new RegExp(`^${WEEKDAY} \\d{1,2} ${MONTH}, .*, today$`) });

async function openDaily({ page, step, go }, path = '/library/daily') {
  step(`open ${path}`);
  await go(path);
  await page.getByRole('button', { name: 'Open calendar', exact: true }).waitFor();
}

export const DAILY_SCENARIOS = [
  {
    name: 'Daily reading: Back, the title, the Calendar and the Bookmark buttons are one row of 44 pt buttons; the strip has exactly seven days of 44 pt; a day tap changes the liturgical title and Today comes back',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      await openDaily(ctx);
      step('the header: Back, the title, the Calendar and the Bookmark are one row, in that order, each button at least 44 by 44');
      const back = await box(page.getByRole('button', { name: 'Back', exact: true }), 'Back');
      const title = await box(page.getByRole('heading', { name: 'Daily reading', exact: true }), 'the title');
      const calendar = await box(page.getByRole('button', { name: 'Open calendar', exact: true }), 'the Calendar button');
      const bookmark = await box(page.getByRole('button', { name: 'Bookmark this day', exact: true }), 'the Bookmark button');
      const middle = (b) => b.y + b.height / 2;
      for (const [what, b] of [['the title', title], ['the Calendar button', calendar], ['the Bookmark button', bookmark]]) assert(Math.abs(middle(b) - middle(back)) < 12, `${what} is on the row of Back (${JSON.stringify(b)} against ${JSON.stringify(back)})`);
      assert(back.x < title.x && title.x < calendar.x && calendar.x < bookmark.x, 'order: Back, the title, the Calendar button, the Bookmark button');
      assert(back.x + back.width <= title.x + 1, 'the title is next to Back, not under it');
      for (const [what, b] of [['Back', back], ['the Calendar button', calendar], ['the Bookmark button', bookmark]]) assert(b.width >= 44 - 0.5 && b.height >= 44 - 0.5, `${what} is a touch target of at least 44: ${b.width} by ${b.height}`);
      assert(bookmark.x + bookmark.width >= 390 - 16 - 4, 'the two buttons are at the right edge');
      step('the strip: seven days, each at least 44 wide and 44 high, in one row, picked: today');
      const { cells, labels } = await stripCells(page);
      for (let i = 0; i < 7; i++) { const b = await box(cells.nth(i), `day ${i + 1}`); assert(b.width >= 44 - 0.5 && b.height >= 44 - 0.5, `day ${i + 1} is at least 44 by 44: ${b.width} by ${b.height}`); }
      const first = await box(cells.nth(0), 'the first day'), last = await box(cells.nth(6), 'the last day');
      assert(Math.abs(first.y - last.y) < 2 && first.x < last.x, 'the seven days are one row');
      assert.equal(labels.filter((l) => l.endsWith(', today')).length, 1, 'one day says "today"');
      const todayLabel = labels.find((l) => l.endsWith(', today'));
      await eventually(() => isSelected(cellNamed(page, todayLabel)), (v) => v === 'true', { what: 'today is picked when the screen opens' });
      const startTitle = titleOf(todayLabel);
      await page.getByText(startTitle, { exact: true }).first().waitFor(); // the heading, or the line under the name of a saint when the day has a memorial
      await eventually(() => page.getByRole('button', { name: 'Today', exact: true }).count(), (n) => n === 0, { what: 'the number of Today buttons while today is picked' });
      step('tap another day: it is picked and the liturgical title becomes its own');
      const other = labels.find((l) => !l.endsWith(', today'));
      assert.notEqual(titleOf(other), startTitle, 'two days of a week have two names');
      await cellNamed(page, other).click();
      await eventually(() => isSelected(cellNamed(page, other)), (v) => v === 'true', { what: 'the day that was tapped is picked' });
      await eventually(() => isSelected(cellNamed(page, todayLabel)), (v) => v === 'false', { what: 'today is not picked any more' });
      await page.getByText(titleOf(other), { exact: true }).first().waitFor();
      await eventually(() => page.getByText(startTitle, { exact: true }).count(), (n) => n === 0, { what: 'the number of lines with the old title' });
      step('Today shows now, and brings the screen back to today');
      await page.getByRole('button', { name: 'Today', exact: true }).click();
      await eventually(() => isSelected(cellNamed(page, todayLabel)), (v) => v === 'true', { what: 'today is picked again' });
      await page.getByText(startTitle, { exact: true }).first().waitFor();
      await eventually(() => page.getByRole('button', { name: 'Today', exact: true }).count(), (n) => n === 0, { what: 'the number of Today buttons once today is picked again' });
      step('the arrows move the picked day a week: the strip shows another week and the same weekday');
      const before = labels.map((l) => l.split(',')[0]);
      await page.getByRole('button', { name: /^Next week/ }).click();
      await eventually(async () => (await stripCells(page)).labels.map((l) => l.split(',')[0]).join('|'), (v) => v !== before.join('|'), { what: 'the days of the strip after Next week' });
      await page.getByRole('button', { name: 'Today', exact: true }).waitFor();
      await page.getByRole('button', { name: /^Previous week/ }).click();
      await eventually(async () => (await stripCells(page)).labels.map((l) => l.split(',')[0]).join('|'), (v) => v === before.join('|'), { what: 'the days of the strip after Previous week' });
      step('under it: the liturgical card (season and colour, the two cycles, the small print) and the readings card; no sample, no notice, no handwritten line');
      for (const text of ['Liturgical day', 'Season', 'Sunday cycle', 'Weekday cycle', LITURGY_NOTE, 'Readings']) await page.getByText(text, { exact: true }).first().waitFor();
      for (const gone of ['Preview', 'Sample', 'Buen Camino']) await eventually(() => page.getByText(gone).count(), (n) => n === 0, { what: `the number of "${gone}" on the Daily reading` });
      const rows = page.getByRole('button', { name: READING_ROW });
      const count = await rows.count();
      if (count === 0) {
        step('a day the app has no readings for says so (or every reference of the day has no words)');
        const said = await page.getByText(NO_READINGS, { exact: true }).count();
        if (said === 0) await page.getByText(/^(First Reading|Responsorial Psalm|Second Reading|Gospel)$/).first().waitFor();
      } else {
        step('a reading opens its words and closes them again');
        const first = rows.first();
        assert.equal(await first.getAttribute('aria-expanded'), 'false');
        await first.click();
        await eventually(() => first.getAttribute('aria-expanded'), (v) => v === 'true', { what: 'the first reading says it is open' });
        await first.click();
        await eventually(() => first.getAttribute('aria-expanded'), (v) => v === 'false', { what: 'the first reading says it is closed' });
        await page.getByText(READINGS_SOURCE, { exact: true }).waitFor();
      }
    },
  },
  {
    name: 'Daily reading: the Calendar button opens the sheet; Escape, Close and a tap outside close it; a day chosen in it closes it and moves the strip to its week; Today picks today',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      await openDaily(ctx);
      const dialog = page.getByRole('dialog');
      const open = async () => { await page.getByRole('button', { name: 'Open calendar', exact: true }).click(); await dialog.waitFor(); };
      const closed = (what) => eventually(() => dialog.count(), (n) => n === 0, { what: `the number of sheets ${what}` });
      step('the Calendar button opens a sheet with its title, a Close button and the month calendar');
      await open();
      await dialog.getByRole('heading', { name: 'Calendar', exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Close calendar', exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Today', exact: true }).waitFor();
      await dialog.getByRole('button', { name: /^Next month, / }).waitFor();
      const days = dialog.getByRole('button', { name: new RegExp(`^${WEEKDAY} \\d{1,2} ${MONTH} \\d{4}`) });
      await eventually(() => days.count(), (n) => n >= 28 && n <= 31, { what: 'the number of days of the month in the sheet' });
      const sheet = await box(dialog.getByRole('heading', { name: 'Calendar', exact: true }), 'the title of the sheet');
      assert(sheet.y > 100, 'the sheet is a sheet from the bottom, not the whole screen');
      step('Escape closes it');
      await page.keyboard.press('Escape');
      await closed('after Escape');
      step('Close closes it');
      await open();
      await dialog.getByRole('button', { name: 'Close calendar', exact: true }).click();
      await closed('after Close');
      step('a tap on the dimmed part outside it closes it');
      await open();
      await page.getByRole('button', { name: 'Close the calendar', exact: true }).click({ position: { x: 6, y: 6 } });
      await closed('after a tap outside it');
      step('nothing changed by closing it: the picked day is still today');
      const { labels } = await stripCells(page);
      const todayLabel = labels.find((l) => l.endsWith(', today'));
      assert(todayLabel, 'today is in the strip');
      await eventually(() => isSelected(cellNamed(page, todayLabel)), (v) => v === 'true', { what: 'today is still picked' });
      step('a day chosen in the sheet closes it, picks the day and moves the strip to its week');
      const todayNumber = Number(/^\w+ (\d{1,2}) /.exec(todayLabel)[1]);
      const want = todayNumber === 28 ? 27 : 28;
      await open();
      await dialog.getByRole('button', { name: new RegExp(`^${WEEKDAY} ${want} ${MONTH} \\d{4}`) }).click();
      await closed('after a day was chosen');
      const picked = page.getByRole('button', { name: new RegExp(`^${WEEKDAY} ${want} ${MONTH}, `) });
      await eventually(() => picked.count(), (n) => n === 1, { what: `the number of days of the strip that are the ${want}th` });
      await eventually(() => isSelected(picked), (v) => v === 'true', { what: `the ${want}th is picked` });
      const pickedLabel = await labelOf(picked);
      await page.getByRole('heading', { name: titleOf(pickedLabel), exact: true }).waitFor();
      const week = (await stripCells(page)).labels;
      assert(week.includes(pickedLabel), 'the strip is the week of the day that was chosen');
      step('the sheet opens on the month of the picked day, and its Today picks today and closes it');
      await open();
      await dialog.getByRole('button', { name: 'Today', exact: true }).click();
      await closed('after Today');
      await eventually(() => isSelected(cellNamed(page, todayLabel)), (v) => v === 'true', { what: 'today is picked after Today' });
      await page.getByRole('heading', { name: titleOf(todayLabel), exact: true }).waitFor();
    },
  },
  {
    name: 'Daily reading: the Bookmark button toggles and the day is kept; it is a row of Bookmarks ("Daily reading", the date, the liturgical title) that opens the Daily reading on that date',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      await openDaily(ctx);
      const bookmark = page.getByRole('button', { name: 'Bookmark this day', exact: true });
      const marked = page.getByRole('button', { name: 'Remove bookmark', exact: true });
      const { labels } = await stripCells(page);
      const todayLabel = labels.find((l) => l.endsWith(', today'));
      const todayTitle = titleOf(todayLabel);
      const todayWords = /^(\w+ \d{1,2} \w+), /.exec(todayLabel)[1]; // "Sunday 8 November"
      step('the Bookmark button says what a tap does and exposes its state: tap it, the day is bookmarked');
      assert.equal(await bookmark.getAttribute('aria-selected'), 'false');
      await bookmark.click();
      await marked.waitFor();
      assert.equal(await marked.getAttribute('aria-selected'), 'true');
      step('the bookmark is kept on the phone: it is still there when the screen is opened again');
      await go('/library/daily');
      await marked.waitFor();
      step('the day is a row on the Bookmarks screen: "Daily reading", the date, the liturgical title');
      await go('/library/bookmarks');
      await page.getByRole('heading', { name: 'Bookmarks', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Daily reading', exact: true }).waitFor();
      const row = page.getByRole('button', { name: new RegExp(`^Daily reading, ${WEEKDAY} \\d{1,2} ${MONTH} \\d{4}, `) });
      await eventually(() => row.count(), (n) => n === 1, { what: 'the number of Daily reading rows' });
      const rowLabel = await labelOf(row);
      assert(rowLabel.startsWith(`Daily reading, ${todayWords} `), `the row is the day that was bookmarked: ${rowLabel}`);
      assert(rowLabel.endsWith(`, ${todayTitle}`), `the row says the liturgical title: ${rowLabel}`);
      await page.getByText(todayTitle, { exact: true }).first().waitFor();
      await page.getByRole('button', { name: new RegExp(`^Remove bookmark: Daily reading, ${todayWords} `) }).waitFor();
      await eventually(() => page.getByRole('tab').count(), (n) => n === 0, { what: 'the number of tabs shown on Bookmarks (there is no tab bar there)' });
      step('a tap on the row opens the Daily reading on that date, with its bookmark on');
      await row.click();
      await eventually(() => pathOf(page), (p) => p === '/library/daily', { what: 'the address after tapping the row' });
      const date = await eventually(() => new URL(page.url()).searchParams.get('date'), (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? ''), { what: 'the date in the address' });
      const picked = page.getByRole('button', { name: new RegExp(`^${todayWords}, `) }).filter({ visible: true });
      await eventually(() => isSelected(picked.first()), (v) => v === 'true', { what: `the day of ${date} is picked` });
      await page.getByRole('button', { name: 'Remove bookmark', exact: true }).filter({ visible: true }).waitFor();
      step('take the bookmark off there: Back to Bookmarks, and the row is gone');
      await page.getByRole('button', { name: 'Remove bookmark', exact: true }).filter({ visible: true }).click();
      await page.getByRole('button', { name: 'Bookmark this day', exact: true }).filter({ visible: true }).waitFor();
      await page.getByRole('button', { name: 'Back', exact: true }).filter({ visible: true }).click();
      await waitPath(page, '/library/bookmarks', 'the address after Back');
      await eventually(() => page.getByRole('heading', { name: 'Daily reading', exact: true }).filter({ visible: true }).count(), (n) => n === 0, { what: 'the number of Daily reading headings once the day is off' });
    },
  },
  {
    name: 'Daily reading: the readings of a day are references of the Roman Lectionary with the words of the Bible in the app (a memorial is the title, a reference with no words is a line, a day with none says so), and nothing is a sample or under 15 px',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      const labels = () => page.getByRole('button', { name: READING_ROW }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
      step('a Sunday: four readings with their references, the source line, the words of the Gospel from the Bible');
      await openDaily(ctx, '/library/daily?date=2026-11-08');
      await page.getByRole('heading', { name: '32nd Sunday in Ordinary Time', exact: true }).waitFor();
      await eventually(labels, (l) => l.length === 4, { what: 'the number of readings of the Sunday' });
      assert.deepEqual(await labels(), ['First Reading, Wisdom 6:12-16', 'Responsorial Psalm, Psalm 63:2, 3-4, 5-6, 7-8', 'Second Reading, 1 Thessalonians 4:13-18', 'Gospel, Matthew 25:1-13']);
      await page.getByText(READINGS_SOURCE, { exact: true }).waitFor();
      for (const gone of ['Preview', 'Sample', 'Buen Camino']) await eventually(() => page.getByText(gone).count(), (n) => n === 0, { what: `the number of "${gone}"` });
      const gospel = page.getByRole('button', { name: 'Gospel, Matthew 25:1-13', exact: true });
      await gospel.click();
      await eventually(() => gospel.getAttribute('aria-expanded'), (v) => v === 'true', { what: 'the Gospel says it is open' });
      await page.getByText(/Then the Kingdom of Heaven will be like ten virgins who took their lamps/).waitFor();
      await page.getByText(/Watch therefore, for you don’t know the day nor the hour/).waitFor();
      step('no text of the screen is under 15 px');
      const smallest = await page.evaluate(() => {
        let min = 999, who = '';
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          if (!t.textContent.trim()) continue;
          const el = t.parentElement, st = getComputedStyle(el), r = el.getBoundingClientRect();
          if (st.visibility === 'hidden' || st.display === 'none' || r.width === 0 || r.height === 0) continue;
          const size = parseFloat(st.fontSize);
          if (size < min) { min = size; who = t.textContent.trim().slice(0, 40); }
        }
        return { min, who };
      });
      assert(smallest.min >= 15, `the smallest text of the Daily reading is ${smallest.min} px ("${smallest.who}")`);
      await gospel.click();
      await eventually(() => page.getByText(/Then the Kingdom of Heaven will be like ten virgins/).count(), (n) => n === 0, { what: 'the number of Gospel verses once it is closed' });
      step('the Psalm is shown whole, with its note, one verse to a line');
      const psalm = page.getByRole('button', { name: 'Responsorial Psalm, Psalm 63:2, 3-4, 5-6, 7-8', exact: true });
      await psalm.click();
      await page.getByText(/^God, you are my God\. I will earnestly seek you/).waitFor();
      await page.getByText(WHOLE_PSALM, { exact: true }).waitFor();
      await psalm.click();
      step('on a phone 320 wide nothing runs out of the screen');
      await page.setViewportSize({ width: 320, height: 640 });
      await page.getByText('Wisdom 6:12-16', { exact: true }).waitFor();
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      assert(wide <= 321, `the page is ${wide} wide on a phone of 320`);
      const ref = await box(page.getByText('1 Thessalonians 4:13-18', { exact: true }), 'the reference of the second reading');
      assert(ref.x + ref.width <= 320, `the reference ends at ${ref.x + ref.width} on a phone of 320`);
      await page.setViewportSize({ width: 390, height: 844 });

      step('a weekday with a memorial: the saint is the title, the day of the calendar is under it, no second reading');
      await openDaily(ctx, '/library/daily?date=2026-11-11');
      await page.getByRole('heading', { name: 'Saint Martin of Tours, Bishop', exact: true }).waitFor();
      await page.getByText('Wednesday of the 32nd Week in Ordinary Time', { exact: true }).waitFor();
      await eventually(labels, (l) => l.length === 3, { what: 'the number of readings of the weekday' });
      assert.deepEqual(await labels(), ['First Reading, Titus 3:1-7', 'Responsorial Psalm, Psalm 23:1b-3a, 3bc-4, 5, 6', 'Gospel, Luke 17:11-19']);
      await eventually(() => page.getByText('Rank', { exact: true }).count(), (n) => n === 0, { what: 'the number of Rank lines under a memorial (the calendar of the app does not know the saints)' });

      step('a reference that cannot be shown with confidence is a line, not a button');
      await openDaily(ctx, '/library/daily?date=2026-09-08');
      await page.getByRole('heading', { name: 'The Nativity of the Blessed Virgin Mary', exact: true }).waitFor();
      await page.getByText('Micah 5:1-4a', { exact: true }).waitFor();
      await eventually(() => page.getByRole('button', { name: /^First Reading, Micah/ }).count(), (n) => n === 0, { what: 'the number of buttons for a reading with no words' });
      await eventually(labels, (l) => l.length === 2, { what: 'the number of readings with words that day (the psalm and the Gospel)' });

      step('a day the app has no readings for: the day of the calendar and one honest line, no small print');
      await openDaily(ctx, '/library/daily?date=2027-01-17');
      await page.getByRole('heading', { name: '2nd Sunday in Ordinary Time', exact: true }).waitFor();
      await page.getByText(NO_READINGS, { exact: true }).waitFor();
      await eventually(labels, (l) => l.length === 0, { what: 'the number of readings of a day with none' });
      await eventually(() => page.getByText(READINGS_SOURCE, { exact: true }).count(), (n) => n === 0, { what: 'the number of source lines under no readings' });
    },
  },
  {
    name: 'Daily reading: ?date= opens that day (one far outside the five years too) and anything that is not a day opens today',
    persona: 'in',
    async run(ctx) {
      const { page, step } = ctx;
      step('a day in the date of the address: Christmas Day, picked, with its name');
      await openDaily(ctx, '/library/daily?date=2026-12-25');
      const christmas = page.getByRole('button', { name: /^Friday 25 December, The Nativity of the Lord \(Christmas Day\)/ });
      await eventually(() => christmas.count(), (n) => n === 1, { what: 'the number of days of the strip that are Christmas Day' });
      await eventually(() => isSelected(christmas), (v) => v === 'true', { what: 'Christmas Day is picked' });
      await page.getByRole('heading', { name: 'The Nativity of the Lord (Christmas Day)', exact: true }).waitFor();
      step('a day far outside the five years the calendar goes to (a bookmark kept for years still opens)');
      await openDaily(ctx, '/library/daily?date=2019-03-03');
      const old = page.getByRole('button', { name: /^Sunday 3 March, 8th Sunday in Ordinary Time/ });
      await eventually(() => isSelected(old), (v) => v === 'true', { what: 'the 3 March 2019 is picked' });
      await page.getByRole('heading', { name: '8th Sunday in Ordinary Time', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Today', exact: true }).waitFor();
      for (const bad of ['2026-02-30', '2026-13-01', '2026-1-5', 'nonsense', '']) {
        step(`"${bad}" is not a day: the screen opens on today`);
        await openDaily(ctx, `/library/daily?date=${bad}`);
        const today = todayCell(page);
        await eventually(() => today.count(), (n) => n === 1, { what: `the number of days that say today after date=${bad}` });
        await eventually(() => isSelected(today), (v) => v === 'true', { what: `today is picked after date=${bad}` });
        await eventually(() => page.getByRole('button', { name: 'Today', exact: true }).count(), (n) => n === 0, { what: `the number of Today buttons after date=${bad}` });
      }
    },
  },
];
