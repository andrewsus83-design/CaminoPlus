// The real readings and the real Bible, handed to content.ts. This is the one place of the Daily reading that `require`s the files (through readings.generated.ts and bible/text.ts), so
// the logic stays in plain files that node can run and the tests cover this one by reading it (daily.test.ts, "the wiring"), and by running it (readings.test.ts).
// What the screens import: dayContent for the screen under the week strip, dayBrief for the banner of the Bible tab.
import { hasBook, loadBook } from '../bible/text';
import { makeContent } from './content';
import { READINGS_FILES } from './readings.generated';
import { makeReadingsLookup } from './readingsCore';

const content = makeContent({ lookup: makeReadingsLookup(READINGS_FILES), source: { hasBook, loadBook } });

export const dayContent = content.dayContent;
export const dayBrief = content.dayBrief;
