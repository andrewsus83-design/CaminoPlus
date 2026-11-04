import { View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

const PATHS = {
  me: ['M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7'],
  stays: ['M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-8v6'],
  maps: ['M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z', 'M9 4v13M15 7v13'],
  explore: ['M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z', 'm10 9 5 3-5 3V9Z'],
  settings: ['M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1'],
  search: ['m21 21-4.3-4.3'],
  heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z'],
  bell: ['M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z', 'M10 20a2 2 0 0 0 4 0'],
  pen: ['M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z'],
  star: ['m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z'],
  back: ['m15 5-7 7 7 7'],
  close: ['M6 6l12 12M18 6 6 18'],
  check: ['m5 12 5 5 9-10'],
  pin: ['M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11Z'],
  shell: ['M12 4C7 4 4 8 4 13c0 3 1.5 6 3 7h10c1.5-1 3-4 3-7 0-5-3-9-8-9Z', 'M12 4v16M12 4 8 20M12 4l4 16'],
  steps: ['M8 4c2 0 3 2 3 4s-1 3-3 3-3-1-3-3 1-4 3-4Z', 'M16 12c2 0 3 2 3 4s-1 4-3 4-3-2-3-4 1-4 3-4Z'],
  flag: ['M5 21V4M5 4h11l-2 4 2 4H5'],
} as const;

export type IconName = keyof typeof PATHS;

// 24px outline icons, stroke 1.75, matching the design system sprite.
export function Icon({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.75, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'me' && <Circle cx="12" cy="8" r="4" {...p} />}
      {name === 'stays' && <Circle cx="6.5" cy="11" r="1.6" {...p} />}
      {name === 'settings' && <Circle cx="12" cy="12" r="3" {...p} />}
      {name === 'search' && <Circle cx="11" cy="11" r="7" {...p} />}
      {PATHS[name].map((d) => (<Path key={d} d={d} {...p} />))}
    </Svg>
    </View>
  );
}
