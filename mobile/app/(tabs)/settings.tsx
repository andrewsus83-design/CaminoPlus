import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Card, SectionLabel } from '@/components/ui';
import { AccountSection, LogoutButton } from '@/components/AccountSection';
import { BusinessCard, IntroSheet } from '@/features/business/BusinessCard';
import { useOwner } from '@/features/business/store';
import { useAuth } from '@/lib/auth';
import { Icon } from '@/components/Icon';
import { PlanCarousel } from '@/components/PlanCarousel';
import { Alert, Pressable } from 'react-native';
import { c, radius } from '@/theme';

export default function Settings() {
  const router = useRouter();
  const owner = useOwner();
  const { journey } = useAuth();
  const [sheet, setSheet] = useState(false);
  const openCard = () => {
    if (owner.state === 'none') setSheet(true);
    else if (owner.state === 'draft' || owner.state === 'changes_requested') router.push('/business/register');
    else if (owner.state === 'in_review') router.push('/business/status');
    else router.push('/business/dashboard');
  };
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="h2">Settings</AppText>
        <LogoutButton />
      </View>
      <AccountSection />
      <Pressable accessibilityRole="button" accessibilityLabel="Connect smartwatch" onPress={() => router.push('/watches')} style={{ borderRadius: radius.lg, backgroundColor: c.blue, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' }}>
        <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: 'rgba(246,239,226,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="watch" color={c.gold} size={34} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" color={c.parchment}>Connect your smartwatch</AppText>
          <AppText variant="small" color={c.parchment} style={{ opacity: 0.85 }}>Apple Watch, Garmin and more. Add steps and heart rate to your journey.</AppText>
        </View>
        <Icon name="chevron" color={c.gold} size={24} />
      </Pressable>
      <Card onPress={() => router.push('/change-camino')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label">My Camino</AppText>
          <AppText variant="small" muted>{journey?.route?.name ?? 'Pick a Camino'} · tap to switch to another Camino</AppText>
        </View>
        <AppText variant="label" color={c.blue}>Change</AppText>
      </Card>
      <View style={{ gap: 8 }}>
        <SectionLabel>For business</SectionLabel>
        <BusinessCard state={owner.state} name={owner.draft.name} stepsDone={owner.stepsDone} onPress={openCard} />
      </View>
      <View style={{ gap: 12 }}>
        <SectionLabel>Plan and storage</SectionLabel>
        <PlanCarousel onPick={(id) => Alert.alert(id === 'free' ? 'Free plan' : id === 'plus' ? 'CaminoPlus' : 'Extra storage', id === 'free' ? 'This is your current plan.' : 'Subscriptions open when the app reaches the stores.')} />
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="label">Cloud storage</AppText>
            <AppText variant="mono" muted style={{ fontSize: 12 }}>0 GB used</AppText>
          </View>
          <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: c.sand200 }}>
            <View style={{ width: '2%', height: 10, borderRadius: radius.pill, backgroundColor: c.gold }} />
          </View>
        </Card>
      </View>
      <IntroSheet visible={sheet} onClose={() => setSheet(false)}
        onStart={() => { setSheet(false); router.push('/business/register'); }}
        onClaim={() => { setSheet(false); router.push('/business/register?claim=1'); }} />
    </Screen>
  );
}
