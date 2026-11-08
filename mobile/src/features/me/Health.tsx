import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { Card } from '@/components/ui';
import { c, layout, radius, role, space } from '@/theme';

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

/** The round behind the watch on the hero card: the cream of the card's own words (role.onInverse) at 14%, a layer of its own so that the icon above it keeps its full colour. */
function WatchRound({ children }: { children: ReactNode }) {
  return (
    <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.pill, backgroundColor: role.onInverse, opacity: 0.14 }} />
      {children}
    </View>
  );
}

export function Health({ watchConnected = false }: { watchConnected?: boolean }) {
  const router = useRouter();
  const tip = TIPS[Math.floor(Date.now() / 86400000) % TIPS.length];
  return (
    <View style={{ gap: space[4] }}>
      {!watchConnected && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/watches')} style={{ borderRadius: radius.lg, backgroundColor: role.inverse, padding: layout.cardPadding, flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
          <WatchRound>
            <Icon name="watch" color={c.goldBright} size={32} />
          </WatchRound>
          <View style={{ flex: 1, gap: space[1] }}>
            <AppText variant="label" color={role.onInverse}>Connect your smartwatch</AppText>
            <AppText variant="small" color={role.onInverse} style={{ opacity: 0.85 }}>See your steps, heart rate and sleep here.</AppText>
          </View>
          <Icon name="chevron" color={role.highlight} size={24} />
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {METRICS.map((m) => (
          <Card key={m.id} style={{ width: '48%', flexGrow: 1, gap: space[2], padding: space[4] }}>
            <Icon name={m.icon} color={m.id === 'hr' || m.id === 'rest' ? role.danger : role.action} size={24} />
            <AppText variant="h3">–</AppText>
            <AppText variant="caption" muted>{m.label} · {m.unit}</AppText>
          </Card>
        ))}
      </View>

      <Card style={{ gap: space[2], backgroundColor: c.goldWash }}>
        <AppText variant="mono" color={role.accentText} style={{ textTransform: 'uppercase' }}>Tip of the day</AppText>
        <AppText variant="h4">{tip.title}</AppText>
        <AppText variant="small">{tip.body}</AppText>
      </Card>

      <AppText variant="label">More tips for the walk</AppText>
      {TIPS.filter((t) => t !== tip).map((t) => (
        <Card key={t.title} style={{ gap: space[1] }}>
          <AppText variant="label">{t.title}</AppText>
          <AppText variant="small" muted>{t.body}</AppText>
        </Card>
      ))}
      <AppText variant="caption" muted>General walking tips, not medical advice. If you feel unwell, stop and ask for help.</AppText>
    </View>
  );
}
