import { View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

const PATHS = {
  me: ['M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7'],
  stays: ['M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-8v6'],
  maps: ['M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z', 'M9 4v13M15 7v13'],
  explore: ['m15.8 8.2-2 5.6-5.6 2 2-5.6 5.6-2Z'],
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
  shield: ['M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z', 'm8.8 12 2.4 2.4 4.2-4.6'],
  briefcase: ['M5.5 7h13A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-8A2.5 2.5 0 0 1 5.5 7Z', 'M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18'],
  camera: ['M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z', 'M12 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z'],
  chat: ['M20 12a8 8 0 0 1-11.8 7L4 20l1-4A8 8 0 1 1 20 12Z'],
  filter: ['M4 7h8M18 7h2M4 17h2M12 17h8'],
  watch: ['M9 7h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z', 'M9.5 7 10 4h4l.5 3M9.5 17l.5 3h4l.5-3', 'M12 10.3v2l1.4 1'],
  bookmark: ['M7 4h10v16l-5-3.6L7 20V4Z'],
  share: ['M12 15V4M8 8l4-4 4 4', 'M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6'],
  copy: ['M9 9h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z', 'M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5'],
  chevron: ['m9 5 7 7-7 7'],
  logout: ['M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14', 'M9.5 8 5.5 12l4 4M5.5 12H15'],
  // Chat, friends and inbox.
  send: ['M21.5 2.5 10.5 13.5', 'M21.5 2.5 15 21.5l-4.5-8-8-4.5 19-6.5Z'],
  image: ['M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z', 'm21 15.5-4.8-4.8a1.5 1.5 0 0 0-2.1 0L6 19'],
  attach: ['m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5'],
  'check-double': ['m2.5 12.5 4.5 4.5L16 7.5', 'M11.5 16.5l1 1L22 7.5'],
  mute: ['M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z', 'M10 20a2 2 0 0 0 4 0', 'M3.5 3.5l17 17'],
  group: ['M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5', 'M15.5 4.7a3.5 3.5 0 0 1 0 6.6', 'M17.5 14.7c2.3.5 4 2.3 4 5.3'],
  'user-plus': ['M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5', 'M19 7.5v6M16 10.5h6'],
  more: [],
  reply: ['M9.5 14.5 4 9l5.5-5.5', 'M20 20v-6.5a4.5 4.5 0 0 0-4.5-4.5H4'],
  trash: ['M3.5 6.5h17', 'M8.5 6.5v-2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2', 'M18.5 6.5l-.8 12.6a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5.5 6.5', 'M10 11v5.5M14 11v5.5'],
  clock: ['M12 7v5l3.2 2'],
  'arrow-down': ['M12 4.5v15', 'm5.5 13 6.5 6.5 6.5-6.5'],
  info: ['M12 11v5.5', 'M12 7.7v.1'],
  'wifi-off': ['M2 2l20 20', 'M16.7 11.1a11 11 0 0 1 2.3 1.5', 'M5 12.6a11 11 0 0 1 5.2-2.4', 'M10.7 5.1A16 16 0 0 1 22.6 9', 'M1.4 9a16 16 0 0 1 4.7-2.9', 'M8.5 16.1a6 6 0 0 1 7 0', 'M12 20h.01'],
  compose: ['M11.5 4.5h-5A2.5 2.5 0 0 0 4 7v10.5A2.5 2.5 0 0 0 6.5 20H17a2.5 2.5 0 0 0 2.5-2.5v-5', 'M17.8 3.2a2.1 2.1 0 0 1 3 3L12.2 14.8 8 16l1.2-4.2 8.6-8.6Z'],
  block: ['M5.6 5.6l12.8 12.8'],
  refresh: ['M20.5 12a8.5 8.5 0 1 1-2.5-6', 'M20.5 3.5V8H16'],
  // Map walk view: direction arrows for the instruction banner, light/dark switch, re-center arrow.
  'arrow-up': ['M12 20V5', 'm6 11 6-6 6 6'],
  'turn-left': ['M17 20v-7a4 4 0 0 0-4-4H5', 'm9 5-4 4 4 4'],
  'turn-right': ['M7 20v-7a4 4 0 0 1 4-4h8', 'm15 5 4 4-4 4'],
  'turn-slight-left': ['M15 20v-6l-7-7', 'M13 7H8v5'],
  'turn-slight-right': ['M9 20v-6l7-7', 'M11 7h5v5'],
  'turn-sharp-left': ['M18 20V9l-9 9', 'M9 12v6h6'],
  'turn-sharp-right': ['M6 20V9l9 9', 'M15 12v6H9'],
  'u-turn': ['M8 20V10a4 4 0 0 1 8 0v7', 'm12.5 13.5 3.5 3.5 3.5-3.5'],
  sun: ['M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6'],
  moon: ['M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z'],
  navigation: ['M3 11 22 2l-9 19-2-8-8-2Z'],
  building: ['M5 21V4.5A1.5 1.5 0 0 1 6.5 3h7A1.5 1.5 0 0 1 15 4.5V21', 'M15 9.5h2.5A1.5 1.5 0 0 1 19 11v10', 'M3 21h18', 'M8.5 7h2M8.5 11h2M8.5 15h2'],
  // Library tab: an open book (the tab), a closed book with a cross (the Bible), a music note.
  library: ['M12 7.5C10.7 6.3 8.7 5.5 6.2 5.5H3.5v12h2.7c2.5 0 4.5.8 5.8 2 1.3-1.2 3.3-2 5.8-2h2.7v-12h-2.7c-2.5 0-4.5.8-5.8 2Z', 'M12 7.5v12'],
  book: ['M7 3.5h10.5A1.5 1.5 0 0 1 19 5v14.5a1 1 0 0 1-1 1H7.5A2 2 0 0 1 5.5 18.5V5A1.5 1.5 0 0 1 7 3.5Z', 'M5.5 18.5A2 2 0 0 1 7.5 16.5H19', 'M12.25 6.5v6.5M9.5 8.9h5.5'],
  music: ['M9 18V5.5l11-2V16', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', 'M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
} as const;

export type IconName = keyof typeof PATHS;

// 24px outline icons, stroke 1.75, matching the design system sprite.
export function Icon({ name, color, size = 24, strokeWidth = 1.75, filled }: { name: IconName; color: string; size?: number; strokeWidth?: number; filled?: boolean }) {
  const p = { stroke: color, strokeWidth, fill: filled ? color : 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'me' && <Circle cx="12" cy="8" r="4" {...p} />}
      {name === 'stays' && <Circle cx="6.5" cy="11" r="1.6" {...p} />}
      {name === 'settings' && <Circle cx="12" cy="12" r="3" {...p} />}
      {name === 'filter' && <Circle cx="15" cy="7" r="2.4" {...p} />}
      {name === 'filter' && <Circle cx="9" cy="17" r="2.4" {...p} />}
      {name === 'explore' && <Circle cx="12" cy="12" r="9" {...p} />}
      {name === 'search' && <Circle cx="11" cy="11" r="7" {...p} />}
      {(name === 'clock' || name === 'info' || name === 'block') && <Circle cx="12" cy="12" r="9" {...p} />}
      {name === 'image' && <Circle cx="8.5" cy="9" r="1.6" {...p} />}
      {(name === 'group' || name === 'user-plus') && <Circle cx="9" cy="8" r="3.5" {...p} />}
      {name === 'sun' && <Circle cx="12" cy="12" r="4.2" {...p} />}
      {name === 'more' && [5, 12, 19].map((cx) => <Circle key={cx} cx={cx} cy="12" r="1.9" {...p} fill={color} />)}
      {PATHS[name].map((d) => (<Path key={d} d={d} {...p} />))}
    </Svg>
    </View>
  );
}
