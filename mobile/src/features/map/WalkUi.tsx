// Walk view overlay: instruction banner, round buttons, "What is near" chips, Re-center pill and the bottom card.
// Plain React Native views on top of the map, so the same UI shows over the native map and over the SVG preview
// on web and in Expo Go. Day = parchment / Atlantic Blue, night = deep navy.
// The controls that sit on the map (here and on the whole-route map in app/(tabs)/maps.tsx) are ONE family, big enough to hit with a thumb while walking:
// round buttons of BTN (56) with an icon of ICON (28), GAP (12) apart, EDGE (16) from the side of the screen; the zoom pair is one BTN x 2 BTN capsule;
// the Re-center pill is BTN high with a 24 arrow and its label at the `label` variant. controlLayout.ts says how many of them a short phone can hold.
import { Children, ReactNode, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import Svg, { Circle, G, Polygon } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { c, fixed, fonts, icon, layout, radius, role, shadowStyle, space } from '@/theme';
import type { Banner, Card, AheadItem } from './nav';
import type { PoiKind } from './sampleRoute';
import { POI_KINDS, kindHex } from './walkLayers';
import { MapIcon } from './MapIcon';
import type { GpsMode } from './useWalkerLocation';
import type { PackStatus } from './useMapModel';

/** The family of round map controls: a round button is BTN wide and high (layout.touchPrimary), its icon ICON (icon.mdPlus), GAP between two, EDGE from the screen. */
export const BTN = layout.touchPrimary;
export const ICON = icon.mdPlus;
export const GAP = space[3];
export const EDGE = layout.screenMargin;
/** The labels of the map's controls grow with the text setting up to this much, so a control never outgrows its place; the cards and sheets grow without a limit. */
export const CONTROL_TEXT_MAX = 1.3;

/**
 * Colours of the overlay in each light. The map has its own day and night, and they do not follow the app's light and dark mode: a pilgrim whose phone is dark
 * can walk by day, and the night overlay must read the same in a light app. So this reads the fixed palette, never `c.*`, which flips with the mode.
 */
export function walkTheme(night: boolean) {
  return night
    ? {
        banner: '#0C2340', bannerBorder: 'rgba(246,239,226,0.24)', onBanner: fixed.parchment, onBannerMuted: 'rgba(246,239,226,0.82)', arrowTile: 'rgba(246,239,226,0.14)',
        button: '#13243C', buttonActive: '#1E3A63', buttonBorder: 'rgba(246,239,226,0.24)', icon: fixed.parchment,
        card: '#101F36', cardText: fixed.parchment, cardMuted: '#B3C1D6', cardBorder: 'rgba(246,239,226,0.16)', handle: 'rgba(246,239,226,0.4)',
        chipOn: '#13243C', chipOff: 'rgba(16,31,54,0.82)', chipText: fixed.parchment, chipTextOff: '#9FB0C8', pill: '#13243C', pillText: fixed.parchment,
      }
    : {
        banner: fixed.blue, bannerBorder: 'transparent', onBanner: fixed.parchment, onBannerMuted: 'rgba(246,239,226,0.85)', arrowTile: 'rgba(246,239,226,0.16)',
        button: fixed.parchment, buttonActive: fixed.goldWash, buttonBorder: fixed.sand300, icon: fixed.blue,
        card: fixed.white, cardText: fixed.ink, cardMuted: fixed.stone600, cardBorder: fixed.sand300, handle: fixed.sand400,
        chipOn: fixed.white, chipOff: 'rgba(255,253,248,0.82)', chipText: fixed.ink, chipTextOff: fixed.stone600, pill: fixed.blue, pillText: fixed.parchment,
      };
}
export type WalkTheme = ReturnType<typeof walkTheme>;

/* ------------------------------------------------------------------ banner */

const ARROW: Record<Banner['kind'], IconName> = {
  straight: 'arrow-up', left: 'turn-left', right: 'turn-right', 'slight-left': 'turn-slight-left', 'slight-right': 'turn-slight-right',
  'sharp-left': 'turn-sharp-left', 'sharp-right': 'turn-sharp-right', 'u-turn': 'u-turn', arrive: 'flag', none: 'info',
};

/** Speaks a change of instruction on iOS (Android reads the live region itself). */
function useAnnounce(text: string) {
  const last = useRef('');
  useEffect(() => {
    if (text === last.current) return;
    last.current = text;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}

/** Keeps "stage 1" and "5.3 km" together when a line wraps. */
export const glue = (text: string) => text.replace(/(stage|Stage) (\d+)/g, '$1\u00A0$2').replace(/(\d) (km|m)\b/g, '$1\u00A0$2');

/** Big rounded banner: direction arrow on the left, "Toward Roncesvalles" / "Turn left in 120 m", then the way left. */
export function WalkBanner({ banner, night }: { banner: Banner; night: boolean }) {
  const t = walkTheme(night);
  useAnnounce(`${banner.main}. ${banner.sub}`);
  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${banner.main}. ${banner.sub}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 92, paddingVertical: 14, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: t.banner, borderWidth: night ? 1.5 : 0, borderColor: t.bannerBorder, ...shadowStyle('lg') }}
    >
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.arrowTile, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={ARROW[banner.kind]} color={t.onBanner} size={42} strokeWidth={3} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="h4" color={t.onBanner} numberOfLines={2}>{glue(banner.main)}</AppText>
        <AppText variant="small" color={t.onBannerMuted} numberOfLines={2}>{glue(banner.sub)}</AppText>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ small notices */

export function Notice({ tone, children }: { tone: 'gold' | 'blue' | 'red'; children: ReactNode }) {
  const bg = tone === 'gold' ? c.goldWash : tone === 'red' ? c.red100 : c.blue50;
  const fg = tone === 'gold' ? c.goldInk : tone === 'red' ? c.red700 : c.blue;
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: space[3], paddingVertical: space[2], justifyContent: 'center', borderRadius: radius.md, backgroundColor: bg }}>
      <AppText variant="caption" color={fg} style={{ flexShrink: 1 }}>{children}</AppText>
    </View>
  );
}

/**
 * The notices under the banner, in order of importance, as many as fit in `maxH`: a whole notice or none, never one cut in half. On a short phone the notices, the
 * Re-center pill and the bottom card share one band, and a notice must not run under the pill or the card. The ones that do not fit stay laid out (so they are
 * measured) but are not drawn.
 */
export function NoticeStack({ maxH, children }: { maxH: number; children: ReactNode }) {
  const items = Children.toArray(children);
  const [heights, setHeights] = useState<Record<string, number>>({});
  let used = 0;
  return (
    <View pointerEvents="box-none" style={{ gap: space[2] }}>
      {items.map((child, i) => {
        const key = isValidElement(child) && child.key != null ? String(child.key) : String(i);
        const h = heights[key];
        const gap = used > 0 ? space[2] : 0;
        const fits = h == null || used + gap + h <= maxH;
        if (h != null && fits) used += gap + h;
        return (
          <View
            key={key}
            pointerEvents={fits ? 'box-none' : 'none'}
            onLayout={(e) => {
              const next = Math.round(e.nativeEvent.layout.height);
              setHeights((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
            }}
            style={fits ? undefined : { position: 'absolute', opacity: 0 }}
          >
            {child}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ the stack of round buttons */

type BtnProps = {
  label: string; onPress: () => void; night: boolean; active?: boolean; children: ReactNode;
  role?: 'button' | 'switch'; checked?: boolean; expanded?: boolean;
};

/** A round control of the map: BTN wide and high, the icon inside is ICON. */
export function RoundBtn({ label, onPress, night, active, children, role = 'button', checked, expanded }: BtnProps) {
  const t = walkTheme(night);
  const state = { ...(checked != null ? { checked } : {}), ...(expanded != null ? { expanded } : {}) };
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={state}
      aria-checked={checked}
      aria-expanded={expanded}
      onPress={onPress}
      style={({ pressed }) => ({
        width: BTN, height: BTN, borderRadius: radius.pill, backgroundColor: active ? t.buttonActive : t.button,
        borderWidth: night || active ? 1.5 : 0, borderColor: active ? c.gold : t.buttonBorder, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
        ...shadowStyle('md'),
      })}
    >
      {children}
    </Pressable>
  );
}

/** Compass: the red tip points to north on the map (so it turns with the map bearing). */
export function CompassIcon({ bearing, night, size = ICON }: { bearing: number; night: boolean; size?: number }) {
  const t = walkTheme(night);
  return (
    <Svg width={size} height={size} viewBox="-20 -20 40 40">
      <Circle r="17" fill="none" stroke={t.icon} strokeWidth="2" opacity={0.35} />
      <G transform={`rotate(${-bearing})`}>
        <Polygon points="0,-14 6,2 -6,2" fill={c.red} />
        <Polygon points="0,14 6,-2 -6,-2" fill={night ? fixed.parchment : '#FFFFFF'} stroke={t.icon} strokeWidth="1.5" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

/** Sun / moon: shows the light the map has now; the small A says it follows the sun by itself. */
export function LightIcon({ night, auto, size = ICON, color }: { night: boolean; auto: boolean; size?: number; color?: string }) {
  const t = walkTheme(night);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={night ? 'moon' : 'sun'} color={color ?? t.icon} size={size} strokeWidth={2} />
      {auto && (
        // design-lint-ignore: inset a fixed 20 px badge that holds one letter, the way a count badge does: the letter is about 4 px from the outline, only its 22 px line box is taller
        <View style={{ position: 'absolute', right: -space[3], bottom: -space[3], width: 20, height: 20, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="label" color={role.onHighlight} allowFontScaling={false}>A</AppText>
        </View>
      )}
    </View>
  );
}

/** Zoom in and zoom out: one capsule, BTN wide and two buttons tall, each half a BTN x BTN button with the same icon as the round ones. */
export function ZoomPair({ night, onIn, onOut }: { night: boolean; onIn: () => void; onOut: () => void }) {
  const t = walkTheme(night);
  const half = (label: string, onPress: () => void, name: 'plus' | 'minus') => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: BTN, height: BTN, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <MapIcon name={name} color={t.icon} size={ICON} />
    </Pressable>
  );
  // The outline and the line between the two halves are drawn over them, so the halves are exactly BTN high each.
  return (
    <View style={{ width: BTN, height: 2 * BTN, borderRadius: radius.pill, backgroundColor: t.button, ...shadowStyle('md') }}>
      {half('Zoom in', onIn, 'plus')}
      {half('Zoom out', onOut, 'minus')}
      <View pointerEvents="none" style={{ position: 'absolute', left: space[3], right: space[3], top: BTN, height: 1, backgroundColor: night ? t.buttonBorder : fixed.sand300 }} />
      {night && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: radius.pill, borderWidth: 1.5, borderColor: t.buttonBorder }} />}
    </View>
  );
}

/* ------------------------------------------------------------------ "What is near": show or hide pin kinds */

export function NearChips({ night, hidden, onToggle }: { night: boolean; hidden: PoiKind[]; onToggle: (k: PoiKind) => void }) {
  const t = walkTheme(night);
  const hex = kindHex(night);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[2], paddingVertical: space[1], paddingRight: space[2] }} style={{ flexGrow: 0 }}>
      {POI_KINDS.map(({ kind, label }) => {
        const on = !hidden.includes(kind);
        return (
          <Pressable
            key={kind}
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={`${label} pins`}
            onPress={() => onToggle(kind)}
            style={{ height: layout.touchHard, paddingHorizontal: space[4], borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space[2], backgroundColor: on ? t.chipOn : t.chipOff, borderWidth: 1.5, borderColor: on ? hex[kind] : t.buttonBorder, ...shadowStyle('sm') }}
          >
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: on ? hex[kind] : 'transparent', borderWidth: 2, borderColor: hex[kind] }} />
            <AppText variant="label" color={on ? t.chipText : t.chipTextOff}>{label}</AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ Re-center */

/** The pill at the bottom left: BTN high, a 24 arrow and "Re-center" at the `label` variant. `maxWidth` keeps a gap between it and the column at the right. */
export function RecenterPill({ night, onPress, maxWidth }: { night: boolean; onPress: () => void; maxWidth: number }) {
  const t = walkTheme(night);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Re-center the map on my position"
      onPress={onPress}
      style={({ pressed }) => ({ height: BTN, maxWidth, paddingHorizontal: space[5], borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space[2], backgroundColor: t.pill, borderWidth: night ? 1.5 : 0, borderColor: t.buttonBorder, opacity: pressed ? 0.9 : 1, ...shadowStyle('md') })}
    >
      <Icon name="navigation" color={t.pillText} size={icon.md} strokeWidth={2.2} />
      <AppText variant="label" color={t.pillText} numberOfLines={1} maxFontSizeMultiplier={CONTROL_TEXT_MAX} style={{ flexShrink: 1 }}>Re-center</AppText>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ bottom card */

type CardProps = {
  night: boolean;
  bottomInset: number;
  /** tallest the expanded card may be */
  maxH: number;
  card: Card;
  live: boolean;
  next: AheadItem[];
  status: PackStatus;
  online: boolean | null;
  onOpenOffline: () => void;
  gpsMode: GpsMode;
  onToggleGps: () => void;
  buildings3d: boolean;
  onToggle3d: () => void;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onRouteDetails: () => void;
  /** What the flag button says it opens: "Route details", or "Route details and map options" when the column folded some controls into the sheet. */
  routeLabel?: string;
  /** A control that the column at the right had no room for (the help bell on a short phone), shown in the row of buttons between the flag and Exit. */
  extra?: ReactNode;
  onExit: () => void;
  /** height the card covers at rest, so the camera keeps the walker above it */
  onHeight: (h: number) => void;
};

const packLine = (status: PackStatus, online: boolean | null) => {
  if (status.kind === 'online') return { text: 'Online map. Tap to manage offline maps.', tone: 'ok' as const };
  if (status.kind === 'ready') return { text: status.stale ? `${status.text} · check for update` : status.text, tone: status.stale ? ('warn' as const) : ('ok' as const) };
  if (status.kind === 'missing') return { text: `${online ? '' : 'Offline · '}No map pack for stage ${status.stageNumber} · Download`, tone: 'bad' as const };
  return null;
};

export function WalkCard(p: CardProps) {
  const t = walkTheme(p.night);
  const [headerH, setHeaderH] = useState(0);
  const fullH = Math.max(headerH + 120, Math.min(p.maxH, headerH + 400));
  const hidden = Math.max(0, fullH - headerH); // how far the card slides down when collapsed
  const y = useRef(new Animated.Value(fullH)).current;
  const start = useRef(0);
  const lastDrag = useRef(0); // on web a drag ends in a click on the handle: it must not toggle the card again
  const expandedRef = useRef(p.expanded);
  expandedRef.current = p.expanded;

  useEffect(() => {
    Animated.spring(y, { toValue: p.expanded ? 0 : hidden, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [p.expanded, hidden, y]);
  const { onHeight } = p;
  useEffect(() => {
    if (headerH > 0) onHeight(p.expanded ? fullH : headerH);
  }, [p.expanded, fullH, headerH, onHeight]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          lastDrag.current = Date.now();
          y.stopAnimation((v) => (start.current = v));
        },
        onPanResponderMove: (_, g) => y.setValue(Math.min(hidden, Math.max(0, start.current + g.dy))),
        onPanResponderRelease: (_, g) => {
          lastDrag.current = Date.now();
          const end = start.current + g.dy;
          const next = g.vy < -0.3 ? true : g.vy > 0.3 ? false : end < hidden / 2;
          Animated.spring(y, { toValue: next ? 0 : hidden, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
          if (next !== expandedRef.current) p.onExpandedChange(next);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hidden, y],
  );

  const pack = packLine(p.status, p.online);
  const row = (children: ReactNode) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>{children}</View>;

  return (
    <Animated.View
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: fullH, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
        backgroundColor: t.card, borderTopWidth: p.night ? 1.5 : 0, borderColor: t.cardBorder, ...shadowStyle('lg'), transform: [{ translateY: y }],
      }}
    >
      <View onLayout={(e) => setHeaderH(Math.round(e.nativeEvent.layout.height))}>
        {/* Handle: drag up to open, down to close, or tap. */}
        <View {...pan.panHandlers}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={p.expanded ? 'Show less' : 'Show more: next places, offline map and GPS'}
            accessibilityState={{ expanded: p.expanded }}
            aria-expanded={p.expanded}
            onPress={() => {
              if (Date.now() - lastDrag.current < 400) return;
              p.onExpandedChange(!expandedRef.current);
            }}
            style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: 56, height: 6, borderRadius: radius.pill, backgroundColor: t.handle }} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: layout.screenMargin }} accessible accessibilityLabel={`${p.card.time === '--' ? 'Time left unknown' : `${p.card.time} left`}. ${p.card.detail}. ${p.card.stage}`}>
          <AppText variant="h2" color={t.cardText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{p.card.time}</AppText>
          <AppText variant="body" color={t.cardText} numberOfLines={1}>{glue(p.card.detail)}</AppText>
          <AppText variant="small" color={t.cardMuted} numberOfLines={2}>{glue(p.card.stage)}</AppText>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: GAP, paddingHorizontal: EDGE, paddingTop: space[3], paddingBottom: p.bottomInset + space[3] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={p.routeLabel ?? 'Route details'}
            onPress={p.onRouteDetails}
            style={({ pressed }) => ({ width: BTN, height: BTN, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, ...shadowStyle('gold') })}
          >
            <Icon name="flag" color={role.onHighlight} size={ICON} strokeWidth={2.2} />
          </Pressable>
          {p.extra}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Exit Walk view and show the whole route"
            onPress={p.onExit}
            style={({ pressed }) => ({ flex: 1, height: BTN, borderRadius: radius.pill, backgroundColor: c.red, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.88 : 1 })}
          >
            <AppText variant="lead" color={c.parchment} maxFontSizeMultiplier={CONTROL_TEXT_MAX} style={{ fontFamily: fonts.bodyBold }}>Exit</AppText>
          </Pressable>
        </View>
      </View>

      <ScrollView scrollEnabled={p.expanded} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: layout.screenMargin, paddingBottom: p.bottomInset + space[6], gap: space[3] }}>
        <AppText variant="mono" color={t.cardMuted} style={{ textTransform: 'uppercase' }}>Next on the way</AppText>
        {p.live ? (
          p.next.length ? (
            p.next.map((n) => (
              <View key={n.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 }} accessible accessibilityLabel={`${n.name}, ${(n.distanceM / 1000).toFixed(1)} kilometres`}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: n.kind === 'town' ? 'transparent' : kindHex(p.night)[n.kind as PoiKind] ?? c.stone500, borderWidth: 3, borderColor: n.kind === 'town' ? t.cardText : '#FFFFFF' }} />
                <AppText variant="body" color={t.cardText} numberOfLines={1} style={{ flex: 1 }}>{n.name}</AppText>
                <AppText variant="label" color={t.cardMuted}>{n.distanceM < 1000 ? `${Math.round(n.distanceM)} m` : `${(n.distanceM / 1000).toFixed(1)} km`}</AppText>
              </View>
            ))
          ) : (
            <AppText variant="small" color={t.cardMuted}>Nothing more ahead on this preview route.</AppText>
          )
        ) : (
          <AppText variant="small" color={t.cardMuted}>Distances appear once your position is on the Camino.</AppText>
        )}

        <View style={{ height: 1, backgroundColor: t.cardBorder, marginVertical: 4 }} />
        {pack && (
          <Pressable accessibilityRole="button" accessibilityLabel={pack.text} onPress={p.onOpenOffline} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
            <MapIcon name={p.status.kind === 'online' ? 'cloud' : 'download'} color={pack.tone === 'bad' ? c.red : pack.tone === 'warn' ? c.gold : t.cardText} size={24} />
            <AppText variant="small" color={pack.tone === 'bad' ? (p.night ? '#F2B2A8' : c.red700) : t.cardText} style={{ flex: 1 }}>{pack.text}</AppText>
            <Icon name="chevron" color={t.cardMuted} size={20} />
          </Pressable>
        )}
        {row(
          <>
            <MapIcon name={p.gpsMode === 'precise' ? 'target' : 'battery'} color={p.gpsMode === 'precise' ? c.gold : t.cardText} size={24} />
            <View style={{ flex: 1 }}>
              <AppText variant="small" color={t.cardText}>{p.gpsMode === 'precise' ? 'Precise GPS · 10 min' : 'GPS: battery saver'}</AppText>
              <AppText variant="caption" color={t.cardMuted}>{p.gpsMode === 'precise' ? 'More accurate, uses more battery.' : 'Turn on precise GPS to find a door or a turn.'}</AppText>
            </View>
            <Switch
              accessibilityLabel="Precise GPS for 10 minutes"
              value={p.gpsMode === 'precise'}
              onValueChange={p.onToggleGps}
              trackColor={{ false: p.night ? '#35507A' : c.sand400, true: c.gold }}
              thumbColor="#FFFFFF"
            />
          </>,
        )}
        {row(
          <>
            <Icon name="building" color={t.cardText} size={24} />
            <View style={{ flex: 1 }}>
              <AppText variant="small" color={t.cardText}>3D buildings</AppText>
              <AppText variant="caption" color={t.cardMuted}>Turn off if the map feels slow.</AppText>
            </View>
            <Switch
              accessibilityLabel="3D buildings"
              value={p.buildings3d}
              onValueChange={p.onToggle3d}
              trackColor={{ false: p.night ? '#35507A' : c.sand400, true: c.gold }}
              thumbColor="#FFFFFF"
            />
          </>,
        )}
      </ScrollView>
    </Animated.View>
  );
}
