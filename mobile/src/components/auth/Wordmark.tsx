import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { AppText } from '../AppText';
import { c, fonts } from '@/theme';

// Camino+ wordmark: the "o" is a scallop shell in a circle, "+" in Caveat.
function ShellO({ size }: { size: number }) {
  const ribs = [-60, -40, -20, 0, 20, 40, 60];
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Circle cx={24} cy={24} r={22} fill={c.gold} />
      <Path d="M10 27c0-8 6.3-14 14-14s14 6 14 14c-1.6 1.4-3 1.4-4.6 0-1.6 1.4-3 1.4-4.6 0-1.6 1.4-3 1.4-4.8 0-1.6 1.4-3 1.4-4.6 0-1.6 1.4-3 1.4-4.6 0-.6.5-1.1.8-1.6.9Z" fill={c.parchment} />
      {ribs.map((a) => {
        const r = (a * Math.PI) / 180;
        return <Path key={a} d={`M24 34L${24 + 13 * Math.sin(r)} ${34 - 19 * Math.cos(r)}`} stroke={c.goldInk} strokeWidth={1.4} strokeLinecap="round" />;
      })}
      <Path d="M20 34h8l-1.5 4h-5Z" fill={c.parchment} />
    </Svg>
  );
}

export function Wordmark({ size = 44, color = c.blue }: { size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }} accessibilityRole="header" accessibilityLabel="Camino Plus">
      <AppText style={{ fontFamily: fonts.title, fontSize: size, lineHeight: size * 1.15, color }}>Camin</AppText>
      <View style={{ marginBottom: size * 0.12, marginLeft: 1 }}><ShellO size={size * 0.82} /></View>
      <AppText style={{ fontFamily: fonts.accent, fontSize: size * 0.8, lineHeight: size * 0.8, color: c.gold, alignSelf: 'flex-start', marginLeft: 2 }}>+</AppText>
    </View>
  );
}
