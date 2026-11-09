import { Pressable } from 'react-native';
import { Icon } from '@/components/Icon';
import { role } from '@/theme';

/** What a screen reader says for the bookmark button of a row (the same words as the action rail: the action the tap will do). */
export const bookmarkLabel = (on: boolean, title: string) => `${on ? 'Remove bookmark' : 'Bookmark'}: ${title}`;

/**
 * The bookmark button at the end of a row, of the Library and of the Bookmarks screen: a bare icon, filled when the row is
 * bookmarked, in a 48 by 48 touch area (the hard minimum of a tap target). Its own file, apart from the rows, so the rows themselves stay
 * plain pictures of what will be there (src/lib/__tests__/navigation.test.ts keeps anything that can be pressed out of them).
 * `color` is for a cover, which does not change with light and dark.
 */
export function BookmarkToggle({ on, title, toggle, color }: { on: boolean; title: string; toggle: () => void; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bookmarkLabel(on, title)}
      onPress={toggle}
      style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Icon name="bookmark" color={color ?? role.action} size={24} filled={on} />
    </Pressable>
  );
}
