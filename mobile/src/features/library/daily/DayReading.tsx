import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { SampleNotice, SampleTag } from '@/components/SampleNotice';
import { Card } from '@/components/ui';
import { readingHeading, type Ymd } from './calendar';
import { DAILY_NOTICE, readingFor, type SampleReading, type SampleReflection } from './sample';

// What is under the calendar: the heading of the chosen day, the Preview notice, one sample reading and one sample reflection. The two
// cards are examples and say so (the notice, the "Sample" labels and the SAMPLE chip), and they are the same for every day (sample.ts).

/** The small line over a heading: mono, capitals, muted, like the label of the Bible tab's "Today's reading" card. */
const EYEBROW = { textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 } as const;

const NO_BREAK = '\u00A0';

function CardTop({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AppText variant="mono" muted style={EYEBROW}>{label}</AppText>
      <SampleTag />
    </View>
  );
}

/** The passage: its reference and translation, the title the translation gives it, and the verses with small, muted numbers. */
function ReadingCard({ reading }: { reading: SampleReading }) {
  return (
    <Card style={{ gap: 12 }}>
      <CardTop label="Sample reading" />
      <View style={{ gap: 2 }}>
        <AppText variant="h4" accessibilityRole="header">{reading.reference}</AppText>
        {/* "public domain" is kept together (no-break space), so on a small phone the line breaks after the dot, never between its two words. */}
        <AppText variant="caption" muted>{`${reading.translation} · ${reading.licence.replace(/ /g, NO_BREAK)}`}</AppText>
      </View>
      <AppText variant="small" muted>{reading.title}</AppText>
      <View style={{ gap: 8 }}>
        {reading.verses.map((v) => (
          <AppText key={v.n} variant="body"><AppText variant="caption" muted>{`${v.n} `}</AppText>{v.text}</AppText>
        ))}
      </View>
    </Card>
  );
}

function ReflectionCard({ reflection }: { reflection: SampleReflection }) {
  return (
    <Card style={{ gap: 12 }}>
      <CardTop label={reflection.label} />
      <AppText variant="h4" accessibilityRole="header">{reflection.title}</AppText>
      <AppText variant="small">{reflection.text}</AppText>
    </Card>
  );
}

export function DayReading({ day, isToday }: { day: Ymd; isToday: boolean }) {
  const heading = readingHeading(day, isToday);
  const { reading, reflection } = readingFor(day);
  return (
    <View style={{ gap: 16 }}>
      {/* One heading for a screen reader ("Today, Sunday 8 November 2026"), said again when another day is picked (Android and the web). */}
      <View accessible accessibilityRole="header" accessibilityLabel={heading.label} accessibilityLiveRegion="polite" style={{ gap: 2 }}>
        <AppText variant="mono" muted style={EYEBROW}>{heading.eyebrow}</AppText>
        <AppText variant="h4">{heading.title}</AppText>
      </View>
      <SampleNotice title="Preview">{DAILY_NOTICE}</SampleNotice>
      <ReadingCard reading={reading} />
      <ReflectionCard reflection={reflection} />
    </View>
  );
}
