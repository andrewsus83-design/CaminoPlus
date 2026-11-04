import Svg, { Path, Circle } from 'react-native-svg';

export type IconName = 'me' | 'stays' | 'maps' | 'explore' | 'settings';

// Simple 24px outline icons (stroke 1.75) matching the design system.
export function Icon({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) {
  const p = { stroke: color, strokeWidth: 1.75, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'me' && (<><Circle cx="12" cy="8" r="4" {...p} /><Path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" {...p} /></>)}
      {name === 'stays' && (<><Path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-8v6" {...p} /><Circle cx="6.5" cy="11" r="1.6" {...p} /></>)}
      {name === 'maps' && (<><Path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z" {...p} /><Path d="M9 4v13M15 7v13" {...p} /></>)}
      {name === 'explore' && (<><Path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" {...p} /><Path d="m10 9 5 3-5 3V9Z" {...p} /></>)}
      {name === 'settings' && (<><Circle cx="12" cy="12" r="3" {...p} /><Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" {...p} /></>)}
    </Svg>
  );
}
