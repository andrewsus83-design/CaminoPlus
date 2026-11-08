import { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/ui';
import { liturgical, radius, role } from '@/theme';
import type { Ymd } from './calendar';
import { COLOUR_NAMES, LITURGY_NOTE, RANK_NAMES, SEASON_NAMES, liturgicalDayOf } from './liturgy';

// The liturgical day of the picked day, under the week strip: the name of the celebration (Fraunces), its season with the dot of its colour, its
// rank, and the two cycles. All of it is worked out on the phone from the General Roman Calendar (liturgy.ts), so unlike the readings under it
// it is real; the small print at the bottom says what it is worked out from and what a country may change. The title is a polite live region, so
// a screen reader says the new day when another one is picked (Android and the web; iOS is told by the hook).
const EYEBROW = { textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 } as const;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 28 }}>
      <AppText variant="caption" muted>{label}</AppText>
      <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>{children}</View>
    </View>
  );
}

export function LiturgicalCard({ day }: { day: Ymd }) {
  const lit = liturgicalDayOf(day);
  return (
    <Card style={{ gap: 12 }}>
      <AppText variant="mono" muted style={EYEBROW}>Liturgical day</AppText>
      <AppText variant="h4" accessibilityRole="header" accessibilityLiveRegion="polite">{lit.title}</AppText>
      <View style={{ gap: 4 }}>
        <Fact label="Season">
          <View aria-hidden style={{ width: 12, height: 12, borderRadius: radius.pill, backgroundColor: liturgical[lit.colour], borderWidth: lit.colour === 'white' ? 1.5 : 0, borderColor: role.muted }} />
          <AppText variant="label" style={{ flexShrink: 1 }}>{`${SEASON_NAMES[lit.season]} · ${COLOUR_NAMES[lit.colour]}`}</AppText>
        </Fact>
        <Fact label="Rank"><AppText variant="label">{RANK_NAMES[lit.rank]}</AppText></Fact>
        <Fact label="Sunday cycle"><AppText variant="label">{`Year ${lit.sundayCycle}`}</AppText></Fact>
        <Fact label="Weekday cycle"><AppText variant="label">{`Year ${lit.weekdayCycle}`}</AppText></Fact>
      </View>
      <AppText variant="caption" muted>{LITURGY_NOTE}</AppText>
    </Card>
  );
}
