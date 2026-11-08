import { Fragment, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { ModalSheet } from '@/features/map/ModalSheet';
import { setTabBarHidden } from '@/lib/tabBarVisibility';
import { GpsMode, MapLayerMode, MapView, PRECISE_TIMEOUT_MS, ROUTE_NAME, nativeMapAvailable, routeLengthKm } from '@/features/map';
import type { PoiKind } from '@/features/map';
import { OSM_CREDIT, type PlacePin } from '@/features/places';
import { HelpBellButton, HelpSheet } from '@/features/social';
import { useAuth } from '@/lib/auth';
import { MapIcon } from '@/features/map/MapIcon';
import { useMapModel } from '@/features/map/useMapModel';
import { BTN, CONTROL_TEXT_MAX, EDGE, GAP, ICON, CompassIcon, LightIcon, NearChips, Notice, NoticeStack, RecenterPill, RoundBtn, WalkBanner, WalkCard, ZoomPair, walkTheme } from '@/features/map/WalkUi';
import { fitControls, pillMaxWidth, routeRoom, walkRoom, type Slot } from '@/features/map/controlLayout';
import { useWalkSettings } from '@/features/map/walkSettings';
import { POI_KINDS } from '@/features/map/walkLayers';
import { c, fixed, icon, layout, radius, role, shadowStyle, space } from '@/theme';

// 'Helicopter' = whole route, 'City' = the Walk view (tilted, heading-up, close around you). Shown with plain names.
const LAYERS: { mode: MapLayerMode; label: string }[] = [{ mode: 'Helicopter', label: 'Whole route' }, { mode: 'City', label: 'Near me' }];
const KIND_LABEL = { church: 'Church', albergue: 'Albergue', water: 'Drinking water', cafe: 'Café', quest: 'Quest', stamp: 'Stamp point' } as const;
const NEXT_LIGHT = { auto: 'day', day: 'night', night: 'automatic' } as const;

// The round controls on the map, most important first (controlLayout.ts: a short phone shows the first ones that fit and folds the rest into "Map options" in the
// route sheet, which the flag button opens). The zoom pair is a capsule of two buttons. In the Walk view the flag is the gold button of the bottom card, so the column
// has none; on the whole route the flag is the last button of the column and is kept whenever something is folded.
const one = (id: string): Slot => ({ id, h: BTN });
// The chips of "What is near" take room under the banner, so the column gets shorter while they are open: then the button that closes them moves up and stays.
const walkRank = (nearOpen: boolean): Slot[] => [{ id: 'zoom', h: 2 * BTN }, one('bell'), ...(nearOpen ? [one('near'), one('compass')] : [one('compass'), one('near')]), one('light'), one('gps')];
const ROUTE_RANK: Slot[] = [{ id: 'zoom', h: 2 * BTN }, one('bell'), one('locate'), one('light'), one('gps'), one('details')];
// ...and where they stand, top to bottom (the zoom pair last, nearest the thumb)
const WALK_ORDER = ['bell', 'compass', 'near', 'light', 'gps', 'zoom'];
const ROUTE_ORDER = ['bell', 'locate', 'light', 'gps', 'details', 'zoom'];

export default function Maps() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
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
  const [topH, setTopH] = useState(100);
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

  // The pins come from the stage's real places, or are the bundled sample pins when the database has none for it.
  const poi = m.pins.find((p) => p.id === selId);
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
  const mapInsets = walk ? { top: insets.top + layout.screenTop + bannerH + 8, bottom: cardH } : { top: insets.top + 100, bottom: sheetBottom }; // top-gap-ok: camera padding, not a screen margin
  // The column of round buttons at the right takes the room between the banner (and the chips) and the bottom card in the Walk view, between the top block and the
  // tab bar on the whole route (the tab bar floats 88 high at max(inset - 14, 10), as components/TabBar.tsx draws it). It shows the buttons that fit, most important
  // first, and folds the rest into "Map options" in the route sheet (controlLayout.ts). A short phone, a tall banner or a large text setting folds more.
  const tabTop = Math.max(insets.bottom - 14, 10) + TAB_H;
  const room = walk
    ? walkRoom({ screenH, topInset: insets.top, screenTop: layout.screenTop, aboveH, cardH, gap: GAP, edge: GAP })
    : routeRoom({ screenH, topInset: insets.top, screenTop: layout.screenTop, topH, tabBarH: tabTop, gap: GAP, edge: EDGE });
  // The zoom pair never folds; on the whole route nor does the bell (in the Walk view a bell with no room in the column moves into the row of buttons of the card).
  const fit = fitControls(walk ? walkRank(nearOpen && !poi) : ROUTE_RANK, room, { gap: GAP, pinned: walk ? undefined : 'details', must: walk ? ['zoom'] : ['zoom', 'bell'] });
  // The notices under the banner (Walk view) may use what is left of the band between the banner and the card, above the Re-center pill when it is there.
  const noticeRoom = Math.max(0, Math.floor(screenH - cardH - GAP - (follow ? 0 : BTN + GAP) - (insets.top + layout.screenTop + aboveH + space[2])));
  // Not even one button fits (the largest text on a short phone): the column is not drawn, and every control, the zoom pair too, is a row of "Map options".
  const columnHidden = fit.scroll && room < BTN;
  const foldedIds = columnHidden ? [...(walk ? WALK_ORDER : ROUTE_ORDER).filter((id) => id !== 'zoom'), 'zoomIn', 'zoomOut'] : fit.folded;
  const flagLabel = foldedIds.length ? 'Route details and map options' : 'Route details';
  const gpsColor = gpsMode === 'saver' ? (night ? '#7FD6A4' : fixed.success) : fixed.gold;
  const lightValue = light === 'auto' ? `Automatic, now ${night ? 'night' : 'day'}` : light === 'day' ? 'Day' : 'Night';

  // Every control once: as a round button of the column, and (the ones that fold) as a row of "Map options".
  const nodes: Record<string, ReactNode> = {
    bell: <HelpBellButton key="bell" tone={night ? 'night' : 'day'} size={BTN} onPress={() => setHelpOpen(true)} />,
    compass: (
      <RoundBtn
        key="compass" night={night}
        label={headingUp ? 'Compass. The map turns as you walk. Tap to keep north at the top.' : 'Compass. North is at the top. Tap to turn the map as you walk.'}
        onPress={() => setHeadingUp((h) => !h)}
      >
        <CompassIcon bearing={bearing} night={night} size={ICON} />
      </RoundBtn>
    ),
    near: (
      <RoundBtn key="near" night={night} label="What is near" expanded={nearOpen} active={nearOpen} onPress={() => setNearOpen((o) => !o)}>
        <Icon name="search" color={theme.icon} size={ICON} strokeWidth={2} />
      </RoundBtn>
    ),
    locate: (
      <RoundBtn key="locate" night={night} label="Show my position" onPress={locate}>
        <MapIcon name="locate" color={theme.icon} size={ICON} />
      </RoundBtn>
    ),
    gps: (
      <RoundBtn key="gps" night={night} label="Battery saver GPS" role="switch" checked={gpsMode === 'saver'} active={gpsMode === 'precise'} onPress={toggleGps}>
        <MapIcon name={gpsMode === 'saver' ? 'battery' : 'target'} color={gpsColor} size={ICON} />
      </RoundBtn>
    ),
    light: (
      <RoundBtn key="light" night={night} label={lightLabel} onPress={cycleLight}>
        <LightIcon night={night} auto={light === 'auto'} size={ICON} />
      </RoundBtn>
    ),
    details: (
      <RoundBtn key="details" night={night} label={flagLabel} onPress={() => setSheetOpen(true)}>
        <Icon name="flag" color={theme.icon} size={ICON} strokeWidth={2} />
      </RoundBtn>
    ),
    zoom: <ZoomPair key="zoom" night={night} onIn={() => setZoomCmd((z) => ({ dir: 1, n: z.n + 1 }))} onOut={() => setZoomCmd((z) => ({ dir: -1, n: z.n + 1 }))} />,
  };
  const optionRows: Record<string, { label: string; value: string; glyph: ReactNode; onPress: () => void; role?: 'button' | 'switch'; checked?: boolean }> = {
    bell: { label: 'Need help', value: 'Call 112 or tell your friends where you are', glyph: <Icon name="bell" color={role.danger} size={ICON} strokeWidth={2} />, onPress: () => { setSheetOpen(false); setHelpOpen(true); } },
    compass: { label: 'Map direction', value: headingUp ? 'The map turns as you walk' : 'North is at the top', glyph: <CompassIcon bearing={bearing} night={false} size={ICON} />, onPress: () => setHeadingUp((h) => !h) },
    near: { label: 'What is near', value: nearOpen ? 'Pin types are shown' : 'Choose which pins to show', glyph: <Icon name="search" color={role.text} size={ICON} strokeWidth={2} />, onPress: () => { setSheetOpen(false); setNearOpen((o) => !o); } },
    locate: { label: 'Show my position', value: 'Opens the Near me view', glyph: <MapIcon name="locate" color={role.text} size={ICON} />, onPress: () => { setSheetOpen(false); locate(); } },
    light: { label: 'Map light', value: lightValue, glyph: <LightIcon night={night} auto={light === 'auto'} size={ICON} color={role.text} />, onPress: cycleLight },
    gps: { label: 'GPS', value: gpsMode === 'saver' ? 'Battery saver' : 'Precise, for 10 minutes', glyph: <MapIcon name={gpsMode === 'saver' ? 'battery' : 'target'} color={gpsMode === 'saver' ? c.success : c.goldInk} size={ICON} />, onPress: toggleGps, role: 'switch', checked: gpsMode === 'saver' },
    zoomIn: { label: 'Zoom in', value: 'Show the map closer', glyph: <MapIcon name="plus" color={role.text} size={ICON} />, onPress: () => setZoomCmd((z) => ({ dir: 1, n: z.n + 1 })) },
    zoomOut: { label: 'Zoom out', value: 'Show more of the map', glyph: <MapIcon name="minus" color={role.text} size={ICON} />, onPress: () => setZoomCmd((z) => ({ dir: -1, n: z.n + 1 })) },
  };
  // The help bell is never two taps away: when the column has no room for it (or has to scroll), it sits in the row of buttons of the bottom card (a row of "Map options" has it too).
  const bellInCard = walk && (fit.scroll || !fit.shown.includes('bell'));
  // The controls of the column, top to bottom. When even the zoom pair does not fit the column scrolls, and then the zoom pair comes first, so it is what is in view.
  const columnIds = (order: string[]) => (fit.scroll ? ['zoom', ...order.filter((id) => id !== 'zoom' && !(bellInCard && id === 'bell'))] : order.filter((id) => fit.shown.includes(id)));

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
          pois={m.pins}
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
          {/* Top: instruction banner and the "What is near" chips; under them the notices, on the left. The right is the column's: a gap stays between them.
              The map keeps getting touches everywhere around them. */}
          <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + layout.screenTop, left: EDGE, right: EDGE }}>
            <View pointerEvents="box-none" style={{ gap: space[2] }} onLayout={(e) => setAboveH(Math.round(e.nativeEvent.layout.height))}>
              <View onLayout={(e) => setBannerH(Math.round(e.nativeEvent.layout.height))}>
                <WalkBanner banner={m.nav.banner} night={night} />
              </View>
              {nearOpen && !poi && <NearChips night={night} hidden={hiddenKinds} onToggle={toggleKind} />}
            </View>

            <View pointerEvents="box-none" style={{ marginTop: space[2], marginRight: BTN + GAP }}>
              <NoticeStack maxH={noticeRoom}>
                {m.walker.sample && <Notice key="sample" tone="blue">{m.gpsOffRoute ? 'You are not on the Camino yet · showing a sample position' : 'Showing a sample position'}</Notice>}
                {!!otherRoute && <Notice key="route" tone="gold">{`Maps for ${otherRoute} are coming. This is a preview of the Camino Francés.`}</Notice>}
                {m.status.kind === 'missing' && (
                  <Pressable key="missing" accessibilityRole="button" hitSlop={space[2]} onPress={() => router.push('/offline-maps')} style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
                    <Notice tone="red">{`${m.online ? '' : 'Offline · '}No map pack for stage ${m.status.stageNumber} · Download`}</Notice>
                  </Pressable>
                )}
                {m.status.kind === 'ready' && m.status.stale && (
                  <Pressable key="stale" accessibilityRole="button" hitSlop={space[2]} onPress={() => router.push('/offline-maps')} style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
                    <Notice tone="gold">Offline map is out of date · Update</Notice>
                  </Pressable>
                )}
                {!nativeMapAvailable && <Notice key="preview" tone="red">Preview map. The real map needs the dev build.</Notice>}
              </NoticeStack>
            </View>
          </View>

          {/* Right: the round buttons, in a column that ends one gap above the bottom card (the zoom pair, the one nearest the thumb, last). They step aside while a place
              card or the opened bottom card needs the room. */}
          {!poi && !cardOpen && (
            <View pointerEvents="box-none" style={{ position: 'absolute', right: EDGE, bottom: cardH + GAP }}>
              <ControlColumn ids={columnIds(WALK_ORDER)} nodes={nodes} room={room} scroll={fit.scroll} />
            </View>
          )}

          {/* Left: the Re-center pill, on the same line as the bottom of the column, never wider than the room that the column leaves it. */}
          {!poi && !follow && (
            <View pointerEvents="box-none" style={{ position: 'absolute', left: EDGE, bottom: cardH + GAP }}>
              <RecenterPill night={night} onPress={recenter} maxWidth={pillMaxWidth(screenW, BTN, GAP, EDGE)} />
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
              routeLabel={flagLabel}
              extra={bellInCard ? nodes.bell : undefined}
              onExit={exitWalk}
              onHeight={setCardH}
            />
          )}
        </Fragment>
      ) : (
        <Fragment key="heli">
          {/* Top: layer switch and the offline maps button on one line (the button drops to the next line when the switch and the large text leave it no room), then the pack
              status and the notices. */}
          <View onLayout={(e) => setTopH(Math.round(e.nativeEvent.layout.height))} pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + layout.screenTop, left: EDGE, right: EDGE, gap: GAP }}>
            <View pointerEvents="box-none" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: GAP }}>
              <LayerSwitch layer={layer} night={night} compact={screenW < 350} onChange={setLayer} />
              <View style={{ marginLeft: 'auto' }}>
                <RoundBtn night={night} label="Offline maps" onPress={() => router.push('/offline-maps')}>
                  <MapIcon name="download" color={theme.icon} size={ICON} />
                </RoundBtn>
              </View>
            </View>
            <StatusPill status={m.status} online={m.online} onPress={() => router.push('/offline-maps')} />
            {!!otherRoute && <Notice tone="gold">{`Maps for ${otherRoute} are coming. This is a preview of the Camino Francés.`}</Notice>}
            {m.gpsOffRoute && <Notice tone="blue">You are not on the Camino yet · showing a sample position</Notice>}
            {!nativeMapAvailable && <Notice tone="red">Preview map. The real map needs the dev build.</Notice>}
          </View>

          {/* Right: the round buttons, in a column that ends one margin above the tab bar. */}
          {!poi && (
            <View pointerEvents="box-none" style={{ position: 'absolute', right: EDGE, bottom: tabTop + EDGE }}>
              <ControlColumn ids={columnIds(ROUTE_ORDER)} nodes={nodes} room={room} scroll={fit.scroll} />
            </View>
          )}
        </Fragment>
      )}

      {sheetShown && <ModalSheet half={SHEET_FULL} max={screenH - insets.top - layout.screenTop} bottomInset={insets.bottom} onClose={() => setSheetOpen(false)}>
        {(
          <View style={{ gap: space[2] }}>
            <AppText variant="h4">{ROUTE_NAME} · St-Jean → Santiago</AppText>
            <AppText variant="small" muted>
              {m.walkedKm} of {routeLengthKm} km walked · stage {m.stage.number} · {m.nextTownKm} km to {m.stage.name.split('→')[1]?.trim()}
            </AppText>
            {/* The controls that did not fit in the column of round buttons (a short phone, a tall banner, large text): the same buttons, as rows. */}
            {foldedIds.some((id) => optionRows[id]) && (
              <View style={{ marginTop: space[3], gap: space[1] }}>
                <AppText variant="label">Map options</AppText>
                {foldedIds.filter((id) => optionRows[id]).map((id) => {
                  const r = optionRows[id];
                  return <OptionRow key={id} label={r.label} value={r.value} onPress={r.onPress} role={r.role} checked={r.checked}>{r.glyph}</OptionRow>;
                })}
              </View>
            )}
            <AppText variant="caption" muted>{m.routeNotice}</AppText>
            {m.pinSource === 'sample' && m.pins.length > 0 && <AppText variant="caption" muted>The pins on the map are examples.</AppText>}
            {m.pinSource !== 'sample' && <AppText variant="caption" muted>{`The pins on the map are places from OpenStreetMap${m.pinSource === 'cache' ? ', saved on this phone' : ''}. Tap one to see how far it was checked. ${OSM_CREDIT}.`}</AppText>}
            <View style={{ marginTop: space[3], gap: space[3] }}>
              <AppText variant="label">This stage</AppText>
              <AppText variant="small" muted>{m.stage.name} · {m.stage.distanceKm} km</AppText>
              <View style={{ flexDirection: 'row', gap: space[3] }}>
                <Pill label="Offline maps" onPress={() => router.push('/offline-maps')} />
                <Pill variant="ghost" label="Near me" onPress={() => setLayer('City')} />
              </View>
            </View>
          </View>
        )}
      </ModalSheet>}

      {poi && <PoiPopup poi={poi} bottom={(walk ? insets.bottom : sheetBottom) + 12} onClose={() => onSelectPoi(undefined)} onOpenStay={(id) => router.push(`/stay/${id}?stage=${m.stage.id}`)} />}

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

/** The column of round buttons: one above the other, GAP apart, on the right. When even the zoom pair does not fit the room it scrolls inside it (the last resort). */
function ControlColumn({ ids, nodes, room, scroll }: { ids: string[]; nodes: Record<string, ReactNode>; room: number; scroll: boolean }) {
  const stack = <View pointerEvents="box-none" style={{ alignItems: 'flex-end', gap: GAP }}>{ids.map((id) => nodes[id])}</View>;
  if (!scroll) return stack;
  if (room < BTN) return null; // not even one button fits: Map options (the flag of the card) has them all
  return <ScrollView style={{ maxHeight: room }} showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'flex-end' }}>{stack}</ScrollView>;
}

/** "Whole route / Near me": two tabs in one pill, as high as a round button (BTN) so that it lines up with the offline maps button next to it. */
function LayerSwitch({ layer, night, compact, onChange }: { layer: MapLayerMode; night: boolean; compact: boolean; onChange: (l: MapLayerMode) => void }) {
  const t = walkTheme(night);
  return (
    <View accessibilityRole="tablist" style={{ flexShrink: 1, flexDirection: 'row', padding: space[1], borderRadius: radius.pill, backgroundColor: t.button, borderWidth: night ? 1.5 : 0, borderColor: t.buttonBorder, ...shadowStyle('md') }}>
      {LAYERS.map((l) => {
        const on = layer === l.mode;
        return (
          <Pressable
            key={l.mode} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(l.mode)}
            style={{ flexShrink: 1, height: layout.touchHard, paddingHorizontal: compact ? space[2] : space[4], borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? (night ? t.buttonActive : fixed.blue) : 'transparent' }}
          >
            <AppText variant="label" numberOfLines={1} maxFontSizeMultiplier={CONTROL_TEXT_MAX} color={on ? fixed.parchment : t.icon}>{l.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One of the controls that were folded, as a row of "Map options": its icon, its name, and what it is now. At least BTN high. */
function OptionRow({ label, value, onPress, role: kind = 'button', checked, children }: { label: string; value: string; onPress: () => void; role?: 'button' | 'switch'; checked?: boolean; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityLabel={`${label}. ${value}`}
      accessibilityState={checked != null ? { checked } : undefined}
      aria-checked={checked}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: BTN, flexDirection: 'row', alignItems: 'center', gap: space[2], opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ width: ICON + space[3], alignItems: 'flex-start' }}>{children}</View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="small" muted>{value}</AppText>
      </View>
    </Pressable>
  );
}

function StatusPill({ status, online, onPress }: { status: ReturnType<typeof useMapModel>['status']; online: boolean | null; onPress: () => void }) {
  // 8 px of room round the words; the tap area is at least 48 high with the hitSlop (the pill is 37 high).
  const pill = (bg: string, fg: string, text: string, glyph?: ReactNode) => (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={space[2]} style={{ alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.md, backgroundColor: bg }}>
      {glyph}
      <AppText variant="caption" color={fg} style={{ flexShrink: 1 }}>{text}</AppText>
    </Pressable>
  );
  if (status.kind === 'online') return pill(c.blue50, c.blue, 'Online map', <MapIcon name="cloud" color={c.blue} size={icon.sm} />);
  if (status.kind === 'ready')
    return status.stale
      ? pill(c.goldWash, c.goldInk, `${status.text} · check for update`, <Icon name="check" color={c.goldInk} size={icon.sm} />)
      : pill(c.successWash, c.success, status.text, <Icon name="check" color={c.success} size={icon.sm} />);
  if (status.kind === 'missing')
    return pill(c.red100, c.red700, `${online ? '' : 'Offline · '}No map pack for stage ${status.stageNumber} · Download`, online ? undefined : <MapIcon name="wifiOff" color={c.red700} size={icon.sm} />);
  return null;
}

/** Pop-up card that appears over the map when a place is tapped. A real place says where it came from; a sample pin says it is a preview. */
function PoiPopup({ poi, bottom, onClose, onOpenStay }: { poi: PlacePin; bottom: number; onClose: () => void; onOpenStay: (stayId: string) => void }) {
  return (
    <View style={{ position: 'absolute', left: layout.screenMargin, right: layout.screenMargin, bottom, borderRadius: radius.lg, backgroundColor: role.surface, padding: 20, gap: 10, ...shadowStyle('lg') }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ paddingHorizontal: 12, height: 30, borderRadius: radius.pill, backgroundColor: c.goldWash, justifyContent: 'center' }}>
          <AppText variant="caption" color={c.goldInk}>{poi.label ?? KIND_LABEL[poi.kind]}{poi.xp ? ` · +${poi.xp} XP` : ''}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={14} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={role.muted} size={24} />
        </Pressable>
      </View>
      <AppText variant="h4">{poi.name}</AppText>
      <AppText variant="small" muted>{poi.blurb}</AppText>
      <AppText variant="caption" muted>
        {poi.sample ? 'Preview pin.' : `${poi.sourceLine}${poi.osmUrl ? ` · ${OSM_CREDIT}` : ''}.`} Opening hours, beds and water can change: check locally.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
        {poi.audioMin ? <Pill label={`Play story · ${poi.audioMin} min`} onPress={() => Alert.alert('Audio stories', 'Coming in the next build.')} /> : null}
        {poi.kind === 'quest' ? <Pill variant="gold" label="Start quest" onPress={() => Alert.alert('Quests', 'Coming in the next build.')} /> : null}
        {poi.sample ? <Pill variant="ghost" label="Save" onPress={() => Alert.alert('Saved', 'Saved to your plan (sample).')} /> : null}
        {poi.stayId ? <Pill label="See the stay" onPress={() => onOpenStay(poi.stayId as string)} /> : null}
      </View>
    </View>
  );
}
