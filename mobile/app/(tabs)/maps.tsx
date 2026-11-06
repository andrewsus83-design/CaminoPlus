import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { ModalSheet } from '@/features/map/ModalSheet';
import { setTabBarHidden } from '@/lib/tabBarVisibility';
import { GpsMode, MapLayerMode, MapView, PRECISE_TIMEOUT_MS, ROUTE_NAME, nativeMapAvailable, pois, routeLengthKm } from '@/features/map';
import type { PoiKind } from '@/features/map';
import { HelpBellButton, HelpSheet } from '@/features/social';
import { useAuth } from '@/lib/auth';
import { MapIcon } from '@/features/map/MapIcon';
import { useMapModel } from '@/features/map/useMapModel';
import { CompassIcon, LightIcon, NearChips, Notice, RecenterPill, RoundBtn, WalkBanner, WalkCard, ZoomPair, walkTheme } from '@/features/map/WalkUi';
import { useWalkSettings } from '@/features/map/walkSettings';
import { POI_KINDS } from '@/features/map/walkLayers';
import { c, layout, radius, role, shadowStyle } from '@/theme';

// 'Helicopter' = whole route, 'City' = the Walk view (tilted, heading-up, close around you). Shown with plain names.
const LAYERS: { mode: MapLayerMode; label: string }[] = [{ mode: 'Helicopter', label: 'Whole route' }, { mode: 'City', label: 'Near me' }];
const KIND_LABEL = { church: 'Church', albergue: 'Albergue', water: 'Drinking water', cafe: 'Café', quest: 'Quest', stamp: 'Stamp point' } as const;
const NEXT_LIGHT = { auto: 'day', day: 'night', night: 'automatic' } as const;

export default function Maps() {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const SHEET_FULL = Math.min(Math.round(screenH * 0.6), 560);
  const CARD_MAX = Math.min(Math.round(screenH * 0.66), 580);
  const TAB_H = 88;
  const router = useRouter();
  const focused = useIsFocused();
  const [layer, setLayer] = useState<MapLayerMode>('Helicopter');
  const [selId, setSelId] = useState<string | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [gpsMode, setGpsMode] = useState<GpsMode>('saver');
  const [recenterKey, setRecenterKey] = useState(0);
  const [zoomCmd, setZoomCmd] = useState<{ dir: 1 | -1; n: number }>({ dir: 1, n: 0 });
  // Walk view state. The camera follows the walker until the pilgrim moves the map by hand.
  const [follow, setFollow] = useState(true);
  const [headingUp, setHeadingUp] = useState(true);
  const [bearing, setBearing] = useState(0);
  const [light, setLight] = useState<'auto' | 'day' | 'night'>('auto');
  const [nearOpen, setNearOpen] = useState(false);
  const [hiddenKinds, setHiddenKinds] = useState<PoiKind[]>([]);
  const [cardOpen, setCardOpen] = useState(false);
  const [cardH, setCardH] = useState(250);
  const [bannerH, setBannerH] = useState(96);
  const [aboveH, setAboveH] = useState(96);
  const { buildings3d, setBuildings3d } = useWalkSettings();
  const m = useMapModel({ gpsMode, visible: focused });
  const { journey } = useAuth();
  // The map data in this build is a preview of the Camino Frances. Say so when someone walks another Camino.
  const otherRoute = !!journey?.route && journey.route.slug !== 'camino-frances' ? (journey.route.short_name ?? journey.route.name) : null;
  // Without the native map (web, Expo Go) the SVG preview needs no map fonts, so do not wait for them.
  const canDraw = !!m.glyphs || !nativeMapAvailable;

  const walk = layer === 'City';
  // Night: by the sun at the walker's place, or the pilgrim's choice (Auto -> Day -> Night -> Auto).
  const night = light === 'night' || (light === 'auto' && m.autoNight);
  const theme = walkTheme(night);

  // Automatic: once a real GPS fix is on the route, switch to the Walk view once.
  const autoDone = useRef(false);
  useEffect(() => {
    if (!autoDone.current && !m.walker.sample) { autoDone.current = true; setLayer('City'); }
  }, [m.walker.sample]);
  // Every time the Walk view opens, the camera follows again.
  useEffect(() => {
    if (layer === 'City') setFollow(true);
  }, [layer]);

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

  const tabBarSpace = insets.bottom + TAB_H;
  const sheetBottom = tabBarSpace;
  // The tab bar is hidden while the Walk view or the details sheet is open and comes back when they close (or you leave Maps).
  const sheetShown = sheetOpen && !poi && focused;
  const walkShown = walk && focused;
  const hideTabs = sheetShown || walkShown;
  useEffect(() => {
    setTabBarHidden(hideTabs);
    return () => setTabBarHidden(false);
  }, [hideTabs]);

  // The tab bar is hidden in the Walk view, so the Android back button steps out of it: place card, details, bottom card, then the view itself.
  useEffect(() => {
    if (!walkShown) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selId) setSelId(undefined);
      else if (sheetOpen) setSheetOpen(false);
      else if (cardOpen) setCardOpen(false);
      else if (nearOpen) setNearOpen(false);
      else {
        setLayer('Helicopter');
        setSelId(undefined);
      }
      return true;
    });
    return () => sub.remove();
  }, [walkShown, selId, sheetOpen, cardOpen, nearOpen]);

  const poiKinds = useMemo(() => (hiddenKinds.length ? POI_KINDS.map((k) => k.kind).filter((k) => !hiddenKinds.includes(k)) : undefined), [hiddenKinds]);
  const toggleKind = useCallback((k: PoiKind) => setHiddenKinds((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k])), []);
  const exitWalk = useCallback(() => {
    setLayer('Helicopter');
    setNearOpen(false);
    setCardOpen(false);
    setSelId(undefined);
  }, []);
  const recenter = useCallback(() => {
    setSelId(undefined);
    setFollow(true);
    setRecenterKey((k) => k + 1);
  }, []);
  const locate = () => {
    if (m.permission === 'denied') Alert.alert('Location is off', 'Allow location for CaminoPlus in Settings to see where you are.');
    setSelId(undefined);
    setLayer('City');
    recenter();
  };
  const toggleGps = () => setGpsMode((g) => (g === 'saver' ? 'precise' : 'saver'));
  const cycleLight = () => setLight((l) => (l === 'auto' ? 'day' : l === 'day' ? 'night' : 'auto'));
  const lightLabel = `Map light: ${light === 'auto' ? `automatic, now ${night ? 'night' : 'day'}` : light}. Tap for ${NEXT_LIGHT[light]}.`;

  // What the camera keeps clear: banner and card in the Walk view, the chrome and tab bar otherwise.
  const mapInsets = walk ? { top: insets.top + 8 + bannerH + 8, bottom: cardH } : { top: insets.top + 100, bottom: sheetBottom };
  // The Walk view's button stack takes the room between the banner and the card: 56, 52 or 48 dp buttons, scrolling only if even 48 does not fit.
  const stackMax = Math.max(0, screenH - (insets.top + 8) - aboveH - 8 - cardH - 16);
  const btn = [56, 52, 48].find((s) => 8 * s + 48 <= stackMax) ?? 48; // 8 = help bell, compass, near, GPS, light, route details and the zoom pair (2)
  const stackScrolls = 8 * btn + 48 > stackMax;
  const gpsColor = gpsMode === 'saver' ? (night ? '#7FD6A4' : c.success) : c.gold;

  return (
    <View style={{ flex: 1, backgroundColor: night ? '#0C1626' : role.bg }}>
      {canDraw ? (
        <MapView
          layer={layer}
          online={m.useOnlineTiles}
          packSources={m.packSources}
          glyphs={m.glyphs ?? ''}
          done={m.done}
          remaining={m.remaining}
          walker={m.walker}
          focus={m.walker.at}
          recenterKey={recenterKey}
          zoomCmd={zoomCmd}
          selectedPoiId={selId}
          onSelectPoi={onSelectPoi}
          saver={gpsMode !== 'precise'}
          insets={mapInsets}
          night={night}
          buildings3d={buildings3d}
          follow={follow}
          headingUp={headingUp}
          headingDeg={m.nav.headingDeg}
          ahead={m.nav.ahead}
          beyond={m.nav.beyond}
          stageEnd={m.nav.stageEnd}
          poiKinds={poiKinds}
          onFollowChange={setFollow}
          onBearingChange={setBearing}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="small" muted>{m.glyphError ? `Map fonts failed: ${m.glyphError}` : 'Preparing offline map…'}</AppText>
        </View>
      )}

      {m.glyphs && !m.useOnlineTiles && m.packSources.length === 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', left: layout.screenMargin, right: layout.screenMargin, top: '36%', backgroundColor: role.surface, borderRadius: radius.lg, padding: 24, gap: 8 }}>
          <AppText variant="h4">No map tiles yet</AppText>
          <AppText variant="body" muted>{m.online === false ? 'You are offline and this stage has no offline pack. Download it in Offline maps.' : 'The online base map needs a MapTiler key (EXPO_PUBLIC_MAPTILER_KEY), or download this stage in Offline maps.'}</AppText>
        </View>
      )}

      {/* Keyed so the Walk view and the overview are separate trees: react-native-web only watches a view's size if it had onLayout when it was created. */}
      {walk ? (
        <Fragment key="walk">
          {/* Top: instruction banner and the "What is near" chips; below them notices on the left, round buttons on the right.
              The map keeps getting touches everywhere around them. */}
          <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: layout.screenMargin, right: layout.screenMargin }}>
            <View pointerEvents="box-none" style={{ gap: 8 }} onLayout={(e) => setAboveH(Math.round(e.nativeEvent.layout.height))}>
              <View onLayout={(e) => setBannerH(Math.round(e.nativeEvent.layout.height))}>
                <WalkBanner banner={m.nav.banner} night={night} />
              </View>
              {nearOpen && !poi && <NearChips night={night} hidden={hiddenKinds} onToggle={toggleKind} />}
            </View>

            <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
              <View pointerEvents="box-none" style={{ flex: 1, gap: 8 }}>
                {m.walker.sample && <Notice tone="blue">{m.gpsOffRoute ? 'You are not on the Camino yet · showing a sample position' : 'Showing a sample position'}</Notice>}
                {!!otherRoute && <Notice tone="gold">{`Maps for ${otherRoute} are coming. This is a preview of the Camino Francés.`}</Notice>}
                {m.status.kind === 'missing' && (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/offline-maps')} style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
                    <Notice tone="red">{`${m.online ? '' : 'Offline · '}No map pack for stage ${m.status.stageNumber} · Download`}</Notice>
                  </Pressable>
                )}
                {m.status.kind === 'ready' && m.status.stale && (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/offline-maps')} style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
                    <Notice tone="gold">Offline map is out of date · Update</Notice>
                  </Pressable>
                )}
                {!nativeMapAvailable && <Notice tone="red">Preview map. The real map needs the dev build.</Notice>}
              </View>

              {/* Right: round buttons. They step aside while a place card or the opened bottom card needs the room. */}
              {!poi && !cardOpen && (
                <View pointerEvents="box-none">
                  {(() => {
                    const stack = (
                      <View pointerEvents="box-none" style={{ alignItems: 'flex-end', gap: 8 }}>
                        <HelpBellButton tone={night ? 'night' : 'day'} size={btn} onPress={() => setHelpOpen(true)} />
                        <RoundBtn
                          night={night} size={btn}
                          label={headingUp ? 'Compass. The map turns as you walk. Tap to keep north at the top.' : 'Compass. North is at the top. Tap to turn the map as you walk.'}
                          onPress={() => setHeadingUp((h) => !h)}
                        >
                          <CompassIcon bearing={bearing} night={night} size={btn - 20} />
                        </RoundBtn>
                        <RoundBtn night={night} size={btn} label="What is near" expanded={nearOpen} active={nearOpen} onPress={() => setNearOpen((o) => !o)}>
                          <Icon name="search" color={theme.icon} size={28} strokeWidth={2} />
                        </RoundBtn>
                        <RoundBtn night={night} size={btn} label="Battery saver GPS" role="switch" checked={gpsMode === 'saver'} active={gpsMode === 'precise'} onPress={toggleGps}>
                          <MapIcon name={gpsMode === 'saver' ? 'battery' : 'target'} color={gpsColor} size={28} />
                        </RoundBtn>
                        <RoundBtn night={night} size={btn} label={lightLabel} onPress={cycleLight}>
                          <LightIcon night={night} auto={light === 'auto'} />
                        </RoundBtn>
                        <RoundBtn night={night} size={btn} label="Route details" onPress={() => setSheetOpen(true)}>
                          <Icon name="flag" color={theme.icon} size={26} strokeWidth={2} />
                        </RoundBtn>
                        <ZoomPair night={night} size={btn} onIn={() => setZoomCmd((z) => ({ dir: 1, n: z.n + 1 }))} onOut={() => setZoomCmd((z) => ({ dir: -1, n: z.n + 1 }))} />
                      </View>
                    );
                    return stackScrolls ? <ScrollView style={{ maxHeight: stackMax }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>{stack}</ScrollView> : stack;
                  })()}
                </View>
              )}
            </View>
          </View>

          {!poi && !follow && (
            <View pointerEvents="box-none" style={{ position: 'absolute', left: layout.screenMargin, bottom: cardH + 12 }}>
              <RecenterPill night={night} onPress={recenter} />
            </View>
          )}

          {!poi && (
            <WalkCard
              night={night}
              bottomInset={insets.bottom}
              maxH={CARD_MAX}
              card={m.nav.card}
              live={m.nav.live}
              next={m.nav.next}
              status={m.status}
              online={m.online}
              onOpenOffline={() => router.push('/offline-maps')}
              gpsMode={gpsMode}
              onToggleGps={toggleGps}
              buildings3d={buildings3d}
              onToggle3d={() => setBuildings3d(!buildings3d)}
              expanded={cardOpen}
              onExpandedChange={setCardOpen}
              onRouteDetails={() => setSheetOpen(true)}
              onExit={exitWalk}
              onHeight={setCardH}
            />
          )}
        </Fragment>
      ) : (
        <Fragment key="heli">
          {/* Top: layer switch + pack status */}
          <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: layout.screenMargin, right: layout.screenMargin, gap: 10 }}>
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
            {!!otherRoute && (
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, minHeight: 28, paddingVertical: 4, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.goldWash }}>
                <AppText variant="caption" color={c.goldInk}>{`Maps for ${otherRoute} are coming. This is a preview of the Camino Francés.`}</AppText>
              </View>
            )}
            {m.gpsOffRoute && (
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, height: 28, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.blue50 }}>
                <AppText variant="caption" color={c.blue}>You are not on the Camino yet · showing a sample position</AppText>
              </View>
            )}
            {!nativeMapAvailable && (
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, minHeight: 28, paddingVertical: 4, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.red100 }}>
                <AppText variant="caption" color={c.red700}>Preview map. The real map needs the dev build.</AppText>
              </View>
            )}
          </View>

          {/* Right: GPS mode + locate me */}
          {!poi && <View pointerEvents="box-none" style={{ position: 'absolute', right: layout.screenMargin, bottom: sheetBottom + 16, gap: 10, alignItems: 'flex-end' }}>
            <HelpBellButton tone="day" size={48} onPress={() => setHelpOpen(true)} />
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: gpsMode === 'saver' }}
              accessibilityLabel="Battery saver GPS"
              onPress={toggleGps}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: gpsMode === 'saver' ? c.successWash : c.goldSoft, ...shadowStyle('md') }}
            >
              <MapIcon name={gpsMode === 'saver' ? 'battery' : 'target'} color={gpsMode === 'saver' ? c.success : c.goldInk} size={18} />
              <AppText variant="caption" color={gpsMode === 'saver' ? c.success : c.goldInk}>{gpsMode === 'saver' ? 'Battery saver' : 'Precise GPS · 10 min'}</AppText>
            </Pressable>
            <RoundButton label="Show my position" onPress={locate}>
              <MapIcon name="locate" color={c.blue} />
            </RoundButton>
            <RoundButton label={lightLabel} onPress={cycleLight}>
              <LightIcon night={night} auto={light === 'auto'} size={24} color={c.blue} />
            </RoundButton>
            <View style={{ borderRadius: radius.pill, backgroundColor: role.surface, ...shadowStyle('md'), overflow: 'hidden' }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => setZoomCmd((z) => ({ dir: 1, n: z.n + 1 }))} style={{ width: 48, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                <MapIcon name="plus" color={c.blue} size={24} />
              </Pressable>
              <View style={{ height: 1, backgroundColor: c.sand300 }} />
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => setZoomCmd((z) => ({ dir: -1, n: z.n + 1 }))} style={{ width: 48, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                <MapIcon name="minus" color={c.blue} size={24} />
              </Pressable>
            </View>
            <RoundButton label="Route details" onPress={() => setSheetOpen(true)}>
              <Icon name="flag" color={c.blue} size={24} />
            </RoundButton>
          </View>}
        </Fragment>
      )}

      {sheetShown && <ModalSheet half={SHEET_FULL} max={screenH - insets.top - 8} bottomInset={insets.bottom} onClose={() => setSheetOpen(false)}>
        {(
          <View style={{ gap: 6 }}>
            <AppText variant="h4">{ROUTE_NAME} · St-Jean → Santiago</AppText>
            <AppText variant="small" muted>
              {m.walkedKm} of {routeLengthKm} km walked · stage {m.stage.number} · {m.nextTownKm} km to {m.stage.name.split('→')[1]?.trim()}
            </AppText>
            <AppText variant="caption" muted>Preview data: the first three stages are hand-placed and the rest is drawn as straight lines between towns. Do not navigate with it yet.</AppText>
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
      </ModalSheet>}

      {poi && <PoiPopup poi={poi} bottom={(walk ? insets.bottom : sheetBottom) + 12} onClose={() => onSelectPoi(undefined)} />}

      {/* Help bell: private alert to the friends and groups the pilgrim picks, plus a one-tap 112 call. Only a REAL fix is passed on, never the sample position. */}
      <HelpSheet
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
        position={m.fix ? { lat: m.fix.at[1], lng: m.fix.at[0], accuracyM: m.fix.accuracyM, at: m.fix.timestamp } : null}
        placeText={m.nav.live ? `about ${m.nextTownKm} km before ${m.stage.name.split('→')[1]?.trim() ?? 'the next town'}, stage ${m.stage.number}` : null}
      />
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
    <View style={{ position: 'absolute', left: layout.screenMargin, right: layout.screenMargin, bottom, borderRadius: radius.lg, backgroundColor: role.surface, padding: 20, gap: 10, ...shadowStyle('lg') }}>
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
      <AppText variant="caption" muted>Preview pin. Opening hours, beds and water can change: check locally.</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
        {poi.audioMin ? <Pill label={`Play story · ${poi.audioMin} min`} onPress={() => Alert.alert('Audio stories', 'Coming in the next build.')} /> : null}
        {poi.kind === 'quest' ? <Pill variant="gold" label="Start quest" onPress={() => Alert.alert('Quests', 'Coming in the next build.')} /> : null}
        <Pill variant="ghost" label="Save" onPress={() => Alert.alert('Saved', 'Saved to your plan (sample).')} />
      </View>
    </View>
  );
}
