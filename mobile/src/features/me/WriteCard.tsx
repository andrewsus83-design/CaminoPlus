import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { icon, radius, role, space } from '@/theme';
import { JOURNEY_WRITE, JOURNEY_WRITE_CARD } from './tabs';

/**
 * The first cell of the Journey grid, top left: a card that writes a journey post. It replaces the gold pen that used to float over this tab. It is a cell of
 * the grid and nothing else: `width` and `height` are the size of a post tile (gridMetrics: 9:16, two even columns), the corners are square like theirs, and the
 * page background shows through the same 2 px gaps. It is not a post, so it has no picture, no count and no place under it; the viewer never lists it.
 *
 * A card, not a photo, and a warm one (the owner found the plain white card too plain, 2026-11-08): the surface of a card with a hairline under a faint gold
 * wash, a large scallop shell as art that runs off the bottom right corner, a gold circle with the pen, the invitation in Fraunces ("What did you see today?"),
 * a short gold rule and the action in Inter ("Write a journey post"). The colours are roles and the gold is drawn with opacity, so it is the same card in light
 * and in dark. The whole tile is ONE button, "Write a journey post", which opens /write; the art is not read out.
 */
export function WriteCard({ width, height, onPress }: { width: number; height: number; onPress: () => void }) {
  const art = Math.round(width * 1.05);
  // a tile of a phone under about 360 wide (279 high at 320) has a smaller circle and less room between the lines, so that large text still fits
  const compact = height < 320;
  const disc = compact ? 56 : 64;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={JOURNEY_WRITE.label}
      onPress={onPress}
      style={({ pressed }) => ({ width, height, overflow: 'hidden', backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border })}
    >
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: role.highlight, opacity: JOURNEY_WRITE_CARD.wash }} />
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ position: 'absolute', right: -Math.round(art * 0.34), bottom: -Math.round(art * 0.2), opacity: JOURNEY_WRITE_CARD.shell }}>
        {/* the shell is art the width of the card, not an icon of the scale (as the faint shell of the Business card), drawn with a fine line so it stays a background */}
        <Icon name="shell" color={role.highlight} size={art} strokeWidth={0.6} />
      </View>
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: compact ? space[2] : space[3], paddingHorizontal: space[3] }}>
        <View style={{ width: disc, height: disc, borderRadius: radius.pill, backgroundColor: role.highlight, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pen" color={role.onHighlight} size={compact ? icon.mdPlus : icon.lg} strokeWidth={2.2} />
        </View>
        {/* the invitation grows with the phone's text size up to 1.2 times, so that with large text it and the action still fit a tile of a 320 phone (279 high) */}
        <AppText variant="h4" maxFontSizeMultiplier={1.2} style={{ textAlign: 'center' }}>{JOURNEY_WRITE_CARD.prompt}</AppText>
        <View style={{ width: space[8], height: 2, borderRadius: radius.pill, backgroundColor: role.highlight }} />
        <AppText variant="label" style={{ textAlign: 'center' }}>{JOURNEY_WRITE.label}</AppText>
      </View>
    </Pressable>
  );
}
