import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { Card } from '@/components/ui';
import { c, radius, role } from '@/theme';

// Health tab: numbers from a connected smartwatch, then walking tips.
// No watch pairing yet (needs the next native build), so metrics show a dash until then.
const METRICS: { id: string; label: string; unit: string; icon: IconName }[] = [
  { id: 'steps', label: 'Steps today', unit: 'steps', icon: 'steps' },
  { id: 'dist', label: 'Distance', unit: 'km', icon: 'flag' },
  { id: 'hr', label: 'Heart rate', unit: 'bpm', icon: 'heart' },
  { id: 'rest', label: 'Resting heart rate', unit: 'bpm', icon: 'heart' },
  { id: 'active', label: 'Active time', unit: 'min', icon: 'watch' },
  { id: 'sleep', label: 'Sleep', unit: 'h', icon: 'bell' },
];

const TIPS = [
  { title: 'Drink before you are thirsty', body: 'Sip water every 20 to 30 minutes and fill up at every fountain. Add a pinch of salt or an electrolyte tablet on hot days.' },
  { title: 'Start early, finish before the heat', body: 'Leave at first light in summer. The meseta has almost no shade after midday.' },
  { title: 'Look after your feet first', body: 'Stop at the first hot spot, not the first blister. Dry socks at lunch and air your feet on every long break.' },
  { title: 'Walk at a talking pace', body: 'If you cannot hold a conversation, slow down. A steady pace beats a fast morning and a painful afternoon.' },
  { title: 'Eat small, eat often', body: 'Snack on nuts, fruit or bread every hour or two. Keep the pilgrim dinner for recovery.' },
  { title: 'Sleep and rest days matter', body: 'Plan a short stage after a long one, and take a rest day every week or so. Sore shins are a signal to stop.' },
  { title: 'Protect your skin', body: 'Sunscreen, a hat and sunglasses, even on cloudy days. Reapply at lunch.' },
];

export function Health({ watchConnected = false }: { watchConnected?: boolean }) {
  const router = useRouter();
  const tip = TIPS[Math.floor(Date.now() / 86400000) % TIPS.length];
  return (
    <View style={{ gap: 16 }}>
      {!watchConnected && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/watches')} style={{ borderRadius: radius.lg, backgroundColor: c.blue, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ width: 56, height: 56, borderRadius: radius.pill, backgroundColor: 'rgba(246,239,226,0.14)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="watch" color={c.gold} size={30} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label" color={c.parchment}>Connect your smartwatch</AppText>
            <AppText variant="small" color={c.parchment} style={{ opacity: 0.85 }}>See your steps, heart rate and sleep here.</AppText>
          </View>
          <Icon name="chevron" color={c.gold} size={22} />
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {METRICS.map((m) => (
          <Card key={m.id} style={{ width: '48%', flexGrow: 1, gap: 6, padding: 16 }}>
            <Icon name={m.icon} color={m.id === 'hr' || m.id === 'rest' ? c.red : c.blue} size={22} />
            <AppText variant="h3">–</AppText>
            <AppText variant="caption" muted>{m.label} · {m.unit}</AppText>
          </Card>
        ))}
      </View>

      <Card style={{ gap: 8, backgroundColor: c.goldWash }}>
        <AppText variant="mono" color={role.accentText} style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 }}>Tip of the day</AppText>
        <AppText variant="h4">{tip.title}</AppText>
        <AppText variant="small">{tip.body}</AppText>
      </Card>

      <AppText variant="label">More tips for the walk</AppText>
      {TIPS.filter((t) => t !== tip).map((t) => (
        <Card key={t.title} style={{ gap: 4 }}>
          <AppText variant="label">{t.title}</AppText>
          <AppText variant="small" muted>{t.body}</AppText>
        </Card>
      ))}
      <AppText variant="caption" muted>General walking tips, not medical advice. If you feel unwell, stop and ask for help.</AppText>
    </View>
  );
}
