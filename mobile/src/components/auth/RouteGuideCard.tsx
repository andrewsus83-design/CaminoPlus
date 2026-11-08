import { View } from 'react-native';
import { AppText } from '../AppText';
import { SectionLabel } from '../ui';
import { guideFor } from '@/data/routeGuide';
import { c, fonts, layout, radius, role, space } from '@/theme';

/** Details shown under a selected Camino: what to expect, areas and highlights. A card: layout.cardPadding all round. */
export function RouteGuideCard({ slug, stageCount }: { slug: string; stageCount?: number | null }) {
  const g = guideFor(slug);
  if (!g) return null;
  return (
    <View style={{ gap: space[3], padding: layout.cardPadding, borderRadius: radius.lg, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border }}>
      <AppText variant="body">{g.summary}</AppText>
      <View style={{ gap: space[2] }}>
        <SectionLabel>Areas and stages</SectionLabel>
        {g.areas.map((a, i) => (
          <View key={a.name} style={{ flexDirection: 'row', gap: space[3] }}>
            {/* design-lint-ignore: inset the number badge is a 28 px circle that holds one digit: the digit is about 9 px from the outline, only its 21 px line box is taller */}
            <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: role.action, alignItems: 'center', justifyContent: 'center', marginTop: space[1] }}>
              <AppText variant="caption" color={role.onAction}>{i + 1}</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{a.name}</AppText>
              <AppText variant="small" muted>{a.note}</AppText>
            </View>
          </View>
        ))}
      </View>
      <View style={{ gap: space[2] }}>
        <SectionLabel>What you will see</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {g.see.map((s) => (
            <View key={s} style={{ paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.pill, backgroundColor: c.goldWash }}>
              <AppText variant="caption" color={role.accentText}>{s}</AppText>
            </View>
          ))}
        </View>
      </View>
      <View style={{ gap: space[1] }}>
        <AppText variant="small"><AppText variant="small" style={{ fontFamily: fonts.bodyBold }}>Best time: </AppText>{g.best}</AppText>
        <AppText variant="small"><AppText variant="small" style={{ fontFamily: fonts.bodyBold }}>Terrain: </AppText>{g.terrain}</AppText>
        <AppText variant="small"><AppText variant="small" style={{ fontFamily: fonts.bodyBold }}>Tip: </AppText>{g.tip}</AppText>
        {!stageCount && <AppText variant="caption" muted>Day-by-day stages for this Camino are coming soon.</AppText>}
      </View>
    </View>
  );
}
