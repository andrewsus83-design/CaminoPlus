import { Fragment, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/ui';
import { role, space } from '@/theme';
import type { Ymd } from './calendar';
import { NO_READINGS, READINGS_SOURCE, WHOLE_PSALM_NOTE, type Reading } from './content';
import { dateKey } from './datekey';
import { dayContent } from './dayData';
import { LiturgicalCard } from './LiturgicalCard';
import { runsOf, type PassageText } from './reference';

// What is under the week strip, one calm scroll: the liturgical day (real, worked out on the phone), then the readings of the day, each a row with its name and its reference and, when
// the reference can be shown with confidence, its words when the row is opened. The readings are the references of the Roman Lectionary for the days we have (assets/library/daily,
// content.ts), the words are read from the Bible inside the app (the World English Bible, Catholic edition), and a day we have no readings for says so instead of showing anything
// else. The screen asks for nothing but the day it was given and draws what it gets. The one line of small print under the readings says where readings and words come from.

/** The small line over a card: mono (the 15 of the type scale), capitals, muted, like the label of the Bible tab's "Today's reading" card. */
const EYEBROW = { textTransform: 'uppercase' } as const;

/**
 * The words of a reading. Prose (a first reading, a second reading, the Gospel): each run of verses is one paragraph with its small muted verse numbers in it. A psalm is poetry:
 * each verse is a line of its own. A psalm shown whole says so under the words.
 */
function PassageBody({ text, poem }: { text: PassageText; poem: boolean }) {
  const runs = useMemo(() => runsOf(text.lines), [text]);
  return (
    <View style={{ gap: space[3], paddingBottom: space[4] }}>
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
      {text.whole && <AppText variant="caption" muted>{WHOLE_PSALM_NOTE}</AppText>}
    </View>
  );
}

/** One reading: its name and reference and, when there are words to show, a button that opens them and closes them again. A reference with no words under it is only a line. */
function ReadingRow({ reading, first }: { reading: Reading; first: boolean }) {
  const [open, setOpen] = useState(false);
  const label = `${reading.title}, ${reading.reference}`;
  const head = (
    <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
      <AppText variant="label">{reading.title}</AppText>
      <AppText variant="mono" muted>{reading.reference}</AppText>
    </View>
  );
  const border = { borderTopWidth: first ? 0 : 1, borderTopColor: role.border };
  if (!reading.text) {
    return <View accessible accessibilityLabel={label} style={{ ...border, minHeight: 64, justifyContent: 'center', paddingVertical: space[3] }}>{head}</View>;
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
          ? content.readings.map((reading, i) => <ReadingRow key={reading.kind} reading={reading} first={i === 0} />)
          : <AppText variant="small" muted style={{ paddingVertical: space[3] }}>{NO_READINGS}</AppText>}
      </Card>
      {!!content.readings && <AppText variant="caption" muted>{READINGS_SOURCE}</AppText>}
    </View>
  );
}
