import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { BackButton } from '@/components/BackButton';
import { Badge } from '@/features/business/ui';
import { Card } from '@/components/ui';
import { c, icon, layout, radius, role, space } from '@/theme';

// Watches a pilgrim can link. Connecting needs the watch native modules (next dev build),
// so for now the buttons explain that instead of pretending to pair.
const WATCHES = [
  { id: 'apple', name: 'Apple Watch', note: 'Steps, heart rate and distance via Apple Health', soon: false },
  { id: 'garmin', name: 'Garmin', note: 'Activities and routes from Garmin Connect', soon: false },
  { id: 'galaxy', name: 'Samsung Galaxy Watch', note: 'Health Connect on Android', soon: true },
  { id: 'fitbit', name: 'Fitbit', note: 'Steps and sleep', soon: true },
  { id: 'coros', name: 'Coros', note: 'Long-distance trail tracking', soon: true },
] as const;

export default function Watches() {
  const insets = useSafeAreaInsets();
  const [connected] = useState<string[]>([]);
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + space[10], gap: space[4] }}>
        <BackButton fallback="/me" />
        <View style={{ gap: space[2] }}>
          <AppText variant="h2">Smartwatch</AppText>
          <AppText variant="lead" muted>Connect a watch to add steps, heart rate and distance to your journey posts.</AppText>
        </View>
        {WATCHES.map((w) => (
          <Card key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
            <View style={{ width: 60, height: 60, borderRadius: radius.pill, backgroundColor: role.inverse, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="watch" color={role.highlight} size={icon.lg} />
            </View>
            <View style={{ flex: 1, gap: space[1] }}>
              <AppText variant="label">{w.name}</AppText>
              <AppText variant="caption" muted>{w.note}</AppText>
            </View>
            {w.soon ? (
              <Badge label="Soon" tone="quiet" />
            ) : connected.includes(w.id) ? (
              <AppText variant="label" color={c.success}>Connected</AppText>
            ) : (
              <Pill compact variant="gold" label="Connect" accessibilityLabel={`Connect ${w.name}`} onPress={() => Alert.alert(w.name, 'Pairing arrives in the next app build.')} />
            )}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
