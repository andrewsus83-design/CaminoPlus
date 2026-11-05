import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Avatar, Card, IconButton, Photo, SubTabs } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { tints } from '@/data/mock';
import { useAuth } from '@/lib/auth';
import { useMeData } from '@/lib/useMeData';
import { c, layout, radius, role, shadowStyle } from '@/theme';

const TABS = ['Journey', 'Passport', 'Plan'] as const;

function ago(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days <= 0) return `Today · ${hm}`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
const shortDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });

function Empty({ text }: { text: string }) {
  return (
    <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
      <Icon name="shell" color={c.gold} size={32} />
      <AppText variant="small" muted style={{ textAlign: 'center' }}>{text}</AppText>
    </Card>
  );
}

export default function Me() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Journey');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, journey } = useAuth();
  const { posts, stamps, days, error } = useMeData();
  const name = profile?.display_name || profile?.username || 'Pilgrim';
  const stagesDone = days?.filter((d) => d.status === 'done').length ?? 0;
  const loading = <ActivityIndicator color={role.action} style={{ marginTop: 24 }} />;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {profile?.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={{ width: 84, height: 84, borderRadius: radius.pill, borderWidth: 3, borderColor: c.gold }} />
            : <Avatar size={84} ring />}
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="h3" numberOfLines={1}>{name}</AppText>
            {!!profile?.username && (
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: c.goldWash, justifyContent: 'center' }}>
                <AppText variant="mono" color={role.accentText} style={{ fontSize: 12 }}>camino.plus/{profile.username}</AppText>
              </View>
            )}
          </View>
          <IconButton name="bell" label="Notifications" onPress={() => router.push('/inbox')} flat />
        </View>
        {journey?.route && (
          <AppText variant="small" muted>
            {journey.route.name}{journey.start_stage ? ` · from stage ${journey.start_stage.stage_number}` : ''}
          </AppText>
        )}
        <AppText variant="accent" color={role.accentText}>Buen Camino!</AppText>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[[String(Math.round(Number(profile?.km_walked ?? 0))), 'km walked'], [String(stagesDone), 'stages'], [String(profile?.stamps_count ?? 0), 'stamps']].map(([n, l]) => (
            <Card key={l} style={{ flex: 1, padding: 16, alignItems: 'center' }}>
              <AppText variant="h4">{n}</AppText>
              <AppText variant="caption" muted>{l}</AppText>
            </Card>
          ))}
        </View>
        <SubTabs tabs={TABS} value={tab} onChange={setTab} />
        {!!error && <FormMessage>{`Could not load your data. ${error}`}</FormMessage>}

        {tab === 'Journey' && (!posts ? loading : posts.length === 0
          ? <Empty text="No journey posts yet. Tap the pen to write about today's stage." />
          : posts.map((p, i) => (
            <Card key={p.id} style={{ gap: 12 }}>
              {p.media_count > 0 && <Photo tint={tints[i % tints.length]} height={180} />}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <AppText variant="label" style={{ flex: 1 }} numberOfLines={1}>{[p.place_name, p.health_summary?.km ? `${p.health_summary.km} km` : null].filter(Boolean).join(' · ') || 'On the Camino'}</AppText>
                <AppText variant="mono" muted style={{ fontSize: 12 }}>{ago(p.published_at)}</AppText>
              </View>
              {!!p.body && <AppText variant="small">{p.body}</AppText>}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="heart" color={c.red} size={18} />
                <AppText variant="caption" muted>{p.like_count}</AppText>
              </View>
            </Card>
          )))}

        {tab === 'Passport' && (!stamps ? loading : stamps.length === 0
          ? <Empty text="Your pilgrim passport is empty. Collect your first stamp at an albergue, church or café." />
          : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {stamps.map((s, i) => (
                <Card key={s.id} style={{ width: '47.5%', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 72, height: 72, borderRadius: radius.pill, backgroundColor: tints[i % tints.length], alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="shell" color={c.blue} size={32} />
                  </View>
                  <AppText variant="label" numberOfLines={1}>{s.place_name ?? 'Stamp'}</AppText>
                  <AppText variant="mono" muted style={{ fontSize: 12 }}>{shortDate(s.stamped_at)}{s.verified ? ' · ✓' : ''}</AppText>
                </Card>
              ))}
            </View>
          ))}

        {tab === 'Plan' && (!days ? loading : days.length === 0
          ? <Empty text="Stages for your route are coming soon. Your day plan will appear here." />
          : days.map((d) => {
            const done = d.status === 'done';
            return (
              <Card key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: done ? c.successWash : c.sand200, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={done ? 'check' : 'flag'} color={done ? c.success : c.stone600} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{d.from_name && d.to_name ? `${d.from_name} → ${d.to_name}` : d.stage?.name ?? `Day ${d.day_number}`}</AppText>
                  <AppText variant="caption" muted>Day {d.day_number}{d.planned_distance_km ? ` · ${Number(d.planned_distance_km).toFixed(1)} km` : ''}{d.planned_date ? ` · ${shortDate(d.planned_date)}` : ''}</AppText>
                </View>
              </Card>
            );
          }))}
      </Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Write a journey post" onPress={() => router.push('/write')} style={{ position: 'absolute', right: layout.screenMargin, bottom: insets.bottom + 96, width: 60, height: 60, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', ...shadowStyle('gold') }}>
        <Icon name="pen" color={c.blue} size={26} />
      </Pressable>
    </View>
  );
}
