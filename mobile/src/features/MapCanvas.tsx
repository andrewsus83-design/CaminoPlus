import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { c } from '@/theme';

// Stylised placeholder map. The real map (MapLibre + offline packs) replaces this component later
// and keeps the same props, so screens do not change.
export type Layer = 'Helicopter' | 'City';
export type Poi = { id: string; label: string; x: number; y: number; kind: 'church' | 'stay' | 'cafe' | 'quest' };

export const heliTowns = [
  { name: 'St-Jean', x: 40, y: 560, done: true },
  { name: 'Pamplona', x: 120, y: 470, done: true },
  { name: 'Logroño', x: 200, y: 390, done: true },
  { name: 'Burgos', x: 250, y: 300, done: true },
  { name: 'León', x: 160, y: 200, done: false },
  { name: 'Santiago', x: 60, y: 90, done: false },
];

export const cityPois: Poi[] = [
  { id: 'c1', label: 'Catedral', x: 195, y: 250, kind: 'church' },
  { id: 'c2', label: 'El Puntido', x: 90, y: 400, kind: 'stay' },
  { id: 'c3', label: 'Café Peregrino', x: 290, y: 430, kind: 'cafe' },
  { id: 'c4', label: 'Scavenger #3', x: 300, y: 330, kind: 'quest' },
];

const kindColor = { church: c.blue, stay: c.red, cafe: c.goldInk, quest: c.gold } as const;

export function MapCanvas({ layer, width, height, selected, onSelect }: { layer: Layer; width: number; height: number; selected?: string; onSelect?: (id: string) => void }) {
  return (
    <Svg width={width} height={height} viewBox="0 -80 390 844" preserveAspectRatio="xMidYMid slice">
      <Rect x="-200" y="-300" width="800" height="1400" fill={layer === 'Helicopter' ? '#E7E0CB' : '#EFE5D2'} />
      {layer === 'Helicopter' ? (
        <G>
          <Path d="M0 120 Q120 60 200 140 T390 100 V-300 H0Z" fill="#CFDCC8" />
          <Path d="M0 600 Q140 540 260 610 T390 560 V1000 H0Z" fill="#CFDCC8" />
          <Path d="M40 560 L120 470 L200 390 L250 300 L160 200 L60 90" stroke={c.stone500} strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" fill="none" />
          <Path d="M40 560 L120 470 L200 390 L250 300" stroke={c.gold} strokeWidth="6" strokeLinecap="round" fill="none" />
          {heliTowns.map((t) => (
            <G key={t.name}>
              <Circle cx={t.x} cy={t.y} r={t.done ? 9 : 7} fill={t.done ? c.gold : c.white} stroke={c.blue} strokeWidth="3" />
              <SvgText x={t.x + 16} y={t.y + 5} fontSize="14" fontWeight="600" fill={c.blue}>{t.name}</SvgText>
            </G>
          ))}
        </G>
      ) : (
        <G>
          {[80, 180, 280].map((x) => (<Line key={x} x1={x} y1="-200" x2={x} y2="900" stroke={c.white} strokeWidth="14" />))}
          {[140, 300, 460].map((y) => (<Line key={y} x1="-100" y1={y} x2="500" y2={y} stroke={c.white} strokeWidth="14" />))}
          {[[100, 160], [200, 160], [300, 160], [100, 320], [200, 320], [100, 480], [300, 480]].map(([x, y]) => (<Rect key={`${x}${y}`} x={x} y={y} width="64" height="60" rx="8" fill={c.sand300} />))}
          <Path d="M0 600 L390 560" stroke="#B8CCE0" strokeWidth="26" />
          <Path d="M30 640 L90 460 L190 300 L195 250" stroke={c.gold} strokeWidth="6" strokeLinecap="round" fill="none" />
          {cityPois.map((p) => (
            <G key={p.id} onPress={() => onSelect?.(p.id)}>
              <Circle cx={p.x} cy={p.y} r={selected === p.id ? 20 : 15} fill={kindColor[p.kind]} stroke={c.white} strokeWidth="3" />
              <SvgText x={p.x} y={p.y + 36} fontSize="12" fontWeight="600" fill={c.blue} textAnchor="middle">{p.label}</SvgText>
            </G>
          ))}
        </G>
      )}
    </Svg>
  );
}
