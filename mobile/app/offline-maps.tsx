// Offline maps manager: one pack per stage. Download (with progress), cancel,
// delete, update when a newer monthly build exists, "updated X ago".
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, SectionLabel } from '@/components/ui';
import { ROUTE_ID, ROUTE_NAME, StageInfo, formatMb, hasMapTiler, hasSupabase, packs, stages, timeAgo, useOnline } from '@/features/map';
import { MapIcon } from '@/features/map/MapIcon';
import { packErrorText } from '@/features/map/messages';
import { c, layout, radius, role } from '@/theme';

export default function OfflineMaps() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const online = useOnline();
  const state = packs.usePacks();
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => {
    packs.loadInstalled();
  }, []);
  useEffect(() => {
    if (online) packs.refreshCatalog(ROUTE_ID);
  }, [online]);

  // A 403 from the server opens the upgrade prompt once.
  const needsPlus = Object.values(state.errors).includes('subscription_required');
  useEffect(() => {
    if (needsPlus) setUpgrade(true);
  }, [needsPlus]);

  const usedBytes = Object.values(state.installed).reduce((n, p) => n + p.sizeBytes, 0);

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={12} style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="back" color={role.text} />
          </Pressable>
          <AppText variant="h3">Offline maps</AppText>
        </View>
        <AppText variant="small" muted>
          Download each stage before you walk. The map, route and pins then work for the whole day with no signal. About 3 to 5 MB per stage.
        </AppText>

        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="label">On this phone</AppText>
            <AppText variant="mono" muted style={{ fontSize: 12 }}>{formatMb(usedBytes)} · {Object.keys(state.installed).length} stages</AppText>
          </View>
          <AppText variant="caption" muted>
            {online === false ? 'Offline now. Downloaded stages keep working.' : state.catalogAt ? `Checked for updates ${timeAgo(state.catalogAt)}` : 'Checking for map updates…'}
          </AppText>
          {!hasSupabase() && <AppText variant="caption" color={c.red700}>Developer: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env.</AppText>}
          {state.catalogError === 'not_signed_in' && <AppText variant="caption" color={c.goldInk}>Sign in to see sizes and download stages.</AppText>}
          {!hasMapTiler() && <AppText variant="caption" muted>Online map style: not set, the OSM offline style is used everywhere.</AppText>}
        </Card>

        <SectionLabel>{ROUTE_NAME}</SectionLabel>
        {stages.map((s) => (
          <StageRow key={s.id} stage={s} state={state} onUpgrade={() => setUpgrade(true)} />
        ))}

        <AppText variant="caption" muted style={{ marginTop: 8 }}>
          Map data © OpenStreetMap contributors (ODbL), © OpenMapTiles. Packs are rebuilt every month from fresh OSM data.
        </AppText>
      </ScrollView>

      <UpgradePrompt
        visible={upgrade}
        onClose={() => {
          setUpgrade(false);
          stages.forEach((s) => state.errors[s.id] === 'subscription_required' && packs.clearError(s.id));
        }}
        onSeePlans={() => {
          setUpgrade(false);
          router.push('/settings');
        }}
      />
    </View>
  );
}

function StageRow({ stage, state, onUpgrade }: { stage: StageInfo; state: packs.PacksState; onUpgrade: () => void }) {
  const installed = state.installed[stage.id];
  const job = state.jobs[stage.id];
  const error = state.errors[stage.id];
  const remote = state.catalog?.find((e) => e.stage_id === stage.id && e.kind === 'tiles');
  const size = remote?.size_bytes ?? installed?.sizeBytes ?? stage.estBytes;
  const update = packs.hasUpdate(stage.id);
  const notPublished = !!state.catalog && !remote;

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="mono" muted style={{ fontSize: 12 }}>STAGE {stage.number} · {stage.distanceKm} KM</AppText>
          <AppText variant="label">{stage.name}</AppText>
        </View>
        <AppText variant="mono" muted style={{ fontSize: 12 }}>{remote || installed ? '' : '~'}{formatMb(size)}</AppText>
      </View>

      {job ? (
        <View style={{ gap: 6 }}>
          <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: c.sand200, overflow: 'hidden' }}>
            <View style={{ width: `${job.total ? Math.min(100, (job.received / job.total) * 100) : 4}%`, height: 8, borderRadius: radius.pill, backgroundColor: c.gold }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="caption" muted>
              {job.phase === 'link' ? 'Getting secure link…' : job.phase === 'verifying' ? 'Checking file…' : `${formatMb(job.received)} of ${formatMb(job.total || size)}`}
            </AppText>
            <Pressable onPress={() => packs.cancelDownload(stage.id)} hitSlop={10}>
              <AppText variant="caption" color={c.red}>Cancel</AppText>
            </Pressable>
          </View>
        </View>
      ) : installed ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Icon name="check" color={c.success} size={16} />
            <AppText variant="caption" color={c.success}>Ready offline · updated {timeAgo(installed.downloadedAt)}</AppText>
          </View>
          {update && <Pill variant="gold" label={`Update · ${formatMb(remote!.size_bytes)}`} onPress={() => packs.downloadStage(stage.id)} />}
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete stage ${stage.number} map`} onPress={() => packs.removeStage(stage.id)} hitSlop={10} style={{ padding: 6 }}>
            <MapIcon name="trash" color={c.red} size={20} />
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <AppText variant="caption" muted style={{ flex: 1 }}>{notPublished ? 'Map not published yet' : 'Not on this phone'}</AppText>
          <Pill label="Download" onPress={() => packs.downloadStage(stage.id)} />
        </View>
      )}

      {error && !job && (
        <Pressable onPress={error === 'subscription_required' ? onUpgrade : () => packs.clearError(stage.id)}>
          <AppText variant="caption" color={error === 'subscription_required' ? c.goldInk : c.red700}>
            {packErrorText[error]}{error === 'subscription_required' ? ' See plans ›' : ''}
          </AppText>
        </Pressable>
      )}
    </Card>
  );
}

function UpgradePrompt({ visible, onClose, onSeePlans }: { visible: boolean; onClose: () => void; onSeePlans: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(12,35,64,0.35)' }} />
      <View style={{ backgroundColor: role.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 24, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <AppText variant="accent" color={c.goldInk}>Pilgrim Plus</AppText>
        <AppText variant="h3">Walk all day without signal</AppText>
        {['Offline maps for every stage', 'Route, albergues, water and churches offline', '5 GB cloud storage for your journey'].map((t) => (
          <View key={t} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="check" color={c.success} size={18} />
            <AppText variant="small">{t}</AppText>
          </View>
        ))}
        <AppText variant="label" style={{ marginTop: 4 }}>$12 / year</AppText>
        <Pill variant="gold" label="See Pilgrim Plus" onPress={onSeePlans} />
        <Pill variant="ghost" label="Not now" onPress={onClose} />
      </View>
    </Modal>
  );
}
