import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Card, SectionLabel } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Badge } from '@/features/business/ui';
import { c, radius } from '@/theme';

const rows = {
  Account: [['Email', 'ana@example.com'], ['Password', 'Change']],
  'Plan and storage': [['CaminoPlus', '$12 / year'], ['Extra storage', '$5 per 5 GB / year']],
  Devices: [['Apple Watch', 'Connect'], ['Garmin', 'Connect']],
} as const;

export default function Settings() {
  const router = useRouter();
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
      <View style={{ gap: 8 }}>
        <SectionLabel>For business</SectionLabel>
        <Card style={{ padding: 4 }}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/business')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
            <Icon name="briefcase" color={c.blue} />
            <View style={{ flex: 1 }}>
              <AppText variant="label">List your business</AppText>
              <AppText variant="caption" muted>Albergue, hotel, café, shop or service</AppText>
            </View>
            <Badge label="Free" tone="gold" />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/business/dashboard')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderTopWidth: 1, borderTopColor: c.sand300 }}>
            <Icon name="shield" color={c.blue} />
            <AppText variant="label" style={{ flex: 1 }}>My business dashboard</AppText>
            <Icon name="chevron" color={c.stone600} size={20} />
          </Pressable>
        </Card>
      </View>
    </Screen>
  );
}
