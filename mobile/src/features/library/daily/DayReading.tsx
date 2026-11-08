import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { SampleNotice, SampleTag } from '@/components/SampleNotice';
import { Card } from '@/components/ui';
import { role, space } from '@/theme';
import type { Ymd } from './calendar';
import { READING_TITLES, SAMPLE_CITATION, dayContent, type Passage, type Reflection } from './content';
import { dateKey } from './datekey';
import { LiturgicalCard } from './LiturgicalCard';
import { DAILY_NOTICE } from './sample';

// What is under the week strip, one calm scroll: the liturgical day (real, worked out on the phone), then the Preview notice, the readings (each
// a row with its citation, and its text when it is opened) and the reflection. The readings and the reflection come from dayContent (content.ts),
// the one place a real source will plug in; today they are examples and say so: the notice, the "Sample" tag on each card, and the words of the
// rows. The screen asks for nothing but the day it was given and draws what it gets.

/** The small line over a card: mono (the 15 of the type scale), capitals, muted, like the label of the Bible tab's "Today's reading" card. */
const EYEBROW = { textTransform: 'uppercase' } as const;

function CardTop({ label, sample }: { label: string; sample: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AppText variant="mono" muted style={EYEBROW}>{label}</AppText>
      {sample && <SampleTag />}
    </View>
  );
}

/** One reading: its name and citation, and under them, when it is opened, its text with small muted verse numbers and one quiet line of credit. */
function ReadingRow({ passage, first }: { passage: Passage; first: boolean }) {
  const [open, setOpen] = useState(false);
  const title = READING_TITLES[passage.kind];
  const citation = passage.citation ?? SAMPLE_CITATION;
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: role.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${citation}`}
        accessibilityHint={open ? 'Hides the text' : 'Shows the text'}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingVertical: space[3], opacity: pressed ? 0.6 : 1 })}
      >
        <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
          <AppText variant="label">{title}</AppText>
          <AppText variant="mono" muted>{citation}</AppText>
        </View>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Icon name="chevron" color={role.muted} /></View>
      </Pressable>
      {open && (
        <View style={{ gap: space[2], paddingBottom: space[4] }}>
          {passage.lines.map((line, i) => (
            <AppText key={i} variant="body">{line.n !== undefined && <AppText variant="caption" muted>{`${line.n} `}</AppText>}{line.text}</AppText>
          ))}
          {!!passage.credit && <AppText variant="caption" muted>{passage.credit}</AppText>}
        </View>
      )}
    </View>
  );
}

function ReflectionCard({ reflection, sample }: { reflection: Reflection; sample: boolean }) {
  return (
    <Card style={{ gap: space[3] }}>
      <CardTop label={reflection.label} sample={sample} />
      <AppText variant="h4" accessibilityRole="header">{reflection.title}</AppText>
      <View style={{ gap: space[3] }}>
        {reflection.paragraphs.map((text, i) => <AppText key={i} variant="small">{text}</AppText>)}
      </View>
      <AppText variant="caption" muted>{reflection.source}</AppText>
    </Card>
  );
}

export function DayReading({ day }: { day: Ymd }) {
  const key = dateKey(day);
  const content = useMemo(() => dayContent(key), [key]);
  return (
    <View style={{ gap: space[4] }}>
      <LiturgicalCard day={day} />
      {content.sample && <SampleNotice title="Preview">{DAILY_NOTICE}</SampleNotice>}
      {content.passages.length > 0 && (
        // keyed by the day, so that a text opened on one day is closed again on the next
        <Card key={key} style={{ paddingVertical: space[3] }}>
          <View style={{ paddingBottom: space[1] }}><CardTop label="Readings" sample={content.sample} /></View>
          {content.passages.map((p, i) => <ReadingRow key={p.kind} passage={p} first={i === 0} />)}
        </Card>
      )}
      {content.reflections.map((r) => <ReflectionCard key={r.title} reflection={r} sample={content.sample} />)}
      {/* The one handwritten line of the screen. */}
      <AppText variant="accent" color={role.accentText} style={{ textAlign: 'center', marginTop: space[2] }}>Buen Camino</AppText>
    </View>
  );
}
