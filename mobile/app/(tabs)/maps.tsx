import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { cityPois, Layer, MapCanvas } from '@/features/MapCanvas';
import { c, radius, role, shadowStyle } from '@/theme';

const LAYERS: Layer[] = ['Helicopter', 'City'];
const infoFor = (id?: string) => cityPois.find((p) => p.id === id);

export default function Maps() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [layer, setLayer] = useState<Layer>('Helicopter');
  const [sel, setSel] = useState<string | undefined>('c1');
  const poi = infoFor(sel);
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <MapCanvas layer={layer} width={width} height={height} selected={sel} onSelect={setSel} />
      <View style={{ position: 'absolute', top: insets.top + 8, left: 24, right: 24, gap: 10 }}>
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: role.surface, ...shadowStyle('md') }}>
          {LAYERS.map((l) => (
            <Pressable key={l} onPress={() => setLayer(l)} style={{ height: 40, paddingHorizontal: 18, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: layer === l ? c.blue : 'transparent' }}>
              <AppText variant="label" color={layer === l ? c.parchment : c.blue}>{l}</AppText>
            </Pressable>
          ))}
        </View>
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 28, borderRadius: radius.pill, backgroundColor: c.successWash }}>
          <Icon name="check" color={c.success} size={14} />
          <AppText variant="caption" color={c.success}>Offline pack ready · updated 2 h ago</AppText>
        </View>
      </View>
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 96, padding: 20, borderRadius: radius.lg, backgroundColor: role.surface, gap: 4, ...shadowStyle('lg') }}>
        {layer === 'Helicopter' || !poi ? (
          <>
            <AppText variant="h4">St-Jean → Santiago</AppText>
            <AppText variant="small" muted>312 of 780 km walked · 14 stages · next: León</AppText>
          </>
        ) : (
          <>
            <AppText variant="h4">{poi.label}</AppText>
            <AppText variant="small" muted>{poi.kind === 'church' ? 'Gothic cathedral, 1221. Audio story 2 min.' : poi.kind === 'quest' ? 'Scavenger hunt: find the pilgrim statue. +50 XP.' : 'Tap for details.'}</AppText>
          </>
        )}
      </View>
    </View>
  );
}
