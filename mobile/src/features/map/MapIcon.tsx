// Map-only icons (same 24px / 1.75 stroke style as components/Icon).
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

const PATHS = {
  locate: ['M12 2v3M12 19v3M2 12h3M19 12h3'],
  download: ['M12 4v11M7 10l5 5 5-5', 'M5 20h14'],
  battery: ['M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z', 'M22 10v4', 'M7 10v4M11 10v4'],
  target: ['M12 2v4M12 18v4M2 12h4M18 12h4'],
  trash: ['M4 7h16M10 11v6M14 11v6', 'M6 7l1 13h10l1-13M9 7V4h6v3'],
  audio: ['M11 5 6 9H3v6h3l5 4V5Z', 'M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13'],
  cloud: ['M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18H7Z'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  wifiOff: ['M3 3l18 18', 'M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.2-2.4M12 20h.01', 'M14.8 10.1A10 10 0 0 1 19 12.5'],
} as const;

export type MapIconName = keyof typeof PATHS;

export function MapIcon({ name, color, size = 22 }: { name: MapIconName; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.75, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {name === 'locate' && <Circle cx="12" cy="12" r="6" {...p} />}
        {name === 'locate' && <Circle cx="12" cy="12" r="2" {...p} fill={color} />}
        {name === 'target' && <Circle cx="12" cy="12" r="7" {...p} />}
        {PATHS[name].map((d) => (
          <Path key={d} d={d} {...p} />
        ))}
      </Svg>
    </View>
  );
}
