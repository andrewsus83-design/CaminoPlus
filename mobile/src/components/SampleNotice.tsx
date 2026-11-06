import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { c, radius } from '@/theme';

/** Honest label for a screen that still shows example content instead of real data. */
export function SampleNotice({ title = 'Sample preview', children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityRole="summary" style={[{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: c.goldWash, borderWidth: 1, borderColor: c.goldSoft, alignItems: 'flex-start' }, style]}>
      <Icon name="flag" color={c.goldInk} size={22} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" color={c.goldInk}>{title}</AppText>
        <AppText variant="small">{children}</AppText>
      </View>
    </View>
  );
}

/** Small "SAMPLE" chip for cards that show example content. */
export function SampleTag() {
  return (
    <View accessibilityLabel="Sample" style={{ paddingHorizontal: 10, height: 24, borderRadius: radius.pill, backgroundColor: c.goldWash, borderWidth: 1, borderColor: c.goldSoft, justifyContent: 'center' }}>
      <AppText variant="mono" color={c.goldInk} style={{ fontSize: 11, letterSpacing: 1 }}>SAMPLE</AppText>
    </View>
  );
}
