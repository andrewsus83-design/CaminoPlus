import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { fixed } from '@/theme';
import type { MapPin, MapViewProps } from './map/types';
import { progressAlong } from './map/nav';
import { routeLine } from './map/sampleRoute';
import { kindHex, puckScreenY } from './map/walkLayers';
import { buildScene, dotsAlong, localCumulative, makeCamera, ribbon, toLocal, type P2 } from './map/walkScene';

// Stylised preview of the map, for web and Expo Go where MapLibre is not available. The real map (MapLibre + offline
// packs, map/LiveMap.tsx) takes the same props. 'Helicopter' is a sketch of the whole route; the Walk view ('City') is a
// drawing of the real route ahead with made-up blocks beside it, tilted and turned like the real thing: drag it to see
// the Re-center pill, tap a pin to open its card.
export const heliTowns = [
  { name: 'St-Jean', x: 40, y: 560, done: true },
  { name: 'Pamplona', x: 120, y: 470, done: true },
  { name: 'Logroño', x: 200, y: 390, done: true },
  { name: 'Burgos', x: 250, y: 300, done: true },
  { name: 'León', x: 160, y: 200, done: false },
  { name: 'Santiago', x: 60, y: 90, done: false },
];

type Props = MapViewProps & { width: number; height: number };

export function MapCanvas(props: Props) {
  return props.layer === 'Helicopter' ? <Overview {...props} /> : <WalkScene {...props} />;
}

function Overview({ width, height, night }: Props) {
  const ground = night ? '#0C1626' : '#E7E0CB';
  const land = night ? '#10272F' : '#CFDCC8';
  const route = night ? '#8CC8FF' : fixed.stone500;
  const ink = night ? '#F6EFE2' : fixed.blue;
  return (
    <Svg width={width} height={height} viewBox="0 -80 390 844" preserveAspectRatio="xMidYMid slice">
      <Rect x="-200" y="-300" width="800" height="1400" fill={ground} />
      <Path d="M0 120 Q120 60 200 140 T390 100 V-300 H0Z" fill={land} />
      <Path d="M0 600 Q140 540 260 610 T390 560 V1000 H0Z" fill={land} />
      <Path d="M40 560 L120 470 L200 390 L250 300 L160 200 L60 90" stroke={route} strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" fill="none" />
      <Path d="M40 560 L120 470 L200 390 L250 300" stroke={fixed.gold} strokeWidth="6" strokeLinecap="round" fill="none" />
      {heliTowns.map((t) => (
        <G key={t.name}>
          <Circle cx={t.x} cy={t.y} r={t.done ? 9 : 7} fill={t.done ? fixed.gold : night ? '#0C2340' : fixed.white} stroke={night ? '#8CC8FF' : fixed.blue} strokeWidth="3" />
          <SvgText x={t.x + 16} y={t.y + 5} fontSize="14" fontWeight="600" fill={ink}>{t.name}</SvgText>
        </G>
      ))}
    </Svg>
  );
}

// Colours of the drawing in each light. A map has its own day and night; it does not follow the app's light/dark mode,
// so it uses the fixed (light) palette, never c.* (fixed.blue would be light blue on the day ground in dark mode).
const LOOK = {
  day: { ground: '#EFE5D2', road: '#FFFFFF', roadCase: '#D3C4A8', roof: '#EBDFC9', sideA: '#D4C5A8', sideB: '#BDAE90', edge: '#B3A483', route: fixed.blue, halo: '#FFFFFF', accuracy: fixed.blue, ink: fixed.blue, inkHalo: fixed.parchment, puck: '#1E4A7A', glow: 'none' },
  night: { ground: '#0C1626', road: '#3B5780', roadCase: '#070E19', roof: '#5A86BE', sideA: '#3C6395', sideB: '#2B4B75', edge: '#1D3454', route: '#8CC8FF', halo: '#06101C', accuracy: '#4C9BFF', ink: '#F6EFE2', inkHalo: '#08111E', puck: '#3F8CF0', glow: '#4C9BFF' },
} as const;

type S = { sx: number; sy: number };
const pts = (ps: (S | null)[]) => (ps.every(Boolean) ? (ps as S[]).map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ') : null);

/** Text with an outline, so it reads over roads and blocks. */
function Label({ x, y, size, fill, halo, children }: { x: number; y: number; size: number; fill: string; halo: string; children: string }) {
  return (
    <>
      <SvgText x={x} y={y} fontSize={size} fontWeight="600" fill="none" stroke={halo} strokeWidth="4" strokeLinejoin="round">{children}</SvgText>
      <SvgText x={x} y={y} fontSize={size} fontWeight="600" fill={fill}>{children}</SvgText>
    </>
  );
}

function WalkScene(p: Props) {
  const { width, height } = p;
  const look = p.night ? LOOK.night : LOOK.day;
  const hex = kindHex(!!p.night);
  const follow = p.follow !== false;
  const headingUp = p.headingUp !== false;
  const walkerHeading = p.headingDeg ?? 0;
  const camHeading = headingUp ? walkerHeading : 0;
  const [scale, setScale] = useState(3.2); // pixels per metre at the walker (about zoom 17.5)
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // how far the pilgrim dragged the drawing
  const walker = p.walker?.at ?? p.focus;
  const sample = !!p.walker?.sample;

  const alongM = useMemo(() => progressAlong(routeLine, walker).alongM, [walker]);
  const roundedHeading = Math.round(camHeading / 5) * 5;
  const scene = useMemo(() => buildScene(routeLine, alongM, roundedHeading, p.buildings3d !== false), [alongM, roundedHeading, p.buildings3d]);

  // Dragging detaches (the Re-center pill appears); a re-center slides the drawing back.
  const live = useRef({ follow, offset, onFollowChange: p.onFollowChange });
  live.current = { follow, offset, onFollowChange: p.onFollowChange };
  const start = useRef({ x: 0, y: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 8,
        onPanResponderGrant: () => {
          start.current = live.current.offset;
        },
        onPanResponderMove: (_, g) => {
          setOffset({ x: start.current.x + g.dx, y: start.current.y + g.dy });
          if (live.current.follow) live.current.onFollowChange?.(false);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [],
  );
  useEffect(() => {
    if (follow) setOffset({ x: 0, y: 0 });
  }, [follow, p.recenterKey]);
  const zoomN = p.zoomCmd?.n ?? 0;
  const zoomDir = p.zoomCmd?.dir ?? 1;
  useEffect(() => {
    if (zoomN) setScale((s) => Math.min(9, Math.max(1.4, s * (zoomDir > 0 ? 1.35 : 0.74))));
  }, [zoomN, zoomDir]);

  const puckY = puckScreenY(height, p.insets.top, p.insets.bottom);
  const cam = useMemo(() => makeCamera(width, puckY, camHeading, scale), [width, puckY, camHeading, scale]);
  const proj = (q: P2, z = 0) => cam.project(q.x, q.y, z);
  const ribbonOf = (line: P2[], w: number) => {
    const ring = ribbon(line, w);
    return ring.length ? pts(ring.map((q) => proj(q))) : null;
  };

  // The route: thin gold behind the walker, a bold dotted line with a halo ahead.
  const { behind, dots } = useMemo(() => {
    const r = scene.route;
    const cum = localCumulative(r);
    const here = Math.min(140, alongM);
    const idx = Math.max(1, cum.findIndex((m) => m > here + 0.01));
    const origin: P2 = { x: 0, y: 0 };
    return { behind: [...r.slice(0, idx), origin], dots: dotsAlong([origin, ...r.slice(idx)], 8).slice(1) };
  }, [scene, alongM]);

  const blocks = useMemo(() => {
    const centre = (b: { poly: P2[] }) => proj({ x: b.poly.reduce((a, q) => a + q.x, 0) / 4, y: b.poly.reduce((a, q) => a + q.y, 0) / 4 });
    return scene.blocks
      .map((b) => ({ b, depth: centre(b)?.depth ?? -1 }))
      .filter((x) => x.depth > 0)
      .sort((a, z) => z.depth - a.depth)
      .map((x) => x.b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, cam]);

  const shownPois = p.pois
    .filter((poi) => !p.poiKinds || p.poiKinds.includes(poi.kind))
    .map((poi) => ({ poi, s: proj(toLocal(scene.origin, poi.at)) }))
    .filter((x): x is { poi: MapPin; s: NonNullable<ReturnType<typeof proj>> } => !!x.s && x.s.sx > -20 && x.s.sx < width + 20 && x.s.sy > 90 && x.s.sy < height - 20);

  const end = p.stageEnd ? proj(toLocal(scene.origin, p.stageEnd.at)) : null;
  const acc = Math.min(Math.max(p.walker?.accuracyM ?? 0, 0), 150);
  const accRing = acc > 3 && !sample ? pts(Array.from({ length: 28 }, (_, i) => cam.project(Math.cos((i / 28) * 2 * Math.PI) * acc, Math.sin((i / 28) * 2 * Math.PI) * acc, 0))) : null;
  const puck = cam.project(0, 0, 0) as S;
  const behindPts = pts(behind.map((q) => proj(q)));

  return (
    <View {...pan.panHandlers} style={{ width, height, overflow: 'hidden', backgroundColor: look.ground }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={look.ground} stopOpacity="1" />
            <Stop offset="1" stopColor={look.ground} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={look.ground} />
        <G transform={`translate(${offset.x} ${offset.y})`}>
          {/* roads: casing first, then the road */}
          {scene.roads.map((r, i) => {
            const ring = ribbonOf(r.pts, r.w + 3.5);
            return ring ? <Polygon key={`c${i}`} points={ring} fill={look.roadCase} /> : null;
          })}
          {scene.roads.map((r, i) => {
            const ring = ribbonOf(r.pts, r.w);
            return ring ? <Polygon key={`r${i}`} points={ring} fill={look.road} /> : null;
          })}

          {/* blocks, far to near: the walls that face the camera, then the roof */}
          {blocks.map((b) => {
            const base = b.poly.map((q) => proj(q));
            const top = b.poly.map((q) => proj(q, b.h));
            if (base.some((q) => !q) || top.some((q) => !q)) return null;
            const cx = b.poly.reduce((a, z) => a + z.x, 0) / 4;
            const cy = b.poly.reduce((a, z) => a + z.y, 0) / 4;
            const faces = b.poly
              .map((q, i) => {
                const n = (i + 1) % 4;
                const mid = { x: (q.x + b.poly[n].x) / 2, y: (q.y + b.poly[n].y) / 2 };
                const out = cam.turn(mid.x - cx, mid.y - cy);
                const m = cam.turn(mid.x, mid.y);
                return { i, n, facing: out.x * (cam.eye.x - m.x) + out.y * (cam.eye.y - m.y) > 0, lit: out.x > 0 };
              })
              .filter((f) => f.facing);
            return (
              <G key={b.id}>
                {faces.map((f) => (
                  <Polygon key={f.i} points={pts([base[f.i], base[f.n], top[f.n], top[f.i]]) ?? ''} fill={f.lit ? look.sideA : look.sideB} stroke={look.edge} strokeWidth="0.6" strokeLinejoin="round" />
                ))}
                <Polygon points={pts(top) ?? ''} fill={look.roof} stroke={look.edge} strokeWidth="0.6" strokeLinejoin="round" />
              </G>
            );
          })}

          {/* the way behind (thin gold) and ahead (bold dots with a halo) */}
          {behindPts && <Polyline points={behindPts} fill="none" stroke={fixed.gold} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
          {dots.map((q, i) => {
            const s = proj(q);
            return s ? <Circle key={`h${i}`} cx={s.sx} cy={s.sy} r={Math.max(2.6, s.k * 1.8)} fill={look.halo} opacity={0.95} /> : null;
          })}
          {dots.map((q, i) => {
            const s = proj(q);
            return s ? <Circle key={`d${i}`} cx={s.sx} cy={s.sy} r={Math.max(1.7, s.k * 1.2)} fill={look.route} /> : null;
          })}

          {accRing && <Polygon points={accRing} fill={look.accuracy} fillOpacity={p.night ? 0.16 : 0.1} stroke={look.accuracy} strokeOpacity={0.4} strokeWidth="1.2" />}

          {/* our pins */}
          {shownPois.map(({ poi, s }) => {
            const sel = p.selectedPoiId === poi.id;
            return (
              <G key={poi.id} onPress={() => p.onSelectPoi(poi.id)}>
                <Circle cx={s.sx} cy={s.sy} r={sel ? 15 : 11} fill={hex[poi.kind]} stroke={sel ? fixed.gold : '#FFFFFF'} strokeWidth={sel ? 4 : 3} />
                <Circle cx={s.sx} cy={s.sy} r="3.5" fill="#FFFFFF" />
              </G>
            );
          })}

          {/* the red pin at the end of the stage */}
          {end && p.stageEnd && (
            <G transform={`translate(${end.sx - 24} ${end.sy - 61})`}>
              <Path d="M24 61C24 61 5 39.5 5 22.5a19 19 0 0 1 38 0C43 39.5 24 61 24 61Z" fill={fixed.red} stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round" />
              <Circle cx="24" cy="22.5" r="8" fill="#FFFFFF" />
              <Label x={54} y={20} size={15} fill={look.ink} halo={look.inkHalo}>{p.stageEnd.name}</Label>
            </G>
          )}

          {/* the walker: a disc with a heading arrow, always facing the camera */}
          {p.walker && (
            <G transform={`translate(${puck.sx - 32} ${puck.sy - 32})`}>
              {p.night && !sample && <Circle cx="32" cy="32" r="29" fill={look.glow} opacity={0.28} />}
              <Circle cx="32" cy="35" r="24" fill="#000000" opacity={0.22} />
              <Circle cx="32" cy="32" r="25" fill="#FFFFFF" />
              <Circle cx="32" cy="32" r="20.5" fill={sample ? fixed.stone500 : look.puck} />
              {sample ? (
                <Circle cx="32" cy="32" r="7" fill="#FFFFFF" />
              ) : (
                <Path d="M32 15.5 43.5 43 32 36.2 20.5 43Z" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" transform={`rotate(${walkerHeading - camHeading} 32 32)`} />
              )}
            </G>
          )}
        </G>
        {/* far away fades into the ground colour, like the real map */}
        <Rect x="0" y="0" width={width} height={Math.round(height * 0.3)} fill="url(#fade)" />
      </Svg>
    </View>
  );
}
