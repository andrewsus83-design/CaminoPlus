import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
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
import { Empty, ProgressBar, shortDate } from '@/features/me/shared';
import { Health } from '@/features/me/Health';
import { updateProfile } from '@/lib/api';
import { PickerUnavailable, pickAndUploadAvatar } from '@/lib/avatar';
import { c, fonts, layout, radius, role, shadowStyle } from '@/theme';

const TABS = ['Journey', 'Plan', 'Health'] as const;

type StampT = NonNullable<ReturnType<typeof useMeData>['stamps']>[number];
type StageT = ReturnType<typeof useMeData>['stages'][number];
type DayT = NonNullable<ReturnType<typeof useMeData>['days']>[number];


/** Plan as a tracker: overall progress on top, then a timeline of days. */
function PlanTracker({ days }: { days: DayT[] }) {
  const router = useRouter();
  if (days.length === 0) return <Empty text="Stages for your route are coming soon. Your day plan will appear here." />;
  const total = days.reduce((a, d) => a + Number(d.planned_distance_km ?? 0), 0);
  const doneKm = days.filter((d) => d.status === 'done').reduce((a, d) => a + Number(d.planned_distance_km ?? 0), 0);
  const doneN = days.filter((d) => d.status === 'done').length;
  const next = days.find((d) => d.status !== 'done');
  const last = days[days.length - 1];
  const title = (d: DayT) => (d.from_name && d.to_name ? `${d.from_name} → ${d.to_name}` : d.stage?.name ?? `Day ${d.day_number}`);
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 14 }} onPress={() => router.push({ pathname: '/planner', params: next ? { day: next.id } : {} })}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <AppText variant="h3">{Math.round(total ? (doneKm / total) * 100 : 0)}%</AppText>
          <AppText variant="label" muted>Day {Math.min(doneN + 1, days.length)} of {days.length}</AppText>
        </View>
        <ProgressBar value={total ? doneKm / total : 0} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppText variant="label" color={role.accentText}>Open day planner</AppText>
          <Icon name="chevron" color={role.accentText} size={18} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="small" muted>{Math.round(doneKm)} of {Math.round(total)} km</AppText>
          <AppText variant="small" muted>{last.planned_date ? `Santiago ${shortDate(last.planned_date)}` : `${days.length - doneN} stages left`}</AppText>
        </View>
      </Card>
      {next && (
        <Card style={{ gap: 6, backgroundColor: c.blue }} onPress={() => router.push({ pathname: '/planner', params: { day: next.id } })}>
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

export default function Me() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Journey');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, journey, session, refresh } = useAuth();
  const [editBio, setEditBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { posts, stamps, days, stages, error } = useMeData();
  const name = profile?.display_name || profile?.username || 'Pilgrim';
  const stagesDone = days?.filter((d) => d.status === 'done').length ?? 0;
  const changePhoto = async () => {
    if (!session) return;
    setUploading(true);
    try {
      if (await pickAndUploadAvatar(session.user.id)) await refresh();
    } catch (e) {
      Alert.alert(e instanceof PickerUnavailable ? 'Next build' : 'Could not change photo', e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };
  const saveBio = async () => {
    if (!session) return;
    setSavingBio(true);
    try {
      await updateProfile(session.user.id, { bio: bioDraft.trim() || null });
      await refresh();
      setEditBio(false);
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingBio(false);
    }
  };
  const isPrivate = !!profile?.is_private;
  const askVisibility = () => {
    if (!session) return;
    const next = !isPrivate;
    Alert.alert(
      next ? 'Make your profile private?' : 'Make your profile public?',
      next
        ? 'Private: you disappear from other pilgrims\' maps, and only people you approve can see your profile and posts or message you.'
        : 'Public: other pilgrims can find you on the map, see your profile and posts, and send you messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next ? 'Make private' : 'Make public',
          onPress: async () => {
            try {
              await updateProfile(session.user.id, { is_private: next });
              await refresh();
            } catch (e) {
              Alert.alert('Could not change', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };
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
          <Pressable accessibilityRole="button" accessibilityLabel="Change profile picture" onPress={changePhoto} disabled={uploading}>
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={{ width: 92, height: 92, borderRadius: radius.pill, borderWidth: 3, borderColor: c.gold }} />
              : <Avatar size={92} ring />}
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, backgroundColor: c.gold, borderWidth: 2, borderColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
              {uploading ? <ActivityIndicator size="small" color={c.blue} /> : <Icon name="camera" color={c.blue} size={16} />}
            </View>
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
            {[[String(Math.round(Number(profile?.km_walked ?? 0))), 'km'], [String(profile?.stamps_count ?? 0), 'stamps'], [String(profile?.followers_count ?? 0), 'friends']].map(([n, l]) => (
              <Pressable key={l} accessibilityRole="button" onPress={() => router.push(l === 'km' ? '/journey' : l === 'stamps' ? '/passport' : '/friends')} style={{ alignItems: 'center' }}>
                <AppText variant="h3">{n}</AppText>
                <AppText variant="small" muted style={{ textDecorationLine: 'underline' }}>{l}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AppText variant="body" numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold', flexShrink: 1 }}>{name}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={isPrivate ? 'Private profile, tap to change' : 'Public profile, tap to change'} onPress={askVisibility} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: isPrivate ? c.sand200 : c.successWash }}>
              <Icon name={isPrivate ? 'shield' : 'pin'} color={isPrivate ? role.text : c.success} size={16} />
              <AppText variant="caption" color={isPrivate ? role.text : c.success} style={{ fontFamily: 'Inter_600SemiBold' }}>{isPrivate ? 'Private' : 'Public'}</AppText>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <AppText variant="body" muted={!profile?.bio} style={{ flex: 1 }}>{profile?.bio || 'Add a short description about you'}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit description" hitSlop={10} onPress={() => { setBioDraft(profile?.bio ?? ''); setEditBio(true); }} style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="pen" color={c.blue} size={18} />
            </Pressable>
          </View>
          <AppText variant="accent" color={role.accentText}>Buen Camino!</AppText>
          {journey?.route && (
            <Pressable accessibilityRole="button" accessibilityLabel="Change Camino" onPress={() => router.push('/change-camino')} style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg, backgroundColor: c.blue, ...shadowStyle('md') }}>
              <View style={{ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: 'rgba(246,239,226,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="shell" color={c.gold} size={28} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="caption" color={c.goldSoft} style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>My Camino</AppText>
                <AppText variant="label" color={c.parchment} numberOfLines={1}>{journey.route.name}</AppText>
                <AppText variant="caption" color={c.parchment} style={{ opacity: 0.85 }} numberOfLines={1}>{journey.start_stage ? `From stage ${journey.start_stage.stage_number} · ` : ''}{stagesDone} stages done</AppText>
              </View>
              <View style={{ height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: c.gold, justifyContent: 'center' }}>
                <AppText variant="label" color={c.blue}>Change</AppText>
              </View>
            </Pressable>
          )}
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
                <Icon name="heart" color={c.red} size={18} filled />
                <AppText variant="caption" muted>{p.like_count}</AppText>
              </View>
            </Card>
          )))}

        {tab === 'Plan' && (!days ? loading : <PlanTracker days={days} />)}

        {tab === 'Health' && <Health />}
      </Screen>
      <Modal visible={editBio} transparent animationType="slide" onRequestClose={() => setEditBio(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,54,93,0.45)' }}>
          <View style={{ backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 24, paddingBottom: insets.bottom + 24, gap: 16 }}>
            <AppText variant="h4">Your description</AppText>
            <TextInput autoFocus multiline maxLength={160} value={bioDraft} onChangeText={setBioDraft} placeholder="Pilgrim from Jakarta, walking for my family…" placeholderTextColor={role.muted} style={{ minHeight: 110, textAlignVertical: 'top', fontFamily: fonts.body, fontSize: 19, lineHeight: 28, color: role.text, backgroundColor: role.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: role.border, padding: 16 }} />
            <AppText variant="caption" muted style={{ textAlign: 'right' }}>{bioDraft.length} / 160</AppText>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Pill large variant="ghost" label="Cancel" onPress={() => setEditBio(false)} /></View>
              <View style={{ flex: 1 }}><Pill large label="Save" onPress={saveBio} loading={savingBio} /></View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Pressable accessibilityRole="button" accessibilityLabel="Write a journey post" onPress={() => router.push('/write')} style={{ position: 'absolute', right: layout.screenMargin, bottom: Math.max(insets.bottom - 14, 10) + 88 + 8, width: 64, height: 64, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', ...shadowStyle('gold') }}>
        <Icon name="pen" color={c.blue} size={26} />
      </Pressable>
    </View>
  );
}
