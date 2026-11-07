import { ReactNode, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { socialApi, useChatInfo, useFriendList, useNow } from '@/features/social';
import { useDialogs } from '@/features/social/components/dialogs';
import { FriendPickList } from '@/features/social/components/people';
import { Btn, PilgrimAvatar, ScreenHeader } from '@/features/social/components/primitives';
import { PersonRow } from '@/features/social/components/rows';
import { EmptyState, ErrorState, Section } from '@/features/social/components/states';
import { MAX_GROUP_TITLE, REPORT_REASONS, conversationName, firstName, friendlyError, isMuted, muteLabel, personName, pilgrimsLabel } from '@/features/social/logic';
import { goBack } from '@/features/social/nav';
import type { Friend, Member, ReportReason } from '@/features/social/types';
import { c, layout, radius, role } from '@/theme';

const FAR = '2100-01-01T00:00:00.000Z';
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

function Card({ children }: { children: ReactNode }) {
  return <View style={{ marginHorizontal: layout.screenMargin, backgroundColor: role.surface, borderRadius: radius.md, borderWidth: 1, borderColor: role.border, overflow: 'hidden' }}>{children}</View>;
}

function InfoRow({ icon, label, value, onPress, danger, first, busy }: { icon: IconName; label: string; value?: string; onPress: () => void; danger?: boolean; first?: boolean; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label} onPress={onPress} disabled={busy}
      style={({ pressed }) => ({ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, borderTopWidth: first ? 0 : 1, borderTopColor: role.border, backgroundColor: pressed ? c.sand200 : 'transparent' })}
    >
      <Icon name={icon} color={danger ? c.red : role.text} size={24} />
      <AppText variant="body" color={danger ? c.red : role.text} style={{ flex: 1, fontSize: 18, lineHeight: 24 }}>{label}</AppText>
      {busy ? <ActivityIndicator color={role.action} /> : !!value && <AppText variant="small" muted style={{ fontSize: 16 }}>{value}</AppText>}
      {!danger && !busy && <Icon name="chevron" color={role.muted} size={20} />}
    </Pressable>
  );
}

function RolePill({ role: r }: { role: Member['role'] }) {
  if (r === 'member') return null;
  return (
    <View style={{ backgroundColor: r === 'owner' ? c.goldWash : c.blue50, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1, borderColor: r === 'owner' ? c.goldSoft : c.blue100 }}>
      <AppText variant="caption" color={r === 'owner' ? c.goldInk : c.blue} style={{ letterSpacing: 0, fontSize: 13, lineHeight: 18 }}>{r === 'owner' ? 'Owner' : 'Admin'}</AppText>
    </View>
  );
}

function YouPill() {
  return (
    <View style={{ backgroundColor: c.sand200, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 }}>
      <AppText variant="caption" color={role.text} style={{ letterSpacing: 0, fontSize: 13, lineHeight: 18 }}>You</AppText>
    </View>
  );
}

export default function ChatInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const info = useChatInfo(String(id));
  const { confirm, menu, prompt, toast, host } = useDialogs();
  const [adding, setAdding] = useState(false);
  const conv = info.conversation;
  const group = conv?.kind === 'group';
  const name = conv ? conversationName(conv) : 'Chat';
  const canManage = conv?.my_role === 'owner' || conv?.my_role === 'admin';
  const muted = !!conv && isMuted(conv, now);

  const say = (err: string | null, ok: string) => toast(err ?? ok);

  const chooseMute = async () => {
    const choice = await menu({
      title: 'Mute notifications', message: 'You will still see new messages here. You just will not be alerted.',
      options: [
        { key: '8h', label: 'For 8 hours', icon: 'mute' }, { key: '1w', label: 'For 1 week', icon: 'mute' }, { key: 'always', label: 'Until I turn it back on', icon: 'mute' },
        ...(muted ? [{ key: 'off', label: 'Turn notifications back on', icon: 'bell' as IconName }] : []),
      ],
    });
    if (!choice) return;
    const until = choice === '8h' ? inHours(8) : choice === '1w' ? inHours(24 * 7) : choice === 'always' ? FAR : null;
    say(await info.mute(until), until ? 'Notifications are muted.' : 'Notifications are back on.');
  };

  const rename = async () => {
    const next = await prompt({ title: 'Rename group', initial: conv?.title ?? '', maxLength: MAX_GROUP_TITLE, placeholder: 'Group name', confirmLabel: 'Save' });
    if (next && next !== conv?.title) say(await info.rename(next), 'Group renamed.');
  };

  const leave = async () => {
    const ok = await confirm({ title: 'Leave this group?', message: 'You will stop getting its messages. A friend in the group can add you back.', confirmLabel: 'Leave group', destructive: true, icon: 'logout' });
    if (!ok) return;
    const err = await info.leave();
    if (err) toast(err);
    else router.dismissTo({ pathname: '/inbox', params: { tab: 'groups' } });
  };

  const block = async (userId: string, who: string) => {
    const ok = await confirm({ title: `Block ${who}?`, message: `${who} will not be able to message you or find you in search, and you will stop being friends. You can unblock them any time.`, confirmLabel: 'Block', destructive: true, icon: 'block' });
    if (ok) say(await info.block(userId), `${who} is blocked.`);
  };

  const report = async (userId: string, who: string) => {
    const reason = await menu({ title: `Report ${who}`, message: 'Tell us what is wrong. We review every report.', options: REPORT_REASONS.map((r) => ({ key: r.key, label: r.label })) });
    if (reason) say(await info.report(userId, reason as ReportReason), 'Thank you. We will take a look.');
  };

  const memberMenu = async (m: Member) => {
    const who = personName(m);
    const canRemove = canManage && m.role !== 'owner' && (conv?.my_role === 'owner' || m.role === 'member');
    const choice = await menu({
      title: who,
      options: [
        { key: 'message', label: `Message ${firstName(who)}`, icon: 'chat' as IconName },
        ...(canRemove ? [{ key: 'remove', label: 'Remove from group', icon: 'close' as IconName, destructive: true }] : []),
        { key: 'report', label: `Report ${firstName(who)}`, icon: 'flag' as IconName, destructive: true },
        { key: 'block', label: `Block ${firstName(who)}`, icon: 'block' as IconName, destructive: true },
      ],
    });
    if (choice === 'message') {
      try { router.push(`/chat/${await socialApi.startDirectChat(m.user_id)}`); } catch (e) { toast(friendlyError(e, 'Could not open this chat.')); }
    } else if (choice === 'remove') {
      if (await confirm({ title: `Remove ${who}?`, message: 'They will no longer see new messages in this group.', confirmLabel: 'Remove', destructive: true, icon: 'close' })) say(await info.removeMember(m.user_id), `${who} was removed.`);
    } else if (choice === 'report') await report(m.user_id, who);
    else if (choice === 'block') await block(m.user_id, who);
  };

  const head = (
    <View style={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: 8 }}>
      <ScreenHeader title={group ? 'Group info' : 'Chat info'} variant="h3" onBack={() => goBack(router)} />
    </View>
  );

  if (info.phase === 'loading') return <View style={{ flex: 1, backgroundColor: role.bg }}>{head}<ActivityIndicator color={role.action} style={{ marginTop: 48 }} /></View>;
  if (info.phase === 'error') return <View style={{ flex: 1, backgroundColor: role.bg }}>{head}<ErrorState text={info.error ?? 'Please try again.'} onRetry={info.retry} /></View>;
  if (info.phase === 'missing' || !conv) {
    return <View style={{ flex: 1, backgroundColor: role.bg }}>{head}<EmptyState icon="chat" title="This chat is not available" text="You may have left the group, or it was removed." action={{ label: 'Back to inbox', onPress: () => router.replace('/inbox') }} /></View>;
  }

  const peerId = conv.peer_id;
  const members = info.members ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      {head}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40, gap: 6 }}>
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: layout.screenMargin }}>
          <PilgrimAvatar name={name} uri={group ? conv.avatar_url : conv.peer_avatar_url} seed={peerId ?? conv.id} size={104} group={group} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="h3" numberOfLines={2} style={{ textAlign: 'center', flexShrink: 1 }}>{name}</AppText>
            {group && canManage && (
              <Pressable accessibilityRole="button" accessibilityLabel="Rename group" onPress={rename} style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="pen" color={c.blue} size={20} />
              </Pressable>
            )}
          </View>
          <AppText variant="small" muted>{group ? pilgrimsLabel(conv.member_count) : conv.peer_username ? `@${conv.peer_username}` : 'Friend'}</AppText>
        </View>

        <Card><InfoRow first icon={muted ? 'mute' : 'bell'} label="Notifications" value={muteLabel(conv, now)} onPress={chooseMute} busy={info.busy} /></Card>

        {group && (
          <>
            <Section right={canManage ? <Btn label="Add" icon="user-plus" size="sm" variant="soft" onPress={() => setAdding(true)} accessibilityLabel="Add pilgrims to the group" /> : undefined}>{`Members · ${members.length || conv.member_count}`}</Section>
            <Card>
              {members.map((m, i) => (
                <View key={m.user_id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border }}>
                  <PersonRow
                    name={personName(m)} username={m.username} uri={m.avatar_url} seed={m.user_id} size={48} inset={16}
                    trailing={
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <RolePill role={m.role} />
                        {m.user_id === info.uid && <YouPill />}
                        {m.user_id !== info.uid && (
                          <Pressable accessibilityRole="button" accessibilityLabel={`More about ${personName(m)}`} onPress={() => memberMenu(m)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="more" color={role.muted} size={24} />
                          </Pressable>
                        )}
                      </View>
                    }
                  />
                </View>
              ))}
            </Card>
            <View style={{ paddingHorizontal: layout.screenMargin, paddingTop: 18 }}><Btn label="Leave group" icon="logout" variant="dangerGhost" full onPress={leave} loading={info.busy} /></View>
          </>
        )}

        {!group && !!peerId && (
          <>
            <Section>Safety</Section>
            <Card>
              {info.blocked
                ? <InfoRow first icon="block" label={`Unblock ${name}`} onPress={async () => say(await info.unblock(peerId), `${name} is unblocked.`)} />
                : <InfoRow first icon="block" label={`Block ${name}`} danger onPress={() => block(peerId, name)} />}
              <InfoRow icon="flag" label={`Report ${name}`} danger onPress={() => report(peerId, name)} />
            </Card>
            <AppText variant="caption" muted style={{ paddingHorizontal: layout.screenMargin, paddingTop: 6, letterSpacing: 0 }}>Chats are not end-to-end encrypted. Never share your location or money details here.</AppText>
          </>
        )}
      </ScrollView>
      {group && <AddPeople visible={adding} inGroup={new Set(members.map((m) => m.user_id))} onClose={() => setAdding(false)} onAdd={async (ids) => { say(await info.addMembers(ids), `${ids.length === 1 ? 'Pilgrim' : 'Pilgrims'} added.`); setAdding(false); }} />}
      {host}
    </View>
  );
}

/** Full-screen sheet: pick friends who are not in the group yet. */
function AddPeople({ visible, inGroup, onClose, onAdd }: { visible: boolean; inGroup: ReadonlySet<string>; onClose: () => void; onAdd: (ids: string[]) => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const { friends, error, loading, retry } = useFriendList(visible);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const close = () => { setSelected([]); onClose(); };
  const toggle = (f: Friend) => setSelected((s) => (s.includes(f.id) ? s.filter((x) => x !== f.id) : [...s, f.id]));
  const add = async () => { setBusy(true); await onAdd(selected); setBusy(false); setSelected([]); };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: role.bg, paddingTop: 20 }}>
        <View style={{ paddingHorizontal: layout.screenMargin, paddingBottom: 8 }}>
          <ScreenHeader title="Add pilgrims" variant="h3" right={<Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" color={role.text} size={22} /></Pressable>} />
        </View>
        {loading && <ActivityIndicator color={role.action} style={{ marginTop: 32 }} />}
        {!!error && !friends && <ErrorState text={error} onRetry={retry} />}
        {!!friends && (
          <FriendPickList
            friends={friends} selected={new Set(selected)} disabled={inGroup} onToggle={toggle} bottomSpace={insets.bottom + 110}
            empty={<EmptyState icon="group" title="No friends to add yet" text="Add friends first. Only your friends can join a group." />}
          />
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.screenMargin, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 8, backgroundColor: role.bg, borderTopWidth: 1, borderTopColor: role.border }}>
          <Btn label={selected.length ? `Add ${selected.length} ${selected.length === 1 ? 'friend' : 'friends'}` : 'Pick friends to add'} variant="gold" full disabled={selected.length === 0} loading={busy} onPress={add} />
        </View>
      </View>
    </Modal>
  );
}
