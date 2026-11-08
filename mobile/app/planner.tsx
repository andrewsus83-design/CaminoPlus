import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card, Chip } from '@/components/ui';
import { useMeData } from '@/lib/useMeData';
import { useAuth } from '@/lib/auth';
import { localStore, userKey } from '@/lib/localStore';
import { c, fonts, icon, layout, radius, role, space, textStyle } from '@/theme';

// Task planner for one walking day: a ready-made checklist plus your own tasks.
// Saved on this phone per day and per account (works offline).
type Task = { id: string; text: string; done: boolean };

const shortDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });

export default function Planner() {
  const insets = useSafeAreaInsets();
  const { day } = useLocalSearchParams<{ day?: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { days, offline } = useMeData();
  const [dayId, setDayId] = useState<string | undefined>(day);
  const list = days ?? [];
  const current = list.find((d) => d.id === dayId) ?? list.find((d) => d.status !== 'done') ?? list[0];
  const from = current?.from_name ?? 'the start';
  const to = current?.to_name ?? 'the next town';
  const defaults = useMemo<Task[]>(() => [
    { id: 'bed', text: `Book a bed in ${to}`, done: false },
    { id: 'map', text: 'Download the offline map for this stage', done: false },
    { id: 'sello', text: `Get your sello (stamp) in ${from}`, done: false },
    { id: 'water', text: 'Fill your water and pack a snack', done: false },
    { id: 'weather', text: 'Check the weather and start time', done: false },
    { id: 'friend', text: 'Tell a friend where you are walking', done: false },
  ], [from, to]);
  const key = current && uid ? userKey(uid, `planner.${current.id}`) : null;
  const [tasks, setTasks] = useState<Task[]>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!key) return;
    setLoaded(false);
    let live = true;
    localStore.getJSON<Task[]>(key).then((v) => {
      if (!live) return;
      setTasks(Array.isArray(v) ? v : defaults);
      setLoaded(true);
    });
    return () => { live = false; };
  }, [key, defaults]);

  const save = (next: Task[]) => {
    setTasks(next);
    if (key && loaded) void localStore.setJSON(key, next);
  };
  const doneN = tasks.filter((t) => t.done).length;
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    save([...tasks, { id: `c${Date.now()}`, text: t, done: false }]);
    setDraft('');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: role.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + space[10], gap: space[5] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BackButton fallback="/me" />
          <AppText variant="h4">Day planner</AppText>
          <View style={{ width: layout.touchHard }} />
        </View>

        {list.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} style={{ flexGrow: 0, marginHorizontal: -layout.screenMargin }}>
            <View style={{ width: layout.screenMargin }} />
            {list.map((d) => <Chip key={d.id} label={`Day ${d.day_number}`} selected={d.id === current?.id} onPress={() => setDayId(d.id)} />)}
            <View style={{ width: layout.screenMargin }} />
          </ScrollView>
        )}

        {!current ? (
          <Card><AppText variant="small" muted>{offline ? 'You are offline and your plan is not saved on this phone yet. Open it once with a connection and it stays here.' : 'Your stages are still loading. Open this again in a moment.'}</AppText></Card>
        ) : (
          <>
            <Card style={{ gap: space[2], backgroundColor: role.inverse }}>
              <AppText variant="mono" color={role.onInverseAccent} style={{ textTransform: 'uppercase' }}>Day {current.day_number}{current.planned_date ? ` · ${shortDate(current.planned_date)}` : ''}</AppText>
              <AppText variant="h4" color={role.onInverse}>{from} → {to}</AppText>
              <AppText variant="small" color={role.onInverse}>{current.planned_distance_km ? `${Number(current.planned_distance_km).toFixed(1)} km` : ''}{current.status === 'done' ? ' · done' : ''}</AppText>
              <View style={{ height: 10, borderRadius: radius.pill, overflow: 'hidden', marginTop: space[2] }}>
                {/* the track is the cream of the hero card at 25 %: the colour of a role, the fade is the opacity of this layer */}
                <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: role.onInverse, opacity: 0.25 }} />
                <View style={{ width: `${tasks.length ? (doneN / tasks.length) * 100 : 0}%`, height: 10, backgroundColor: role.highlight }} />
              </View>
              <AppText variant="caption" color={role.onInverse}>{doneN} of {tasks.length} tasks done</AppText>
            </Card>

            <View style={{ gap: space[3] }}>
              {tasks.map((t) => (
                <Pressable key={t.id} accessibilityRole="checkbox" accessibilityState={{ checked: t.done }} onPress={() => save(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: space[4], paddingVertical: space[3], borderRadius: radius.lg, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border }}>
                  <View style={{ width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: t.done ? c.success : 'transparent', borderWidth: t.done ? 0 : 2, borderColor: role.border }}>
                    {t.done && <Icon name="check" color={role.onDanger} size={icon.smPlus} />}
                  </View>
                  <AppText variant="body" style={{ flex: 1, textDecorationLine: t.done ? 'line-through' : 'none', opacity: t.done ? 0.55 : 1 }}>{t.text}</AppText>
                  {!defaults.some((d) => d.id === t.id) && (
                    <Pressable accessibilityLabel="Delete task" hitSlop={12} onPress={() => save(tasks.filter((x) => x.id !== t.id))}><Icon name="close" color={role.muted} size={icon.md} /></Pressable>
                  )}
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', height: 64, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, paddingLeft: space[5], paddingRight: space[2] }}>
              <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={add} returnKeyType="done" maxLength={80} placeholder="Add your own task" placeholderTextColor={role.muted} style={{ flex: 1, minWidth: 0, height: layout.touchHard, paddingVertical: 0, fontFamily: fonts.body, fontSize: textStyle('body').fontSize, color: role.text }} />
              <Pressable accessibilityRole="button" accessibilityLabel="Add task" onPress={add} style={{ width: layout.touchHard, height: layout.touchHard, borderRadius: radius.pill, backgroundColor: role.highlight, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="h4" color={role.onHighlight}>+</AppText>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
