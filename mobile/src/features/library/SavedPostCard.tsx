import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/ui';
import { layout, space } from '@/theme';
import { BookmarkToggle } from './BookmarkToggle';
import { postByline, postHeading, type SavedPost } from './savedPosts';

// "6 Nov 2026" in the phone's own style: the same day the full-screen journey viewer prints under a post.
const dayOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * A bookmarked post on the Bookmarks screen: where and when, the first lines of what was written, whose it is, and the bookmark
 * button (filled while it is bookmarked). There is no screen that opens one post on its own yet, so the card is not pressable:
 * it shows what was kept.
 */
export function SavedPostCard({ post, me, on, toggle }: { post: SavedPost; me: string | null; on: boolean; toggle: () => void }) {
  const heading = postHeading(post.place, dayOf(post.publishedAt));
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], paddingVertical: space[4], paddingLeft: layout.cardPadding, paddingRight: space[2] }}>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="label">{heading}</AppText>
        {!!post.body && <AppText variant="small" muted numberOfLines={3}>{post.body}</AppText>}
        <AppText variant="caption" muted>{postByline(post, me)}</AppText>
      </View>
      <BookmarkToggle on={on} title={heading} toggle={toggle} />
    </Card>
  );
}
