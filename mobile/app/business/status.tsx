import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, IconButton } from '@/components/ui';
import { c, radius } from '@/theme';

const steps = [
  { title: 'Sent', note: 'Today 10:42', state: 'done' },
  { title: 'In review', note: 'We may call you to confirm', state: 'now' },
  { title: 'Live in Stays', note: 'With the Verified owner badge', state: 'next' },
] as const;

export default function BusinessStatus() {
  const router = useRouter();
  return (
    <Screen>
      <IconButton name="close" label="Close" onPress={() => router.replace('/(tabs)/settings')} flat />
      <View style={{ alignItems: 'center', gap: 10 }}>
        <View style={{ width: 84, height: 84, borderRadius: radius.pill, backgroundColor: c.goldWash, borderWidth: 2, borderColor: c.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="shell" color={c.goldInk} size={40} />
        </View>
        <AppText variant="h2" style={{ textAlign: 'center' }}>Thanks! Your place is in review</AppText>
        <AppText variant="body" muted style={{ textAlign: 'center' }}>We check every place by hand. Most are live within 2 working days.</AppText>
      </View>
      <Card style={{ gap: 18 }}>
        {steps.map((s, i) => (
          <View key={s.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <View style={{ width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: s.state === 'done' ? c.blue : s.state === 'now' ? c.gold : c.sand200 }}>
              {s.state === 'done' ? <Icon name="check" color={c.parchment} size={16} /> : <AppText variant="caption" color={c.blue}>{i + 1}</AppText>}
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{s.title}</AppText>
              <AppText variant="caption" muted>{s.note}</AppText>
            </View>
          </View>
        ))}
      </Card>
      <AppText variant="small" muted>If we need changes you get a note in your inbox, and you can fix it and send it again.</AppText>
      <Pill variant="ghost" label="Go to my business" onPress={() => router.replace('/business/dashboard')} />
    </Screen>
  );
}
