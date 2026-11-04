import { Pressable } from 'react-native';
import { AppText } from './AppText';
import { c, layout, radius, role } from '@/theme';

type Props = { label: string; onPress?: () => void; variant?: 'primary' | 'gold' | 'ghost'; selected?: boolean };

export function Pill({ label, onPress, variant = 'primary', selected }: Props) {
  const bg = variant === 'primary' ? role.action : variant === 'gold' ? role.highlight : selected ? role.action : role.surface;
  const fg = variant === 'ghost' && !selected ? role.text : variant === 'gold' ? c.blue : role.onAction;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ minHeight: layout.touchMin, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: bg, borderWidth: variant === 'ghost' ? 1 : 0, borderColor: role.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
      <AppText variant="label" color={fg}>{label}</AppText>
    </Pressable>
  );
}
