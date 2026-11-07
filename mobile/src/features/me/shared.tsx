import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/ui';
import { c, radius } from '@/theme';

// norm lives in ./text (no React there, so tests can load it); this keeps `import { norm } from '@/features/me/shared'` working.
export { norm } from './text';

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={{ height: 12, borderRadius: radius.pill, backgroundColor: c.sand200, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, height: 12, borderRadius: radius.pill, backgroundColor: c.gold }} />
    </View>
  );
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });

export function Empty({ text }: { text: string }) {
  return (
    <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }}>
      <Icon name="shell" color={c.gold} size={32} />
      <AppText variant="small" muted style={{ textAlign: 'center' }}>{text}</AppText>
    </Card>
  );
}
