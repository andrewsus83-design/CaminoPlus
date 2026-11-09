import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, IconButton } from '@/components/ui';
import { c, icon, radius, role, space } from '@/theme';

const steps = [
  { title: 'Details sent', note: 'In your email to the team', state: 'done' },
  { title: 'Listings open', note: 'We write to you that day', state: 'now' },
  { title: 'We check your place', note: 'By hand, before it goes live', state: 'next' },
  { title: 'Live in Stays', note: 'With the Verified owner badge', state: 'next' },
] as const;

export default function BusinessStatus() {
  const router = useRouter();
  return (
    <Screen>
      <IconButton name="close" label="Close" onPress={() => router.dismissTo('/settings')} />
      <View style={{ alignItems: 'center', gap: space[3] }}>
        <View style={{ width: 84, height: 84, borderRadius: radius.pill, backgroundColor: c.goldWash, borderWidth: 2, borderColor: c.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="shell" color={role.accentText} size={icon.lg} />
        </View>
        <AppText variant="h2" style={{ textAlign: 'center' }}>Thanks! We have your details</AppText>
        <AppText variant="body" muted style={{ textAlign: 'center' }}>Business listings open soon. We will write to you the day they do.</AppText>
      </View>
      <Card style={{ gap: space[5] }}>
        {steps.map((s, i) => (
          <View key={s.title} style={{ flexDirection: 'row', gap: space[4], alignItems: 'center' }}>
            {/* 40, so that the number keeps 9 px from the outline of its circle */}
            <View style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: s.state === 'done' ? role.action : s.state === 'now' ? role.highlight : role.sunken }}>
              {s.state === 'done' ? <Icon name="check" color={role.onAction} size={icon.smPlus} /> : <AppText variant="caption" color={s.state === 'now' ? role.onHighlight : role.action}>{i + 1}</AppText>}
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{s.title}</AppText>
              <AppText variant="caption" muted>{s.note}</AppText>
            </View>
          </View>
        ))}
      </Card>
      <AppText variant="small" muted>We never put a place live without checking it first. If we need anything, we will write to the email you used.</AppText>
      <Pill variant="ghost" label="See a sample dashboard" onPress={() => router.replace('/business/dashboard')} />
    </Screen>
  );
}
