import { View } from 'react-native';
import { AppText } from '../AppText';
import { Icon } from '../Icon';
import { Card } from '../ui';
import { c, radius, role } from '@/theme';

/** Selectable row with a colour bar, title, meta line and a check. */
export function Choice({ title, meta, selected, onPress, accent }: { title: string; meta?: string; selected: boolean; onPress: () => void; accent?: string | null }) {
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderWidth: 2, borderColor: selected ? c.gold : 'transparent' }}>
      <View style={{ width: 12, alignSelf: 'stretch', borderRadius: radius.pill, backgroundColor: accent ?? c.goldSoft }} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{title}</AppText>
        {!!meta && <AppText variant="caption" muted>{meta}</AppText>}
      </View>
      <View style={{ width: 28, height: 28, borderRadius: radius.pill, borderWidth: selected ? 0 : 1, borderColor: role.border, backgroundColor: selected ? c.gold : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {selected && <Icon name="check" color={c.blue} size={18} />}
      </View>
    </Card>
  );
}

export const routeMeta = (r: { start_name: string | null; end_name: string | null; distance_km: number | null; stage_count: number | null }) =>
  [r.start_name && r.end_name ? `${r.start_name} to ${r.end_name}` : null, r.distance_km ? `~${Math.round(r.distance_km)} km` : null, r.stage_count ? `${r.stage_count} stages` : 'Stages coming soon'].filter(Boolean).join(' · ');
