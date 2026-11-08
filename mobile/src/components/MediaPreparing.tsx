import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { Card } from '@/components/ui';
import { layout, radius, role, scrim, space, z } from '@/theme';

/** "Preparing your video… 40%" with Cancel, over the composer, while photos and clips are made ready (src/lib/media). */
export function MediaPreparing({ label, fraction, onCancel }: { label: string; fraction: number | null; onCancel: () => void }) {
  const pct = fraction == null ? null : Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <View accessibilityViewIsModal style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: z.sheet, backgroundColor: scrim, alignItems: 'center', justifyContent: 'center', padding: layout.screenMargin }}>
      <Card style={{ width: '100%', maxWidth: 360, gap: space[4] }}>
        <AppText variant="h4" accessibilityLiveRegion="polite">{pct == null ? `${label}…` : `${label}… ${pct}%`}</AppText>
        <View style={{ height: space[2], borderRadius: radius.pill, backgroundColor: role.sunken, overflow: 'hidden' }}>
          <View style={{ width: `${pct ?? 15}%`, height: '100%', borderRadius: radius.pill, backgroundColor: role.highlight }} />
        </View>
        <AppText variant="body" muted>This happens on your phone. It can take a little while.</AppText>
        <Pill variant="ghost" label="Cancel" onPress={onCancel} />
      </Card>
    </View>
  );
}
