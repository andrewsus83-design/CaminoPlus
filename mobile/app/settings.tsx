import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Card, SectionLabel } from '@/components/ui';
import { AccountSection, LogoutButton, ThemeToggle } from '@/components/AccountSection';
import { BuildCard } from '@/components/BuildCard';
import { BusinessCard, IntroSheet } from '@/features/business/BusinessCard';
import { useOwner } from '@/features/business/store';
import { Icon } from '@/components/Icon';
import { PlanCarousel } from '@/components/PlanCarousel';
import { Alert, Pressable } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useMyStorage } from '@/lib/billing';
import { formatBytes } from '@/lib/format';
import { NO_CLOUD_STORAGE_TEXT } from '@/lib/plan';
import { c, layout, radius, role, space } from '@/theme';

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
    <Screen tabBar={false}>
      {/* A screen of its own, opened from the gear at the top right of Me: back on the left, light/dark and log out on the right. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton fallback="/me" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <ThemeToggle />
          <LogoutButton />
        </View>
      </View>
      <AppText variant="h2" accessibilityRole="header">Settings</AppText>
      <AccountSection />
      <Pressable accessibilityRole="button" accessibilityLabel="Connect smartwatch" onPress={() => router.push('/watches')} style={{ borderRadius: radius.lg, backgroundColor: role.inverse, padding: layout.cardPadding, flexDirection: 'row', alignItems: 'center', gap: space[4], overflow: 'hidden' }}>
        {/* The disc is the cream of the card's text at 14 %: drawn as its own layer, so the opacity does not dim the icon. */}
        <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.pill, backgroundColor: role.onInverse, opacity: 0.14 }} />
          <Icon name="watch" color={c.goldBright} size={32} />
        </View>
        <View style={{ flex: 1, gap: space[1] }}>
          <AppText variant="label" color={role.onInverse}>Connect your smartwatch</AppText>
          <AppText variant="small" color={role.onInverse} style={{ opacity: 0.85 }}>Coming soon: Apple Watch, Garmin and more, with steps and heart rate on your journey.</AppText>
        </View>
        <Icon name="chevron" color={role.highlight} size={24} />
      </Pressable>
      <View style={{ gap: space[3] }}>
        <SectionLabel>Plan and storage</SectionLabel>
        <PlanCarousel plan={plan} onPick={(id) => Alert.alert(id === 'free' ? 'Free plan' : id === 'plus' ? 'Pilgrim Plus' : 'Extra storage', id === plan ? 'This is your current plan.' : id === 'free' ? 'You can return to the free plan when your subscription ends.' : 'Subscriptions open when the app reaches the App Store and Google Play.')} />
        <Card style={{ gap: space[3] }}>
          {/* At 15 px the amount can be wider than what is left of the row on a narrow phone: it goes under the title then, instead of being cut. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: space[3], rowGap: space[1] }}>
            <AppText variant="label">Cloud storage</AppText>
            <AppText variant="mono" muted>{storage.data ? `${formatBytes(used)} of ${formatBytes(quota)} used` : storage.offline ? 'Offline' : 'Checking…'}</AppText>
          </View>
          <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: role.sunken, overflow: 'hidden' }}>
            <View style={{ width: `${quota > 0 ? Math.max(2, Math.min(100, (used / quota) * 100)) : 0}%`, height: 10, borderRadius: radius.pill, backgroundColor: used / (quota || 1) > 0.9 ? role.danger : role.highlight }} />
          </View>
          {storage.data && quota === 0 && <AppText variant="caption" muted>{NO_CLOUD_STORAGE_TEXT}</AppText>}
          {!!storage.error && <AppText variant="caption" color={c.red700}>Could not check your storage. {storage.error}</AppText>}
        </Card>
      </View>
      <View style={{ gap: space[2] }}>
        <SectionLabel>For business</SectionLabel>
        <BusinessCard state={owner.state} name={owner.draft.name} stepsDone={owner.stepsDone} onPress={openCard} />
      </View>
      <View style={{ gap: space[2] }}>
        <SectionLabel>Privacy and safety</SectionLabel>
        <Card style={{ padding: space[1] }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Blocked pilgrims" onPress={() => router.push('/blocked')} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: space[4] }}>
            <Icon name="block" color={role.action} size={24} />
            <AppText variant="label" style={{ flex: 1 }}>Blocked pilgrims</AppText>
            <Icon name="chevron" color={role.action} size={20} />
          </Pressable>
        </Card>
      </View>
      <View style={{ gap: space[2] }}>
        <SectionLabel>Support</SectionLabel>
        <Card style={{ padding: space[1] }}>
          {[
            { label: 'Help', icon: 'info', path: '/help' },
            { label: 'Send feedback', icon: 'chat', path: '/feedback' },
            { label: 'Rate CaminoPlus', icon: 'star', path: '/rate' },
          ].map((r, i) => (
            <Pressable key={r.label} accessibilityRole="button" accessibilityLabel={r.label} onPress={() => router.push(r.path as never)} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: space[4], borderTopWidth: i ? 1 : 0, borderTopColor: role.border }}>
              <Icon name={r.icon as 'info'} color={role.action} size={24} />
              <AppText variant="label" style={{ flex: 1 }}>{r.label}</AppText>
              <Icon name="chevron" color={role.action} size={20} />
            </Pressable>
          ))}
        </Card>
      </View>
      <View style={{ gap: space[2] }}>
        <SectionLabel>About</SectionLabel>
        <Card style={{ padding: space[1] }}>
          {[
            { label: 'Privacy policy', onPress: () => { void WebBrowser.openBrowserAsync('https://camino.plus/privacy'); } },
            { label: 'Terms of use', onPress: () => { void WebBrowser.openBrowserAsync('https://camino.plus/terms'); } },
            { label: 'Licences and credits', onPress: () => router.push('/licences') },
          ].map((r, i) => (
            <Pressable key={r.label} accessibilityRole="link" accessibilityLabel={r.label} onPress={r.onPress} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4], borderTopWidth: i ? 1 : 0, borderTopColor: role.border }}>
              <AppText variant="label">{r.label}</AppText>
              <Icon name="chevron" color={role.action} size={20} />
            </Pressable>
          ))}
        </Card>
      </View>
      <View style={{ gap: space[2] }}>
        <SectionLabel>This build</SectionLabel>
        <BuildCard />
      </View>
      <IntroSheet visible={sheet} onClose={() => setSheet(false)}
        onStart={() => { setSheet(false); router.push('/business/register'); }}
        onClaim={() => { setSheet(false); router.push('/business/register?claim=1'); }} />
    </Screen>
  );
}
