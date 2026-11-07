import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Card, SectionLabel } from '@/components/ui';
import { AccountSection, LogoutButton, ThemeToggle } from '@/components/AccountSection';
import { BusinessCard, IntroSheet } from '@/features/business/BusinessCard';
import { useOwner } from '@/features/business/store';
import { Icon } from '@/components/Icon';
import { PlanCarousel } from '@/components/PlanCarousel';
import { Alert, Pressable } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useMyStorage } from '@/lib/billing';
import { formatBytes } from '@/lib/format';
import { c, radius } from '@/theme';

export default function Settings() {
  const router = useRouter();
  const owner = useOwner();
  const [sheet, setSheet] = useState(false);
  const storage = useMyStorage();
  const plan = storage.data?.has_plus ? 'plus' : 'free';
  const quota = storage.data?.quota_bytes ?? 0;
  const used = storage.data?.used_bytes ?? 0;
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ThemeToggle />
          <LogoutButton />
        </View>
      </View>
      <AccountSection />
      <Pressable accessibilityRole="button" accessibilityLabel="Connect smartwatch" onPress={() => router.push('/watches')} style={{ borderRadius: radius.lg, backgroundColor: c.blue, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' }}>
        <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: 'rgba(246,239,226,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="watch" color={c.gold} size={34} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" color={c.parchment}>Connect your smartwatch</AppText>
          <AppText variant="small" color={c.parchment} style={{ opacity: 0.85 }}>Coming soon: Apple Watch, Garmin and more, with steps and heart rate on your journey.</AppText>
        </View>
        <Icon name="chevron" color={c.gold} size={24} />
      </Pressable>
      <View style={{ gap: 12 }}>
        <SectionLabel>Plan and storage</SectionLabel>
        <PlanCarousel plan={plan} onPick={(id) => Alert.alert(id === 'free' ? 'Free plan' : id === 'plus' ? 'Pilgrim Plus' : 'Extra storage', id === plan ? 'This is your current plan.' : id === 'free' ? 'You can return to the free plan when your subscription ends.' : 'Subscriptions open when the app reaches the App Store and Google Play.')} />
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="label">Cloud storage</AppText>
            <AppText variant="mono" muted style={{ fontSize: 12 }}>{storage.data ? `${formatBytes(used)} of ${formatBytes(quota)} used` : storage.offline ? 'Offline' : 'Checking…'}</AppText>
          </View>
          <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: c.sand200, overflow: 'hidden' }}>
            <View style={{ width: `${quota > 0 ? Math.max(2, Math.min(100, (used / quota) * 100)) : 0}%`, height: 10, borderRadius: radius.pill, backgroundColor: used / (quota || 1) > 0.9 ? c.red : c.gold }} />
          </View>
          {storage.data && quota === 0 && <AppText variant="caption" muted>Photos and videos in your posts and chats are saved in the cloud. That is part of Pilgrim Plus.</AppText>}
          {!!storage.error && <AppText variant="caption" color={c.red700}>Could not check your storage. {storage.error}</AppText>}
        </Card>
      </View>
      <View style={{ gap: 8 }}>
        <SectionLabel>For business</SectionLabel>
        <BusinessCard state={owner.state} name={owner.draft.name} stepsDone={owner.stepsDone} onPress={openCard} />
      </View>
      <View style={{ gap: 8 }}>
        <SectionLabel>Privacy and safety</SectionLabel>
        <Card style={{ padding: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Blocked pilgrims" onPress={() => router.push('/blocked')} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 }}>
            <Icon name="block" color={c.blue} size={22} />
            <AppText variant="label" style={{ flex: 1 }}>Blocked pilgrims</AppText>
            <Icon name="chevron" color={c.blue} size={20} />
          </Pressable>
        </Card>
      </View>
      <View style={{ gap: 8 }}>
        <SectionLabel>Support</SectionLabel>
        <Card style={{ padding: 4 }}>
          {[
            { label: 'Help', icon: 'info', path: '/help' },
            { label: 'Send feedback', icon: 'chat', path: '/feedback' },
            { label: 'Rate CaminoPlus', icon: 'star', path: '/rate' },
          ].map((r, i) => (
            <Pressable key={r.label} accessibilityRole="button" accessibilityLabel={r.label} onPress={() => router.push(r.path as never)} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: c.sand300 }}>
              <Icon name={r.icon as 'info'} color={c.blue} size={22} />
              <AppText variant="label" style={{ flex: 1 }}>{r.label}</AppText>
              <Icon name="chevron" color={c.blue} size={20} />
            </Pressable>
          ))}
        </Card>
      </View>
      <View style={{ gap: 8 }}>
        <SectionLabel>About</SectionLabel>
        <Card style={{ padding: 4 }}>
          {[
            { label: 'Privacy policy', onPress: () => { void WebBrowser.openBrowserAsync('https://camino.plus/privacy'); } },
            { label: 'Terms of use', onPress: () => { void WebBrowser.openBrowserAsync('https://camino.plus/terms'); } },
            { label: 'Licences and credits', onPress: () => router.push('/licences') },
          ].map((r, i) => (
            <Pressable key={r.label} accessibilityRole="link" accessibilityLabel={r.label} onPress={r.onPress} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: c.sand300 }}>
              <AppText variant="label">{r.label}</AppText>
              <Icon name="chevron" color={c.blue} size={20} />
            </Pressable>
          ))}
        </Card>
      </View>
      <IntroSheet visible={sheet} onClose={() => setSheet(false)}
        onStart={() => { setSheet(false); router.push('/business/register'); }}
        onClaim={() => { setSheet(false); router.push('/business/register?claim=1'); }} />
    </Screen>
  );
}
