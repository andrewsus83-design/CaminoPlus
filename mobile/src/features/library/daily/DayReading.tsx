import { Fragment, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/ui';
import { role, space } from '@/theme';
import type { Ymd } from './calendar';
import { NO_SECOND_READING, NO_WORDS, PASSAGE_NOTES, READINGS_SOURCE, type Reading } from './content';
import { dateKey } from './datekey';
import { dayContent } from './dayData';
import { LiturgicalCard } from './LiturgicalCard';
import { runsOf, type PassageText } from './reference';

// What is under the week strip, one calm scroll: the liturgical day (real, worked out on the phone), then the readings of the day, each a row with its name and its reference and, when
// the reference can be shown with confidence, its words when the row is opened. The readings are the references of the Lectionary for Mass used in the United States for the days we
// have (assets/library/daily, content.ts), the words are read from the Bible inside the app (the World English Bible, Catholic edition), and a day we have no readings for says so (or says
// that the readings differ from country to country) instead of showing anything else. A reference with no words says why under it; a Sunday or a solemnity with no second reading in the
// source says that too. The screen asks for nothing but the day it was given and draws what it gets. The one line of small print under the readings says where readings and words come from.

/** The small line over a card: mono (the 15 of the type scale), capitals, muted, like the label of the Bible tab's "Today's reading" card. */
const EYEBROW = { textTransform: 'uppercase' } as const;

/**
 * The words of a reading. Prose (a first reading, a second reading, the Gospel): each run of verses is one paragraph with its small muted verse numbers in it. A psalm is poetry:
 * each verse is a line of its own. When the words are not exactly what the reference names (a psalm shown whole, a verse shown whole where the reference has a letter) a note
 * says so ABOVE them, where it is read before the words are.
 */
function PassageBody({ text, poem }: { text: PassageText; poem: boolean }) {
  const runs = useMemo(() => runsOf(text.lines), [text]);
  return (
    <View style={{ gap: space[3], paddingBottom: space[4] }}>
      {!!text.note && <AppText variant="caption" muted>{PASSAGE_NOTES[text.note]}</AppText>}
      {poem
        ? runs.flat().map((line, i) => (
            <AppText key={i} variant="body">
              {!!line.n && <AppText variant="caption" muted>{`${line.n} `}</AppText>}
              {line.text}
            </AppText>
          ))
        : runs.map((run, r) => (
            <AppText key={r} variant="body">
              {run.map((line, i) => (
                <Fragment key={i}>
                  {!!line.n && <AppText variant="caption" muted>{`${line.n} `}</AppText>}
                  {i < run.length - 1 ? `${line.text} ` : line.text}
                </Fragment>
              ))}
            </AppText>
          ))}
    </View>
  );
}

/**
 * One reading: its name and reference and, when there are words to show, a button that opens them and closes them again. A reference with no words under it is only a line, and the line
 * under it says why there are no words. A screen reader says the reference in words ("Wisdom, chapter 6, verses 12 to 16"), not as it is written.
 */
function ReadingRow({ reading, first }: { reading: Reading; first: boolean }) {
  const [open, setOpen] = useState(false);
  const label = `${reading.title}, ${reading.spoken}`;
  const why = reading.noWords ? NO_WORDS[reading.noWords] : null;
  const head = (
    <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
      <AppText variant="label">{reading.title}</AppText>
      <AppText variant="mono" muted>{reading.reference}</AppText>
      {!!why && <AppText variant="caption" muted>{why}</AppText>}
    </View>
  );
  const border = { borderTopWidth: first ? 0 : 1, borderTopColor: role.border };
  if (!reading.text) {
    return <View accessible accessibilityLabel={why ? `${label}. ${why}` : label} style={{ ...border, minHeight: 64, justifyContent: 'center', paddingVertical: space[3] }}>{head}</View>;
  }
  return (
    <View style={border}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={open ? 'Hides the text' : 'Shows the text'}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingVertical: space[3], opacity: pressed ? 0.6 : 1 })}
      >
        {head}
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Icon name="chevron" color={role.muted} /></View>
      </Pressable>
      {open && <PassageBody text={reading.text} poem={reading.kind === 'psalm'} />}
    </View>
  );
}

export function DayReading({ day }: { day: Ymd }) {
  const key = dateKey(day);
  const content = useMemo(() => dayContent(key), [key]);
  return (
    <View style={{ gap: space[4] }}>
      <LiturgicalCard day={day} title={content.title} under={content.under} />
      {/* keyed by the day, so that a text opened on one day is closed again on the next */}
      <Card key={key} style={{ paddingVertical: space[3] }}>
        <View style={{ paddingBottom: space[1] }}><AppText variant="mono" muted style={EYEBROW}>Readings</AppText></View>
        {content.readings
          ? content.readings.map((reading, i) => (
              <Fragment key={reading.kind}>
                {content.noSecond && reading.kind === 'gospel' && (
                  <View style={{ borderTopWidth: 1, borderTopColor: role.border, paddingVertical: space[3] }}><AppText variant="caption" muted>{NO_SECOND_READING}</AppText></View>
                )}
                <ReadingRow reading={reading} first={i === 0} />
              </Fragment>
            ))
          : <AppText variant="small" muted style={{ paddingVertical: space[3] }}>{content.unavailable}</AppText>}
      </Card>
      {!!content.readings && <AppText variant="caption" muted>{READINGS_SOURCE}</AppText>}
    </View>
  );
}
