import { View } from 'react-native';
import { AppText } from '../AppText';
import { Icon } from '../Icon';
import { Card } from '../ui';
import { c, radius, role, space } from '@/theme';

/**
 * Selectable row with a colour bar, title, meta line and a check. The Card's own padding (layout.cardPadding, 20) is the room around the text; the gap between the
 * bar, the text and the check is space[3], not the 16 that 14 would round to: with the card padding at 20 instead of 18, 16 would make the text column 8 px narrower than
 * it was and "Roncesvalles to Zubiri · 21.5 km" would wrap its "km" onto a second line on a 390 phone. With 12 the column is exactly as wide as before.
 */
export function Choice({ title, meta, selected, onPress, accent }: { title: string; meta?: string; selected: boolean; onPress: () => void; accent?: string | null }) {
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], borderWidth: 2, borderColor: selected ? role.highlight : 'transparent' }}>
      <View style={{ width: 12, alignSelf: 'stretch', borderRadius: radius.pill, backgroundColor: accent ?? c.goldSoft }} />
      <View style={{ flex: 1, gap: space[1] }}>
        <AppText variant="label">{title}</AppText>
        {!!meta && <AppText variant="caption" muted>{meta}</AppText>}
      </View>
      <View style={{ width: 28, height: 28, borderRadius: radius.pill, borderWidth: selected ? 0 : 1, borderColor: role.border, backgroundColor: selected ? role.highlight : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {/* Navy on gold in both modes: c.blue is light blue in dark mode, and a light blue tick on gold is 1.06 : 1. */}
        {selected && <Icon name="check" color={role.onHighlight} size={18} />}
      </View>
    </Card>
  );
}

export const routeMeta = (r: { start_name: string | null; end_name: string | null; distance_km: number | null; stage_count: number | null }) =>
  [r.start_name && r.end_name ? `${r.start_name} to ${r.end_name}` : null, r.distance_km ? `~${Math.round(r.distance_km)} km` : null, r.stage_count ? `${r.stage_count} stages` : 'Stages coming soon'].filter(Boolean).join(' · ');
