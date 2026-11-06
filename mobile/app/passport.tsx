import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card, IconButton } from '@/components/ui';
import { Empty, ProgressBar, norm, shortDate } from '@/features/me/shared';
import { useMeData } from '@/lib/useMeData';
import { c, layout, radius, role } from '@/theme';

type StampT = NonNullable<ReturnType<typeof useMeData>['stamps']>[number];
type StageT = ReturnType<typeof useMeData>['stages'][number];

/** Passport = the towns of your route as stamp slots. Collected ones are filled in. */
function Passport({ stamps, stages }: { stamps: StampT[]; stages: StageT[] }) {
  const towns: string[] = [];
  stages.forEach((s, i) => {
    if (i === 0 && s.start?.name) towns.push(s.start.name);
    if (s.end?.name && !towns.includes(s.end.name)) towns.push(s.end.name);
  });
  const got = new Set(stamps.map((s) => norm(s.place_name)));
  const collected = towns.filter((t) => got.has(norm(t))).length;
  const extra = stamps.filter((s) => !towns.some((t) => norm(t) === norm(s.place_name)));
  const slot = (name: string, done: boolean, key: string, date?: string) => (
    <View key={key} style={{ width: '33.33%', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
      <View style={{ width: 78, height: 78, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.goldSoft : 'transparent', borderWidth: done ? 0 : 2, borderStyle: 'dashed', borderColor: c.sand300, transform: [{ rotate: done ? '-8deg' : '0deg' }] }}>
        <Icon name="shell" color={done ? c.blue : c.sand300} size={32} />
      </View>
      <AppText variant="caption" color={done ? role.text : role.muted} numberOfLines={2} style={{ textAlign: 'center', fontFamily: done ? 'Inter_600SemiBold' : 'Inter_500Medium' }}>{name}</AppText>
      {!!date && <AppText variant="mono" muted style={{ fontSize: 12 }}>{date}</AppText>}
    </View>
  );
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <AppText variant="h4">Pilgrim passport</AppText>
          <AppText variant="label" color={role.accentText}>{collected} of {towns.length || '-'} towns</AppText>
        </View>
        <ProgressBar value={towns.length ? collected / towns.length : 0} />
        <AppText variant="small" muted>Ask for a sello (stamp) at your albergue, a church or a café each day. For the Compostela certificate, collect two stamps a day on the last 100 km.</AppText>
      </Card>
      {towns.length === 0 && extra.length === 0 && <Empty text="The towns of your route will appear here as stamp slots." />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 20 }}>
        {towns.map((t) => {
          const hit = stamps.find((s) => norm(s.place_name) === norm(t));
          return slot(t, !!hit, `t-${t}`, hit ? shortDate(hit.stamped_at) : undefined);
        })}
        {extra.map((s) => slot(s.place_name ?? 'Stamp', true, s.id, shortDate(s.stamped_at)))}
      </View>
    </View>
  );
}

export default function PassportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stamps, stages } = useMeData();
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <AppText variant="h2">Stamps</AppText>
        {!stamps ? <ActivityIndicator color={role.action} style={{ marginTop: 24 }} /> : <Passport stamps={stamps} stages={stages} />}
      </ScrollView>
    </View>
  );
}
