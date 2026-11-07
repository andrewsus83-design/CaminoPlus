import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { FIXED } from './fixedColors';
import type { RailItem, RailKind } from '@/lib/actionRail';
import { layout } from '@/theme';

/**
 * THE action rail of the app (design/index.html, "Action rail"). Discover has always had it; the full-screen journey viewer
 * uses this very component, so a like, a bookmark, a comment and a share look and behave the same everywhere:
 *
 *   a column of four 56 px circles, 14 px apart, centred, the right edge `layout.screenMargin` from the screen edge,
 *   cream (paper white at 85 %) so they read on any photo, in this order: love (heart 28, red, filled when on),
 *   bookmark (28, blue, filled when on), comments (chat 26) and share (26).
 *   A count that was read sits under the icon (11 / 13), compact ("1.2K"); a count that was never read shows nothing.
 *
 * What it shows comes from lib/actionRail.ts (railItems), what a tap does is the screen's business (onPress). The colours are
 * the light token values from fixedColors.ts, never the theme colours: the circles are cream in dark mode too, so the icons on
 * them must not turn light blue. `bottom` is where the lowest circle sits (Discover: above the tab bar).
 */
export const RAIL_CIRCLE = 56;
export const RAIL_GAP = 14;

export function ActionRail({ items, onPress, bottom }: { items: RailItem[]; onPress: (kind: RailKind) => void; bottom: number }) {
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: layout.screenMargin, bottom, gap: RAIL_GAP, alignItems: 'center' }}>
      {items.map((it) => (
        <Pressable
          key={it.kind}
          accessibilityRole="button"
          accessibilityLabel={it.label}
          accessibilityState={it.kind === 'love' || it.kind === 'save' ? { selected: it.on, disabled: it.disabled } : { disabled: it.disabled }}
          disabled={it.disabled}
          onPress={() => onPress(it.kind)}
          style={{ width: RAIL_CIRCLE, height: RAIL_CIRCLE, borderRadius: RAIL_CIRCLE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: FIXED.railCircle, opacity: it.disabled ? 0.45 : 1 }}
        >
          <Icon name={it.icon} color={it.tone === 'love' ? FIXED.red : FIXED.blue} filled={it.on} size={it.iconSize} />
          {it.countText !== undefined && (
            <AppText variant="caption" color={FIXED.blue} style={{ fontSize: 11, lineHeight: 13 }}>{it.countText}</AppText>
          )}
        </Pressable>
      ))}
    </View>
  );
}
