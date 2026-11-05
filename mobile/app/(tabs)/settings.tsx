import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Card, SectionLabel } from '@/components/ui';
import { c, radius } from '@/theme';

const rows = {
  Account: [['Email', 'ana@example.com'], ['Password', 'Change']],
  'Plan and storage': [['CaminoPlus', '$12 / year'], ['Extra storage', '$5 per 5 GB / year']],
  Devices: [['Apple Watch', 'Connect'], ['Garmin', 'Connect']],
} as const;

export default function Settings() {
  return (
    <Screen>
      <AppText variant="h2">Settings</AppText>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="label">Cloud storage</AppText>
          <AppText variant="mono" muted style={{ fontSize: 12 }}>1.8 of 5 GB</AppText>
        </View>
        <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: c.sand200 }}>
          <View style={{ width: '36%', height: 10, borderRadius: radius.pill, backgroundColor: c.gold }} />
        </View>
      </Card>
      {Object.entries(rows).map(([title, items]) => (
        <View key={title} style={{ gap: 8 }}>
          <SectionLabel>{title}</SectionLabel>
          <Card style={{ padding: 4 }}>
            {items.map(([k, v], i) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: c.sand300 }}>
                <AppText variant="label">{k}</AppText>
                <AppText variant="small" muted>{v}</AppText>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
