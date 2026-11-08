import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { radius, role, space } from '@/theme';
import { JOURNEY_WRITE } from './tabs';

/**
 * The first cell of the Journey grid, top left: a card that writes a journey post. It replaces the gold pen that used to float over this tab. It is a cell of
 * the grid and nothing else: `width` and `height` are the size of a post tile (gridMetrics: 9:16, two even columns), the corners are square like theirs, and the
 * page background shows through the same 2 px gaps. It is not a post, so it has no picture, no count and no place under it; the viewer never lists it.
 *
 * A card, not a photo: the colours are roles (the surface of a card with a hairline, a gold circle with the pen on it in onHighlight, the words in text), so it
 * is the same card in light and in dark. The whole tile is ONE button, "Write a journey post", which opens /write. The words are 17 px (the label style).
 */
export function WriteCard({ width, height, onPress }: { width: number; height: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={JOURNEY_WRITE.label}
      onPress={onPress}
      style={({ pressed }) => ({ width, height, alignItems: 'center', justifyContent: 'center', gap: space[4], paddingHorizontal: space[3], backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border })}
    >
      <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: role.highlight, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="pen" color={role.onHighlight} size={32} strokeWidth={2.2} />
      </View>
      <AppText variant="label" style={{ textAlign: 'center' }}>{JOURNEY_WRITE.label}</AppText>
    </Pressable>
  );
}
