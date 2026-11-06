import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { Icon } from '@/components/Icon';
import { Avatar, Card, IconButton, Photo, SubTabs } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { tints } from '@/data/mock';
import { useAuth } from '@/lib/auth';
import { useMeData } from '@/lib/useMeData';
import { c, layout, radius, role, shadowStyle } from '@/theme';

const TABS = ['Journey', 'Passport', 'Plan'] as const;

type StampT = NonNullable<ReturnType<typeof useMeData>['stamps']>[number];
type StageT = ReturnType<typeof useMeData>['stages'][number];
type DayT = NonNullable<ReturnType<typeof useMeData>['days']>[number];

const norm = (t: string | null | undefined) => (t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function ProgressBar({ value }: { value: number }) {
  return (
    <View style={{ height: 12, borderRadius: radius.pill, backgroundColor: c.sand200, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, height: 12, borderRadius: radius.pill, backgroundColor: c.gold }} />
    </View>
  );
}

/** Passport = the towns of your route as stamp slots. Collected ones are filled in. */
function Passport({ stamps, stages }: { stamps: StampT[]; stages: StageT[] }) {
  const towns: string[] = [];
  stages.forEach((s, i) => {
    if (i === 0 && s.start?.name) towns.push(s.start.name);
    if (s.end?.name && !towns.includes(s.end.name)) towns.push(s.end.name);
  });
  const got = new Set(stamps.map((s) => norm(s.place_name)));
  const collected = towns.filter((t) => got.has(norm(t))).length;
  const extra = stamps.filter((s) => !towns.some((t) => norm(t) === norm(s.place_name)));
  const slot = (name: string, done: boolean, key: string, date?: string) => (
    <View key={key} style={{ width: '33.33%', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
      <View style={{ width: 78, height: 78, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.goldSoft : 'transparent', borderWidth: done ? 0 : 2, borderStyle: 'dashed', borderColor: c.sand300, transform: [{ rotate: done ? '-8deg' : '0deg' }] }}>
        <Icon name="shell" color={done ? c.blue : c.sand300} size={32} />
      </View>
      <AppText variant="caption" color={done ? role.text : role.muted} numberOfLines={2} style={{ textAlign: 'center', fontFamily: done ? 'Inter_600SemiBold' : 'Inter_500Medium' }}>{name}</AppText>
      {!!date && <AppText variant="mono" muted style={{ fontSize: 12 }}>{date}</AppText>}
    </View>
  );
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <AppText variant="h4">Pilgrim passport</AppText>
          <AppText variant="label" color={role.accentText}>{collected} of {towns.length || '-'} towns</AppText>
        </View>
        <ProgressBar value={towns.length ? collected / towns.length : 0} />
        <AppText variant="small" muted>Ask for a sello (stamp) at your albergue, a church or a café each day. For the Compostela certificate, collect two stamps a day on the last 100 km.</AppText>
      </Card>
      {towns.length === 0 && extra.length === 0 && <Empty text="The towns of your route will appear here as stamp slots." />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 20 }}>
        {towns.map((t) => {
          const hit = stamps.find((s) => norm(s.place_name) === norm(t));
          return slot(t, !!hit, `t-${t}`, hit ? shortDate(hit.stamped_at) : undefined);
        })}
        {extra.map((s) => slot(s.place_name ?? 'Stamp', true, s.id, shortDate(s.stamped_at)))}
      </View>
    </View>
  );
}

/** Plan as a tracker: overall progress on top, then a timeline of days. */
function PlanTracker({ days }: { days: DayT[] }) {
  if (days.length === 0) return <Empty text="Stages for your route are coming soon. Your day plan will appear here." />;
  const total = days.reduce((a, d) => a + Number(d.planned_distance_km ?? 0), 0);
  const doneKm = days.filter((d) => d.status === 'done').reduce((a, d) => a + Number(d.planned_distance_km ?? 0), 0);
  const doneN = days.filter((d) => d.status === 'done').length;
  const next = days.find((d) => d.status !== 'done');
  const last = days[days.length - 1];
  const title = (d: DayT) => (d.from_name && d.to_name ? `${d.from_name} → ${d.to_name}` : d.stage?.name ?? `Day ${d.day_number}`);
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <AppText variant="h3">{Math.round(total ? (doneKm / total) * 100 : 0)}%</AppText>
          <AppText variant="label" muted>Day {Math.min(doneN + 1, days.length)} of {days.length}</AppText>
        </View>
        <ProgressBar value={total ? doneKm / total : 0} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="small" muted>{Math.round(doneKm)} of {Math.round(total)} km</AppText>
          <AppText variant="small" muted>{last.planned_date ? `Santiago ${shortDate(last.planned_date)}` : `${days.length - doneN} stages left`}</AppText>
        </View>
      </Card>
      {next && (
        <Card style={{ gap: 6, backgroundColor: c.blue }}>
          <AppText variant="mono" color={c.goldSoft} style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 }}>Up next · Day {next.day_number}</AppText>
          <AppText variant="h4" color={c.parchment}>{title(next)}</AppText>
          <AppText variant="small" color={c.parchment}>{next.planned_distance_km ? `${Number(next.planned_distance_km).toFixed(1)} km` : ''}{next.planned_date ? ` · ${shortDate(next.planned_date)}` : ''}</AppText>
        </Card>
      )}
      <View>
        {days.map((d, i) => {
          const done = d.status === 'done';
          const isNext = next?.id === d.id;
          return (
            <View key={d.id} style={{ flexDirection: 'row', gap: 16 }}>
              <View style={{ alignItems: 'center', width: 36 }}>
                <View style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.success : isNext ? c.gold : role.surface, borderWidth: done || isNext ? 0 : 2, borderColor: c.sand300 }}>
                  {done ? <Icon name="check" color={c.white} size={20} /> : <AppText variant="caption" color={isNext ? c.blue : role.muted} style={{ fontFamily: 'Inter_600SemiBold' }}>{d.day_number}</AppText>}
                </View>
                {i < days.length - 1 && <View style={{ width: 3, flex: 1, minHeight: 28, backgroundColor: done ? c.success : c.sand300 }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: 22 }}>
                <AppText variant="label" color={done ? role.muted : role.text}>{title(d)}</AppText>
                <AppText variant="caption" muted>{d.planned_distance_km ? `${Number(d.planned_distance_km).toFixed(1)} km` : ''}{d.planned_date ? ` · ${shortDate(d.planned_date)}` : ''}{done ? ' · done' : isNext ? ' · up next' : ''}</AppText>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

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
  const { posts, stamps, days, stages, error } = useMeData();
  const name = profile?.display_name || profile?.username || 'Pilgrim';
  const stagesDone = days?.filter((d) => d.status === 'done').length ?? 0;
  const loading = <ActivityIndicator color={role.action} style={{ marginTop: 24 }} />;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {/* Header follows the design system: handle pill + bell, avatar with stats, name and bio. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AppText variant="h4" numberOfLines={1} style={{ flexShrink: 1 }}>{profile?.username ?? name}</AppText>
          {!!profile?.username && (
            <View style={{ paddingHorizontal: 12, height: 32, borderRadius: radius.pill, backgroundColor: c.goldWash, justifyContent: 'center' }}>
              <AppText variant="mono" color={role.accentText}>camino.plus/{profile.username}</AppText>
            </View>
          )}
          <View style={{ marginLeft: 'auto' }}><IconButton name="bell" label="Notifications" onPress={() => router.push('/inbox')} flat /></View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          {profile?.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={{ width: 92, height: 92, borderRadius: radius.pill, borderWidth: 3, borderColor: c.gold }} />
            : <Avatar size={92} ring />}
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
            {[[String(Math.round(Number(profile?.km_walked ?? 0))), 'km'], [String(profile?.stamps_count ?? 0), 'stamps'], [String(profile?.followers_count ?? 0), 'friends']].map(([n, l]) => (
              <View key={l} style={{ alignItems: 'center' }}>
                <AppText variant="h3">{n}</AppText>
                <AppText variant="small" muted>{l}</AppText>
              </View>
            ))}
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <AppText variant="body" style={{ fontFamily: 'Inter_600SemiBold' }}>{name}</AppText>
          {!!profile?.bio && <AppText variant="body">{profile.bio}</AppText>}
          {journey?.route && (
            <Pressable accessibilityRole="button" onPress={() => router.push('/change-camino')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 }}>
              <AppText variant="small" muted>
                {journey.route.name}{journey.start_stage ? ` · from stage ${journey.start_stage.stage_number}` : ''} · {stagesDone} stages done
              </AppText>
              <AppText variant="small" color={c.blue} style={{ fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' }}>Change</AppText>
            </Pressable>
          )}
          <AppText variant="accent" color={role.accentText}>Buen Camino!</AppText>
        </View>
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="h4">Camino friends</AppText>
            <AppText variant="small" muted>{profile?.followers_count ?? 0} friends</AppText>
          </View>
          <AppText variant="small" muted>Walk together, share stamps and see where your friends are on the way.</AppText>
          <Pill variant="gold" label="Invite friends" onPress={() => Share.share({ message: `Walk the Camino with me on CaminoPlus: https://camino.plus${profile?.username ? `/${profile.username}` : ''}` }).catch(() => {})} />
        </Card>
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

        {tab === 'Passport' && (!stamps ? loading : <Passport stamps={stamps} stages={stages} />)}

        {tab === 'Plan' && (!days ? loading : <PlanTracker days={days} />)}
      </Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Write a journey post" onPress={() => router.push('/write')} style={{ position: 'absolute', right: layout.screenMargin, bottom: insets.bottom + 116, width: 64, height: 64, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', ...shadowStyle('gold') }}>
        <Icon name="pen" color={c.blue} size={26} />
      </Pressable>
    </View>
  );
}
