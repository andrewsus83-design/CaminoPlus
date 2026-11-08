import { ActivityIndicator, Pressable } from 'react-native';
import { AppText } from './AppText';
import { c, layout, radius, role } from '@/theme';

// `compact` is the pill that sits in a row with a round 48 px button (the header of a screen: the Back button on one side, "All chapters" on the other): 48 high, like it,
// where a pill is 56 (layout.touchMin) and a large one 68. `accessibilityLabel` is for a pill whose spoken name is longer than what it says ("All chapters of this book").
type Props = { label: string; onPress?: () => void; variant?: 'primary' | 'gold' | 'ghost'; selected?: boolean; disabled?: boolean; loading?: boolean; large?: boolean; compact?: boolean; accessibilityLabel?: string };

export function Pill({ label, onPress, variant = 'primary', selected, disabled, loading, large, compact, accessibilityLabel }: Props) {
  const bg = variant === 'primary' ? role.action : variant === 'gold' ? role.highlight : selected ? role.action : role.surface;
  const fg = variant === 'ghost' && !selected ? role.text : variant === 'gold' ? role.onHighlight : role.onAction;
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!off, busy: !!loading }} disabled={off} onPress={onPress} style={({ pressed }) => ({ minHeight: large ? 68 : compact ? 48 : layout.touchMin, paddingHorizontal: compact ? 20 : 28, borderRadius: radius.pill, backgroundColor: bg, borderWidth: variant === 'ghost' ? 1 : 0, borderColor: role.border, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.55 : pressed ? 0.85 : 1 })}>
      {loading ? <ActivityIndicator color={fg} /> : <AppText variant={large ? 'lead' : 'label'} color={fg} style={large ? { fontWeight: '600' } : undefined}>{label}</AppText>}
    </Pressable>
  );
}
