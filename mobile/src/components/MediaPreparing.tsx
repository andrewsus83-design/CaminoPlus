import { useEffect } from 'react';
import { AccessibilityInfo, BackHandler, Platform, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { Card } from '@/components/ui';
import { layout, radius, role, scrim, space, z } from '@/theme';

/**
 * "Preparing your video… 40%" with Cancel, over the composer, while photos and clips are made ready (src/lib/media).
 * A screen reader hears the label once (iPhone: an announcement; Android: a live region) and reads the bar as a progress
 * bar. The Android Back button cancels, like the Cancel button.
 */
export function MediaPreparing({ label, fraction, onCancel }: { label: string; fraction: number | null; onCancel: () => void }) {
  const pct = fraction == null ? null : Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`${label}.`);
  }, [label]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onCancel(); return true; });
    return () => sub.remove();
  }, [onCancel]);
  return (
    <View accessibilityViewIsModal style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: z.sheet, backgroundColor: scrim, alignItems: 'center', justifyContent: 'center', padding: layout.screenMargin }}>
      <Card style={{ width: '100%', maxWidth: 360, gap: space[4] }}>
        <AppText variant="h4" accessibilityLiveRegion="polite">{pct == null ? `${label}…` : `${label}… ${pct}%`}</AppText>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={label}
          accessibilityValue={pct == null ? { text: 'In progress' } : { min: 0, max: 100, now: pct }}
          style={{ height: space[2], borderRadius: radius.pill, backgroundColor: role.sunken, overflow: 'hidden' }}
        >
          <View style={{ width: `${pct ?? 15}%`, height: '100%', borderRadius: radius.pill, backgroundColor: role.highlight }} />
        </View>
        <AppText variant="body" muted>This happens on your phone. It can take a little while.</AppText>
        <Pill variant="ghost" label="Cancel" onPress={onCancel} />
      </Card>
    </View>
  );
}
