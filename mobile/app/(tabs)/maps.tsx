import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { BottomSheet, GpsMode, MapLayerMode, MapView, PRECISE_TIMEOUT_MS, ROUTE_NAME, pois, routeLengthKm } from '@/features/map';
import { MapIcon } from '@/features/map/MapIcon';
import { useMapModel } from '@/features/map/useMapModel';
import { c, radius, role, shadowStyle } from '@/theme';

// 'Helicopter' = whole route, 'City' = close-up around you. Shown with plain names.
const LAYERS: { mode: MapLayerMode; label: string }[] = [{ mode: 'Helicopter', label: 'Whole route' }, { mode: 'City', label: 'Near me' }];
const KIND_LABEL = { church: 'Church', albergue: 'Albergue', water: 'Drinking water', cafe: 'Café', quest: 'Quest', stamp: 'Stamp point' } as const;
const SHEET_PEEK = 150;

export default function Maps() {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const SHEET_FULL = Math.min(Math.round(screenH * 0.6), 560);
  const router = useRouter();
  const focused = useIsFocused();
  const [layer, setLayer] = useState<MapLayerMode>('Helicopter');
  const [selId, setSelId] = useState<string | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gpsMode, setGpsMode] = useState<GpsMode>('saver');
  const [recenterKey, setRecenterKey] = useState(0);
  const m = useMapModel({ gpsMode, visible: focused });

  // Automatic: once a real GPS fix is on the route, switch to the close-up once.
  const autoDone = useRef(false);
  useEffect(() => {
    if (!autoDone.current && !m.walker.sample) { autoDone.current = true; setLayer('City'); }
  }, [m.walker.sample]);

  // Precise GPS is a short burst; fall back to saver automatically.
  useEffect(() => {
    if (gpsMode !== 'precise') return;
    const t = setTimeout(() => setGpsMode('saver'), PRECISE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [gpsMode]);

  const poi = pois.find((p) => p.id === selId);
  const onSelectPoi = useCallback((id: string | undefined) => {
    setSelId(id);
    if (id) setSheetOpen(false);
  }, []);

  const tabBarSpace = insets.bottom + 88;
  const sheetBottom = tabBarSpace;

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      {m.glyphs ? (
        <MapView
          layer={layer}
          online={m.useOnlineTiles}
          packSources={m.packSources}
          glyphs={m.glyphs}
          done={m.done}
          remaining={m.remaining}
          walker={m.walker}
          focus={poi?.at ?? m.walker.at}
          recenterKey={recenterKey}
          selectedPoiId={selId}
          onSelectPoi={onSelectPoi}
          saver={gpsMode !== 'precise'}
          insets={{ top: insets.top + 100, bottom: sheetBottom + SHEET_PEEK }}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="small" muted>{m.glyphError ? `Map fonts failed: ${m.glyphError}` : 'Preparing offline map…'}</AppText>
        </View>
      )}

      {m.glyphs && !m.useOnlineTiles && m.packSources.length === 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, top: '36%', backgroundColor: role.surface, borderRadius: radius.lg, padding: 24, gap: 8 }}>
          <AppText variant="h4">No map tiles yet</AppText>
          <AppText variant="body" muted>{m.online === false ? 'You are offline and this stage has no offline pack. Download it in Offline maps.' : 'The online base map needs a MapTiler key (EXPO_PUBLIC_MAPTILER_KEY), or download this stage in Offline maps.'}</AppText>
        </View>
      )}

      {/* Top: layer switch + pack status */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: role.surface, ...shadowStyle('md') }}>
            {LAYERS.map((l) => (
              <Pressable key={l.mode} accessibilityRole="tab" accessibilityState={{ selected: layer === l.mode }} onPress={() => setLayer(l.mode)} style={{ height: 40, paddingHorizontal: 18, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: layer === l.mode ? c.blue : 'transparent' }}>
                <AppText variant="label" color={layer === l.mode ? c.parchment : c.blue}>{l.label}</AppText>
              </Pressable>
            ))}
          </View>
          <RoundButton label="Offline maps" onPress={() => router.push('/offline-maps')}>
            <MapIcon name="download" color={c.blue} />
          </RoundButton>
        </View>
        <StatusPill status={m.status} online={m.online} onPress={() => router.push('/offline-maps')} />
        {m.gpsOffRoute && (
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, height: 28, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.blue50 }}>
            <AppText variant="caption" color={c.blue}>You are not on the Camino yet · showing a sample position</AppText>
          </View>
        )}
      </View>

      {/* Right: GPS mode + locate me */}
      {!poi && <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: sheetBottom + SHEET_PEEK + 16, gap: 10, alignItems: 'flex-end' }}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: gpsMode === 'saver' }}
          accessibilityLabel="Battery saver GPS"
          onPress={() => setGpsMode((g) => (g === 'saver' ? 'precise' : 'saver'))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: gpsMode === 'saver' ? c.successWash : c.goldSoft, ...shadowStyle('md') }}
        >
          <MapIcon name={gpsMode === 'saver' ? 'battery' : 'target'} color={gpsMode === 'saver' ? c.success : c.goldInk} size={18} />
          <AppText variant="caption" color={gpsMode === 'saver' ? c.success : c.goldInk}>{gpsMode === 'saver' ? 'Battery saver' : 'Precise GPS · 10 min'}</AppText>
        </Pressable>
        <RoundButton
          label="Show my position"
          onPress={() => {
            if (m.permission === 'denied') Alert.alert('Location is off', 'Allow location for CaminoPlus in Settings to see where you are.');
            setSelId(undefined);
            setLayer('City');
            setRecenterKey((k) => k + 1);
          }}
        >
          <MapIcon name="locate" color={c.blue} />
        </RoundButton>
      </View>}

      {!poi && <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen} peek={SHEET_PEEK} full={SHEET_FULL} bottom={sheetBottom}>
        {(
          <View style={{ gap: 6 }}>
            <AppText variant="h4">{ROUTE_NAME} · St-Jean → Santiago</AppText>
            <AppText variant="small" muted>
              {m.walkedKm} of {routeLengthKm} km walked · stage {m.stage.number} · {m.nextTownKm} km to {m.stage.name.split('→')[1]?.trim()}
            </AppText>
            <View style={{ marginTop: 12, gap: 10 }}>
              <AppText variant="label">This stage</AppText>
              <AppText variant="small" muted>{m.stage.name} · {m.stage.distanceKm} km</AppText>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pill label="Offline maps" onPress={() => router.push('/offline-maps')} />
                <Pill variant="ghost" label="Near me" onPress={() => setLayer('City')} />
              </View>
            </View>
          </View>
        )}
      </BottomSheet>}

      {poi && <PoiPopup poi={poi} bottom={sheetBottom + 12} onClose={() => onSelectPoi(undefined)} />}
    </View>
  );
}

function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center', ...shadowStyle('md') }}>
      {children}
    </Pressable>
  );
}

function StatusPill({ status, online, onPress }: { status: ReturnType<typeof useMapModel>['status']; online: boolean | null; onPress: () => void }) {
  const pill = (bg: string, fg: string, text: string, icon?: React.ReactNode) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 28, borderRadius: radius.pill, backgroundColor: bg }}>
      {icon}
      <AppText variant="caption" color={fg}>{text}</AppText>
    </Pressable>
  );
  if (status.kind === 'online') return pill(c.blue50, c.blue, 'Online map', <MapIcon name="cloud" color={c.blue} size={14} />);
  if (status.kind === 'ready')
    return status.stale
      ? pill(c.goldWash, c.goldInk, `${status.text} · check for update`, <Icon name="check" color={c.goldInk} size={14} />)
      : pill(c.successWash, c.success, status.text, <Icon name="check" color={c.success} size={14} />);
  if (status.kind === 'missing')
    return pill(c.red100, c.red700, `${online ? '' : 'Offline · '}No map pack for stage ${status.stageNumber} · Download`, online ? undefined : <MapIcon name="wifiOff" color={c.red700} size={14} />);
  return null;
}

/** Pop-up card that appears over the map when a place is tapped. */
function PoiPopup({ poi, bottom, onClose }: { poi: (typeof pois)[number]; bottom: number; onClose: () => void }) {
  return (
    <View style={{ position: 'absolute', left: 16, right: 16, bottom, borderRadius: radius.lg, backgroundColor: role.surface, padding: 20, gap: 10, ...shadowStyle('lg') }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ paddingHorizontal: 12, height: 30, borderRadius: radius.pill, backgroundColor: c.goldWash, justifyContent: 'center' }}>
          <AppText variant="caption" color={c.goldInk}>{KIND_LABEL[poi.kind]}{poi.xp ? ` · +${poi.xp} XP` : ''}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={14} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={role.muted} size={24} />
        </Pressable>
      </View>
      <AppText variant="h4">{poi.name}</AppText>
      <AppText variant="small" muted>{poi.blurb}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
        {poi.audioMin ? <Pill label={`Play story · ${poi.audioMin} min`} onPress={() => Alert.alert('Audio stories', 'Coming in the next build.')} /> : null}
        {poi.kind === 'quest' ? <Pill variant="gold" label="Start quest" onPress={() => Alert.alert('Quests', 'Coming in the next build.')} /> : null}
        <Pill variant="ghost" label="Save" onPress={() => Alert.alert('Saved', 'Saved to your plan (sample).')} />
      </View>
    </View>
  );
}
