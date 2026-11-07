import { View } from 'react-native';
import { AppText } from '../AppText';
import { SectionLabel } from '../ui';
import { guideFor } from '@/data/routeGuide';
import { c, radius, role } from '@/theme';

/** Details shown under a selected Camino: what to expect, areas and highlights. */
export function RouteGuideCard({ slug, stageCount }: { slug: string; stageCount?: number | null }) {
  const g = guideFor(slug);
  if (!g) return null;
  return (
    <View style={{ gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border }}>
      <AppText variant="body">{g.summary}</AppText>
      <View style={{ gap: 8 }}>
        <SectionLabel>Areas and stages</SectionLabel>
        {g.areas.map((a, i) => (
          <View key={a.name} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: role.action, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
              <AppText variant="caption" color={c.parchment}>{i + 1}</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{a.name}</AppText>
              <AppText variant="small" muted>{a.note}</AppText>
            </View>
          </View>
        ))}
      </View>
      <View style={{ gap: 6 }}>
        <SectionLabel>What you will see</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {g.see.map((s) => (
            <View key={s} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.goldWash }}>
              <AppText variant="caption" color={c.goldInk}>{s}</AppText>
            </View>
          ))}
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <AppText variant="small"><AppText variant="small" style={{ fontFamily: 'Inter_600SemiBold' }}>Best time: </AppText>{g.best}</AppText>
        <AppText variant="small"><AppText variant="small" style={{ fontFamily: 'Inter_600SemiBold' }}>Terrain: </AppText>{g.terrain}</AppText>
        <AppText variant="small"><AppText variant="small" style={{ fontFamily: 'Inter_600SemiBold' }}>Tip: </AppText>{g.tip}</AppText>
        {!stageCount && <AppText variant="caption" muted>Day-by-day stages for this Camino are coming soon.</AppText>}
      </View>
    </View>
  );
}
