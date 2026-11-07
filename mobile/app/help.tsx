import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, IconButton, SectionLabel } from '@/components/ui';
import { SUPPORT_EMAIL, mailSupport } from '@/lib/support';
import { c, layout, role } from '@/theme';

// Settings > Support > Help centre: short answers that work without signal, then ways to reach the team.
const FAQ: { q: string; a: string }[] = [
  { q: 'Do the maps work without signal?', a: 'Yes, with Pilgrim Plus. Offline maps are only for paying members. Open Maps, choose Offline maps and download the stages you will walk while you still have Wi-Fi. Without Pilgrim Plus the map needs a connection. Your GPS dot works without signal either way, but the online base map only loads when you are connected.' },
  { q: 'Is offline mode only for Pilgrim Plus members?', a: 'Yes. Offline maps and cloud storage for photos and videos are part of Pilgrim Plus, a paid yearly subscription. The free plan has no offline maps, so the map needs a connection.' },
  { q: 'How do I change the Camino I am walking?', a: 'Open Me and tap the My Camino card. You can pick another route or a different starting point at any time.' },
  { q: 'What does the help bell do?', a: 'It sends your last known position and a short message to the friends you choose. In an emergency call 112 first. CaminoPlus does not call anyone for you and cannot promise that a friend will see your message in time.' },
  { q: 'Why can I not upload photos or videos?', a: 'Photos and videos in posts and chats are saved in the cloud, which is part of Pilgrim Plus, together with offline maps. The rest of the basic app, including your plan, is free.' },
  { q: 'A place on the map is wrong or missing', a: 'Thank you for telling us. Choose Send feedback, pick "A problem" and write the name of the place and the stage. We cross-check it against the open map data before we change anything.' },
  { q: 'How do I delete my account?', a: 'Open Settings, then Edit account, then Delete account. Cancel Pilgrim Plus in the App Store or Google Play first, because deleting your account does not cancel the subscription.' },
];

function Question({ q, a, first }: { q: string; a: string; first: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: c.sand300 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={q} onPress={() => setOpen((o) => !o)} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <AppText variant="label" style={{ flex: 1 }}>{q}</AppText>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Icon name="chevron" color={c.blue} size={20} /></View>
      </Pressable>
      {open && <AppText variant="small" style={{ paddingHorizontal: 16, paddingBottom: 16 }}>{a}</AppText>}
    </View>
  );
}

export default function Help() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mailError, setMailError] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 40, gap: 20 }}>
        <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ gap: 8 }}>
          <AppText variant="h2">Help</AppText>
          <AppText variant="lead" muted>Quick answers for the road. Everything on this page works offline.</AppText>
        </View>
        <View style={{ gap: 8 }}>
          <SectionLabel>Common questions</SectionLabel>
          <Card style={{ padding: 4 }}>
            {FAQ.map((f, i) => <Question key={f.q} q={f.q} a={f.a} first={i === 0} />)}
          </Card>
        </View>
        <Card style={{ gap: 12, backgroundColor: c.goldWash }}>
          <AppText variant="label">Still stuck?</AppText>
          <AppText variant="small">Send us a message and we will help. You can also write to {SUPPORT_EMAIL}.</AppText>
          <Pill large label="Send feedback" onPress={() => router.push('/feedback')} />
          <Pill large variant="ghost" label="Email the team" onPress={() => { setMailError(false); void mailSupport('CaminoPlus help').catch(() => setMailError(true)); }} />
          {mailError && <AppText variant="caption" color={role.danger}>No mail app found. Write to {SUPPORT_EMAIL} from any mail app.</AppText>}
        </Card>
      </ScrollView>
    </View>
  );
}
