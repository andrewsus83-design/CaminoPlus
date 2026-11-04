import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Avatar, Card, IconButton, Photo, SubTabs } from '@/components/ui';
import { journey, plan, stamps } from '@/data/mock';
import { c, layout, radius, role, shadowStyle } from '@/theme';

const TABS = ['Journey', 'Passport', 'Plan'] as const;

export default function Me() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Journey');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Avatar size={84} ring />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="h3">Ana Torres</AppText>
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: c.goldWash, justifyContent: 'center' }}>
              <AppText variant="mono" color={role.accentText} style={{ fontSize: 12 }}>camino.plus/ana</AppText>
            </View>
          </View>
          <IconButton name="bell" label="Notifications, 3 new" badge={3} onPress={() => router.push('/inbox')} flat />
        </View>
        <AppText variant="accent" color={role.accentText}>Buen Camino!</AppText>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[['312', 'km walked'], ['14', 'stages'], ['6', 'stamps']].map(([n, l]) => (
            <Card key={l} style={{ flex: 1, padding: 16, alignItems: 'center' }}>
              <AppText variant="h4">{n}</AppText>
              <AppText variant="caption" muted>{l}</AppText>
            </Card>
          ))}
        </View>
        <SubTabs tabs={TABS} value={tab} onChange={setTab} />

        {tab === 'Journey' && journey.map((j) => (
          <Card key={j.id} style={{ gap: 12 }}>
            <Photo tint={j.tint} height={180} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="label">{j.place} · {j.km} km</AppText>
              <AppText variant="mono" muted style={{ fontSize: 12 }}>{j.when}</AppText>
            </View>
            <AppText variant="small">{j.text}</AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="heart" color={c.red} size={18} />
              <AppText variant="caption" muted>{j.likes}</AppText>
            </View>
          </Card>
        ))}

        {tab === 'Passport' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {stamps.map((s) => (
              <Card key={s.id} style={{ width: '47.5%', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 72, height: 72, borderRadius: radius.pill, backgroundColor: s.tint, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="shell" color={c.blue} size={32} />
                </View>
                <AppText variant="label">{s.name}</AppText>
                <AppText variant="mono" muted style={{ fontSize: 12 }}>{s.date}</AppText>
              </Card>
            ))}
          </View>
        )}

        {tab === 'Plan' && plan.map((p) => (
          <Card key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
            <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: p.done ? c.successWash : c.sand200, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={p.done ? 'check' : 'flag'} color={p.done ? c.success : c.stone600} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{p.stage}</AppText>
              <AppText variant="caption" muted>{p.km} km</AppText>
            </View>
          </Card>
        ))}
      </Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Write a journey post" onPress={() => router.push('/write')} style={{ position: 'absolute', right: layout.screenMargin, bottom: insets.bottom + 96, width: 60, height: 60, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', ...shadowStyle('gold') }}>
        <Icon name="pen" color={c.blue} size={26} />
      </Pressable>
    </View>
  );
}
