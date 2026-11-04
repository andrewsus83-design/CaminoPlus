import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Avatar, IconButton, SubTabs } from '@/components/ui';
import { messages, notifications } from '@/data/mock';
import { c, role } from '@/theme';

const TABS = ['Notifications', 'Messages'] as const;

export default function Inbox() {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Notifications');
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <AppText variant="h2" style={{ flex: 1 }}>Inbox</AppText>
      </View>
      <SubTabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'Notifications' && notifications.map((n) => (
        <View key={n.id} style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16, borderRadius: 20, backgroundColor: n.unread ? c.goldWash : 'transparent' }}>
          <Avatar size={48} tint={n.unread ? c.gold : c.blue100} />
          <View style={{ flex: 1 }}>
            <AppText variant="small">{n.title}</AppText>
            <AppText variant="mono" muted style={{ fontSize: 12 }}>{n.time}</AppText>
          </View>
          {n.unread && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.blue }} />}
        </View>
      ))}
      {tab === 'Messages' && messages.map((m) => (
        <View key={m.id} style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 8 }}>
          <Avatar size={56} tint={m.tint} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="label">{m.name}</AppText>
              <AppText variant="mono" muted style={{ fontSize: 11 }}>{m.time}</AppText>
            </View>
            <AppText variant="small" numberOfLines={1} color={m.unread ? role.text : role.muted}>{m.text}</AppText>
          </View>
          {m.unread > 0 && <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.blue, alignItems: 'center', justifyContent: 'center' }}><AppText variant="caption" color={c.parchment} style={{ fontSize: 12 }}>{m.unread}</AppText></View>}
        </View>
      ))}
    </Screen>
  );
}
