import { ActivityIndicator, Pressable } from 'react-native';
import { AppText } from './AppText';
import { c, layout, radius, role } from '@/theme';

type Props = { label: string; onPress?: () => void; variant?: 'primary' | 'gold' | 'ghost'; selected?: boolean; disabled?: boolean; loading?: boolean; large?: boolean };

export function Pill({ label, onPress, variant = 'primary', selected, disabled, loading, large }: Props) {
  const bg = variant === 'primary' ? role.action : variant === 'gold' ? role.highlight : selected ? role.action : role.surface;
  const fg = variant === 'ghost' && !selected ? role.text : variant === 'gold' ? role.onHighlight : role.onAction;
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }} disabled={off} onPress={onPress} style={({ pressed }) => ({ minHeight: large ? 68 : layout.touchMin, paddingHorizontal: 28, borderRadius: radius.pill, backgroundColor: bg, borderWidth: variant === 'ghost' ? 1 : 0, borderColor: role.border, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.55 : pressed ? 0.85 : 1 })}>
      {loading ? <ActivityIndicator color={fg} /> : <AppText variant={large ? 'lead' : 'label'} color={fg} style={large ? { fontWeight: '600' } : undefined}>{label}</AppText>}
    </Pressable>
  );
}
