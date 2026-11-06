import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { socialApi, useFriendList } from '@/features/social';
import { useDialogs } from '@/features/social/components/dialogs';
import { FriendPickList } from '@/features/social/components/people';
import { Btn, PilgrimAvatar, ScreenHeader, noOutline } from '@/features/social/components/primitives';
import { EmptyState, ErrorState, LoadingRows } from '@/features/social/components/states';
import { MAX_GROUP_OTHERS, MAX_GROUP_TITLE, canCreateGroup, friendlyError, groupBlocker, personName, validGroupTitle } from '@/features/social/logic';
import type { Friend } from '@/features/social/types';
import { c, fonts, layout, radius, role } from '@/theme';

// Two steps: pick friends, then give the group a name.
export default function NewGroup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { friends, error, loading, retry } = useFriendList();
  const { toast, host } = useDialogs();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string[]>([]); // in the order they were picked
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const picked = useMemo(() => new Set(selected), [selected]);
  const chosen = useMemo(() => selected.map((id) => (friends ?? []).find((f) => f.id === id)).filter((f): f is Friend => !!f), [selected, friends]);
  const blocker = groupBlocker(selected.length);

  const toggle = (f: Friend) => setSelected((s) => (s.includes(f.id) ? s.filter((x) => x !== f.id) : s.length >= MAX_GROUP_OTHERS ? s : [...s, f.id]));

  const create = async () => {
    if (!validGroupTitle(title) || !canCreateGroup(selected.length)) return;
    setBusy(true);
    try {
      router.replace(`/chat/${await socialApi.createGroup(title, selected)}`);
    } catch (e) {
      toast(friendlyError(e, 'Could not create the group.'));
      setBusy(false);
    }
  };

  const back = () => (step === 2 ? setStep(1) : router.canGoBack() ? router.back() : router.replace('/inbox'));
  const top = insets.top + layout.screenTop;

  if (step === 2) {
    return (
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: role.bg }}>
        <View style={{ paddingTop: top, paddingHorizontal: layout.screenMargin, paddingBottom: 12 }}><ScreenHeader title="Name your group" variant="h3" onBack={back} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 20 }}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}><PilgrimAvatar name={title.trim() || 'Group'} seed={title || 'group'} size={96} group /></View>
          <View style={{ gap: 8 }}>
            <AppText variant="label">Group name</AppText>
            <TextInput
              autoFocus value={title} onChangeText={setTitle} maxLength={MAX_GROUP_TITLE} placeholder="Camino family" placeholderTextColor={role.muted} accessibilityLabel="Group name"
              returnKeyType="done" onSubmitEditing={create}
              style={[{ minHeight: 64, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 2, borderColor: c.gold, paddingHorizontal: 24, fontFamily: fonts.body, fontSize: 20, color: role.text }, noOutline]}
            />
            <AppText variant="caption" muted style={{ textAlign: 'right', letterSpacing: 0 }}>{title.length} / {MAX_GROUP_TITLE}</AppText>
          </View>
          <View style={{ gap: 10 }}>
            <AppText variant="label">{chosen.length} {chosen.length === 1 ? 'friend' : 'friends'} will join</AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {chosen.map((f) => (
                <View key={f.id} style={{ alignItems: 'center', width: 68, gap: 4 }}>
                  <PilgrimAvatar name={personName(f)} uri={f.avatar_url} seed={f.id} size={52} />
                  <AppText variant="caption" numberOfLines={1} style={{ letterSpacing: 0, fontSize: 13, lineHeight: 17 }}>{personName(f).split(' ')[0]}</AppText>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
          <Btn label="Create group" icon="group" variant="gold" full loading={busy} disabled={!validGroupTitle(title)} onPress={create} />
        </View>
        {host}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <View style={{ paddingTop: top, paddingHorizontal: layout.screenMargin, paddingBottom: 8 }}><ScreenHeader title="New group" variant="h3" onBack={back} /></View>
      {loading && <LoadingRows />}
      {!!error && !friends && <ErrorState text={error} onRetry={retry} />}
      {!!friends && (
        <FriendPickList
          friends={friends} selected={picked} onToggle={toggle} bottomSpace={insets.bottom + 120}
          header={
            <View style={{ paddingHorizontal: 24, gap: 10, paddingBottom: 4 }}>
              <AppText variant="small" muted>Pick at least 2 friends.</AppText>
              {chosen.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24 }} contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled">
                  {chosen.map((f) => (
                    <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={`Remove ${personName(f)}`} onPress={() => toggle(f)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 14, borderRadius: radius.pill, backgroundColor: c.blue50, borderWidth: 1, borderColor: c.blue100 }}>
                      <PilgrimAvatar name={personName(f)} uri={f.avatar_url} seed={f.id} size={34} />
                      <AppText variant="label" numberOfLines={1} style={{ maxWidth: 110 }}>{personName(f).split(' ')[0]}</AppText>
                      <Icon name="close" color={role.muted} size={16} strokeWidth={2.2} />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          }
          empty={<EmptyState icon="group" title="Walk together" text="Your friends will appear here once they accept. Add a few pilgrims first, then start a group." action={{ label: 'Find pilgrims', icon: 'search', onPress: () => router.replace({ pathname: '/friends', params: { tab: 'find' } }) }} />}
        />
      )}
      {!!friends && friends.length > 0 && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 8, backgroundColor: role.bg, borderTopWidth: 1, borderTopColor: role.border, gap: 8 }}>
          <AppText variant="caption" muted style={{ textAlign: 'center', letterSpacing: 0 }} accessibilityLiveRegion="polite">{blocker ?? `${selected.length} friends picked`}</AppText>
          <Btn label="Next" variant="primary" full disabled={!canCreateGroup(selected.length)} onPress={() => setStep(2)} />
        </View>
      )}
      {host}
    </View>
  );
}
