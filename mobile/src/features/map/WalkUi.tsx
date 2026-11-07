// Walk view overlay: instruction banner, round buttons, "What is near" chips, Re-center pill and the bottom card.
// Plain React Native views on top of the map, so the same UI shows over the native map and over the SVG preview
// on web and in Expo Go. Day = parchment / Atlantic Blue, night = deep navy. Touch targets are 48 dp or more.
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import Svg, { Circle, G, Polygon } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { c, layout, radius, role, shadowStyle } from '@/theme';
import type { Banner, Card, AheadItem } from './nav';
import type { PoiKind } from './sampleRoute';
import { POI_KINDS, kindHex } from './walkLayers';
import { MapIcon } from './MapIcon';
import type { GpsMode } from './useWalkerLocation';
import type { PackStatus } from './useMapModel';

/** Colours of the overlay in each light. */
export function walkTheme(night: boolean) {
  return night
    ? {
        banner: '#0C2340', bannerBorder: 'rgba(246,239,226,0.24)', onBanner: c.parchment, onBannerMuted: 'rgba(246,239,226,0.82)', arrowTile: 'rgba(246,239,226,0.14)',
        button: '#13243C', buttonActive: '#1E3A63', buttonBorder: 'rgba(246,239,226,0.24)', icon: c.parchment,
        card: '#101F36', cardText: c.parchment, cardMuted: '#B3C1D6', cardBorder: 'rgba(246,239,226,0.16)', handle: 'rgba(246,239,226,0.4)',
        chipOn: '#13243C', chipOff: 'rgba(16,31,54,0.82)', chipText: c.parchment, chipTextOff: '#9FB0C8', pill: '#13243C', pillText: c.parchment,
      }
    : {
        banner: c.blue, bannerBorder: 'transparent', onBanner: c.parchment, onBannerMuted: 'rgba(246,239,226,0.85)', arrowTile: 'rgba(246,239,226,0.16)',
        button: c.parchment, buttonActive: c.goldWash, buttonBorder: c.sand300, icon: c.blue,
        card: c.white, cardText: c.ink, cardMuted: c.stone600, cardBorder: c.sand300, handle: c.sand400,
        chipOn: c.white, chipOff: 'rgba(255,253,248,0.82)', chipText: c.ink, chipTextOff: c.stone600, pill: c.blue, pillText: c.parchment,
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
    <View style={{ alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 14, minHeight: 32, paddingVertical: 5, justifyContent: 'center', borderRadius: 16, backgroundColor: bg }}>
      <AppText variant="caption" color={fg} style={{ flexShrink: 1 }}>{children}</AppText>
    </View>
  );
}

/* ------------------------------------------------------------------ the stack of round buttons */

type BtnProps = {
  label: string; onPress: () => void; night: boolean; size?: number; active?: boolean; children: ReactNode;
  role?: 'button' | 'switch'; checked?: boolean; expanded?: boolean;
};

export function RoundBtn({ label, onPress, night, size = 56, active, children, role = 'button', checked, expanded }: BtnProps) {
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
        width: size, height: size, borderRadius: size / 2, backgroundColor: active ? t.buttonActive : t.button,
        borderWidth: night || active ? 1.5 : 0, borderColor: active ? c.gold : t.buttonBorder, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
        ...shadowStyle('md'),
      })}
    >
      {children}
    </Pressable>
  );
}

/** Compass: the red tip points to north on the map (so it turns with the map bearing). */
export function CompassIcon({ bearing, night, size = 34 }: { bearing: number; night: boolean; size?: number }) {
  const t = walkTheme(night);
  return (
    <Svg width={size} height={size} viewBox="-20 -20 40 40">
      <Circle r="17" fill="none" stroke={t.icon} strokeWidth="2" opacity={0.35} />
      <G transform={`rotate(${-bearing})`}>
        <Polygon points="0,-14 6,2 -6,2" fill={c.red} />
        <Polygon points="0,14 6,-2 -6,-2" fill={night ? c.parchment : '#FFFFFF'} stroke={t.icon} strokeWidth="1.5" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

/** Sun / moon: shows the light the map has now; the small A says it follows the sun by itself. */
export function LightIcon({ night, auto, size = 26, color }: { night: boolean; auto: boolean; size?: number; color?: string }) {
  const t = walkTheme(night);
  return (
    <View style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={night ? 'moon' : 'sun'} color={color ?? t.icon} size={size} strokeWidth={2} />
      {auto && (
        <View style={{ position: 'absolute', right: -6, bottom: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="caption" color={role.onHighlight} style={{ fontSize: 11, lineHeight: 14, letterSpacing: 0, fontFamily: 'Inter_600SemiBold' }}>A</AppText>
        </View>
      )}
    </View>
  );
}

export function ZoomPair({ night, size, onIn, onOut }: { night: boolean; size: number; onIn: () => void; onOut: () => void }) {
  const t = walkTheme(night);
  const half = (label: string, onPress: () => void, icon: 'plus' | 'minus') => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <MapIcon name={icon} color={t.icon} size={26} />
    </Pressable>
  );
  return (
    <View style={{ borderRadius: size / 2, backgroundColor: t.button, borderWidth: night ? 1.5 : 0, borderColor: t.buttonBorder, overflow: 'hidden', ...shadowStyle('md') }}>
      {half('Zoom in', onIn, 'plus')}
      <View style={{ height: 1, marginHorizontal: 10, backgroundColor: night ? t.buttonBorder : c.sand300 }} />
      {half('Zoom out', onOut, 'minus')}
    </View>
  );
}

/* ------------------------------------------------------------------ "What is near": show or hide pin kinds */

export function NearChips({ night, hidden, onToggle }: { night: boolean; hidden: PoiKind[]; onToggle: (k: PoiKind) => void }) {
  const t = walkTheme(night);
  const hex = kindHex(night);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingRight: 8 }} style={{ flexGrow: 0 }}>
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
            style={{ height: 48, paddingHorizontal: 16, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: on ? t.chipOn : t.chipOff, borderWidth: 1.5, borderColor: on ? hex[kind] : t.buttonBorder, ...shadowStyle('sm') }}
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

export function RecenterPill({ night, onPress }: { night: boolean; onPress: () => void }) {
  const t = walkTheme(night);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Re-center the map on my position"
      onPress={onPress}
      style={({ pressed }) => ({ height: 52, paddingHorizontal: 20, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.pill, borderWidth: night ? 1.5 : 0, borderColor: t.buttonBorder, opacity: pressed ? 0.9 : 1, ...shadowStyle('md') })}
    >
      <Icon name="navigation" color={t.pillText} size={22} strokeWidth={2.2} />
      <AppText variant="label" color={t.pillText}>Re-center</AppText>
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: layout.screenMargin, paddingTop: 12, paddingBottom: p.bottomInset + 14 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Route details"
            onPress={p.onRouteDetails}
            style={({ pressed }) => ({ width: 60, height: 60, borderRadius: 30, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, ...shadowStyle('gold') })}
          >
            <Icon name="flag" color={role.onHighlight} size={28} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Exit Walk view and show the whole route"
            onPress={p.onExit}
            style={({ pressed }) => ({ flex: 1, height: 60, borderRadius: 30, backgroundColor: c.red, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.88 : 1 })}
          >
            <AppText variant="lead" color={c.parchment} style={{ fontFamily: 'Inter_600SemiBold' }}>Exit</AppText>
          </Pressable>
        </View>
      </View>

      <ScrollView scrollEnabled={p.expanded} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: layout.screenMargin, paddingBottom: p.bottomInset + 24, gap: 10 }}>
        <AppText variant="mono" color={t.cardMuted} style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 }}>Next on the way</AppText>
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
