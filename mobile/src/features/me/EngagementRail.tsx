import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { c, radius } from '@/theme';
import { engagementItems, type EngagementSource } from '@/lib/engagement';

/**
 * The stats rail of the full-screen journey viewer, in the style of TikTok and Reels: heart, comment bubble, share
 * arrow and bookmark, each with its compact count under it. Read only (the like, comment, save and share actions are
 * not built yet). It shows only the counts it knows (see engagement.ts), so a number that was never read is not
 * shown as 0. Sits at the right edge, above the text at the bottom of the viewer. The dark pill is what keeps the white
 * icons and numbers readable on a bright photo (white on 55% black is above 4.5:1 even over a white sky).
 */
export function EngagementRail({ post }: { post: EngagementSource }) {
  const items = engagementItems(post);
  if (items.length === 0) return null;
  return (
    <View style={{ alignSelf: 'flex-end', alignItems: 'center', gap: 14, marginRight: 12, marginBottom: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: radius.lg, backgroundColor: 'rgba(0,0,0,0.55)' }}>
      {items.map((it) => (
        <View key={it.kind} accessible accessibilityRole="text" accessibilityLabel={it.label} style={{ minWidth: 48, alignItems: 'center', gap: 2 }}>
          <Icon name={it.icon} color={c.white} size={30} />
          <AppText variant="caption" color={c.white}>{it.text}</AppText>
        </View>
      ))}
    </View>
  );
}
