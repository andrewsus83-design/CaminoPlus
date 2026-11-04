import { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { c, radius, role } from '@/theme';

const TABS = ['Journey', 'Passport', 'Plan'] as const;

export default function Me() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Journey');
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ width: 84, height: 84, borderRadius: radius.pill, backgroundColor: c.goldSoft, borderWidth: 3, borderColor: c.gold }} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="h3">Pilgrim</AppText>
          <AppText variant="mono" color={role.accentText}>camino.plus/you</AppText>
        </View>
      </View>
      <AppText variant="accent" color={role.accentText}>Buen Camino!</AppText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {TABS.map((t) => (<Pill key={t} label={t} variant="ghost" selected={tab === t} onPress={() => setTab(t)} />))}
      </View>
      <AppText muted>{tab} content comes next. See /design for the reference screens.</AppText>
    </Screen>
  );
}
