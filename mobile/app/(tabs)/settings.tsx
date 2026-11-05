import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Card, SectionLabel } from '@/components/ui';
import { BusinessCard, IntroSheet } from '@/features/business/BusinessCard';
import { useOwner } from '@/features/business/store';
import { c, radius } from '@/theme';

const rows = {
  Account: [['Email', 'ana@example.com'], ['Password', 'Change']],
  'Plan and storage': [['CaminoPlus', '$12 / year'], ['Extra storage', '$5 per 5 GB / year']],
  Devices: [['Apple Watch', 'Connect'], ['Garmin', 'Connect']],
} as const;

export default function Settings() {
  const router = useRouter();
  const owner = useOwner();
  const [sheet, setSheet] = useState(false);
  const openCard = () => {
    if (owner.state === 'none') setSheet(true);
    else if (owner.state === 'draft' || owner.state === 'changes_requested') router.push('/business/register');
    else if (owner.state === 'in_review') router.push('/business/status');
    else router.push('/business/dashboard');
  };
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
        <BusinessCard state={owner.state} name={owner.draft.name} stepsDone={owner.stepsDone} onPress={openCard} />
      </View>
      <IntroSheet visible={sheet} onClose={() => setSheet(false)}
        onStart={() => { setSheet(false); router.push('/business/register'); }}
        onClaim={() => { setSheet(false); router.push('/business/register?claim=1'); }} />
    </Screen>
  );
}
