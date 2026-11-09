import { ReactNode, useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { useDialogs } from '@/features/social/components/dialogs';
import { Btn, ScreenHeader } from '@/features/social/components/primitives';
import { EmptyState, ErrorState, LoadingRows, Notice } from '@/features/social/components/states';
import { shortDate } from '@/features/social/logic';
import { goBack } from '@/features/social/nav';
import { linkState, linkTitle, viewsLine, type ShareLink } from '@/lib/shareLinks';
import { shareLinks } from '@/lib/shareLinksClient';
import { icon, layout, role, space } from '@/theme';

// Settings > Privacy and safety > Shared links: every plan or note shared by link, and "Stop sharing" for each. A stopped link opens
// "This link is not available" for everybody at once, and a stopped note link loses its copy on the server. The links themselves are
// not shown again: only their fingerprint is kept, so a lost link cannot be given back (make a new one).

const STATE_WORDS = { active: 'Shared', stopped: 'Stopped', expired: 'Expired' } as const;

function Row({ link, busy, onStop }: { link: ShareLink; busy: boolean; onStop: () => void }) {
  const state = linkState(link);
  const when = shortDate(link.created_at);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: layout.screenMargin, paddingVertical: space[3], minHeight: layout.touchPrimary, borderTopWidth: 1, borderTopColor: role.border }}>
      <Icon name={link.kind === 'plan' ? 'calendar' : 'diary'} color={state === 'active' ? role.action : role.muted} size={icon.md} />
      <View style={{ flex: 1, gap: space[1] }}>
        <AppText variant="label" numberOfLines={1}>{linkTitle(link)}</AppText>
        <AppText variant="caption" muted>{`${STATE_WORDS[state]}${when ? ` · ${when}` : ''} · ${viewsLine(link)}`}</AppText>
      </View>
      {state === 'active' && (
        <Btn label="Stop sharing" size="sm" variant="ghost" loading={busy} onPress={onStop} accessibilityLabel={`Stop sharing ${linkTitle(link)}`} />
      )}
    </View>
  );
}

export default function SharedLinks() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { confirm, toast, host } = useDialogs();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());

  const load = useCallback(async () => {
    const r = await shareLinks.list();
    if (r.ok) { setLinks(r.links); setError(null); } else setError(r.message);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const stop = useCallback(async (l: ShareLink) => {
    const ok = await confirm({
      title: 'Stop sharing?',
      message: 'Anyone who opens this link will see "This link is not available". This cannot be undone: to share again, make a new link.',
      confirmLabel: 'Stop sharing',
      destructive: true,
      icon: 'share',
    });
    if (!ok) return;
    setBusy((s) => new Set(s).add(l.id));
    const r = await shareLinks.stop(l.id);
    setBusy((s) => { const n = new Set(s); n.delete(l.id); return n; });
    if (!r.ok) { toast(r.message); return; }
    toast('Sharing stopped.');
    await load();
  }, [confirm, toast, load]);

  let empty: ReactNode;
  if (error && !links) empty = <ErrorState text={error} onRetry={() => void load()} />;
  else if (!links) empty = <LoadingRows count={3} avatar={24} />;
  else empty = <EmptyState icon="share" title="No shared links" text="Share your plan from the Plan tab, or a note from its menu. Your links show up here, and you can stop sharing any time." />;

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <View style={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: space[3] }}>
        <ScreenHeader title="Shared links" variant="h3" onBack={() => goBack(router)} />
      </View>
      <FlatList
        data={links ?? []}
        keyExtractor={(l) => l.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={role.action} colors={[role.action]} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + space[10], flexGrow: 1 }}
        ListHeaderComponent={
          links && links.length > 0 ? (
            <View>
              {!!error && <Notice icon="info" tone="warn" text={error} />}
              <AppText variant="small" muted style={{ paddingHorizontal: layout.screenMargin, paddingBottom: space[3] }}>
                Anyone who has one of these links can see what it shows until you stop sharing it. Your friends do not see your plan or your notes in any other way.
              </AppText>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => <Row link={item} busy={busy.has(item.id)} onStop={() => void stop(item)} />}
        ListEmptyComponent={empty}
      />
      {host}
    </View>
  );
}
