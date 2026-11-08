import { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/ui';
import { liturgical, radius, role, space } from '@/theme';
import type { Ymd } from './calendar';
import { COLOUR_NAMES, LITURGY_NOTE, RANK_NAMES, SEASON_NAMES, liturgicalDayOf } from './liturgy';

// The liturgical day of the picked day, under the week strip: what the day is called (Fraunces: the memorial or feast of the readings file when it names one, else the title of the
// calendar), under it the day of the calendar when the title is a memorial, then its season with the dot of its colour, its rank and the two cycles. The season, the colour,
// the rank and the cycles are worked out on the phone from the General Roman Calendar (liturgy.ts), so they are real; the small print at the bottom says what it is worked out from
// and what a country may change. The rank is left out under a memorial: liturgy.ts does not know the memorials of the saints, so the rank it has is the one of the weekday. The title is
// a polite live region, so a screen reader says the new day when another one is picked (Android and the web; iOS is told by the hook).
const EYEBROW = { textTransform: 'uppercase' } as const;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 32 }}>
      <AppText variant="small" muted>{label}</AppText>
      <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>{children}</View>
    </View>
  );
}

/** `title` is what the day is called and `under` the day of the calendar under a memorial (content.ts dayContent), the two of them worked out in one place for the banner and for this card. */
export function LiturgicalCard({ day, title, under }: { day: Ymd; title: string; under: string | null }) {
  const lit = liturgicalDayOf(day);
  return (
    <Card style={{ gap: space[3] }}>
      <AppText variant="mono" muted style={EYEBROW}>Liturgical day</AppText>
      <View style={{ gap: space[1] }}>
        <AppText variant="h4" accessibilityRole="header" accessibilityLiveRegion="polite">{title}</AppText>
        {!!under && <AppText variant="small" muted>{under}</AppText>}
      </View>
      <View style={{ gap: space[1] }}>
        <Fact label="Season">
          <View aria-hidden style={{ width: 12, height: 12, borderRadius: radius.pill, backgroundColor: liturgical[lit.colour], borderWidth: lit.colour === 'white' ? 1.5 : 0, borderColor: role.muted }} />
          <AppText variant="label" style={{ flexShrink: 1 }}>{`${SEASON_NAMES[lit.season]} · ${COLOUR_NAMES[lit.colour]}`}</AppText>
        </Fact>
        {!under && <Fact label="Rank"><AppText variant="label">{RANK_NAMES[lit.rank]}</AppText></Fact>}
        <Fact label="Sunday cycle"><AppText variant="label">{`Year ${lit.sundayCycle}`}</AppText></Fact>
        <Fact label="Weekday cycle"><AppText variant="label">{`Year ${lit.weekdayCycle}`}</AppText></Fact>
      </View>
      <AppText variant="caption" muted>{LITURGY_NOTE}</AppText>
    </Card>
  );
}
