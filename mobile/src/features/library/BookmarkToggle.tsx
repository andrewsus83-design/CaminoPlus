import { Pressable } from 'react-native';
import { Icon } from '@/components/Icon';
import { role } from '@/theme';

/** What a screen reader says for the bookmark button of a row (the same words as the action rail: the action the tap will do). */
export const bookmarkLabel = (on: boolean, title: string) => `${on ? 'Remove bookmark' : 'Bookmark'}: ${title}`;

/**
 * The bookmark button at the end of a row, of the Library and of the Bookmarks screen: a bare icon, filled when the row is
 * bookmarked, in a 44 round touch area (52 with the slop). Its own file, apart from the rows, so the rows themselves stay
 * plain pictures of what will be there (src/lib/__tests__/navigation.test.ts keeps anything that can be pressed out of them).
 * `color` is for a cover, which does not change with light and dark.
 */
export function BookmarkToggle({ on, title, toggle, color }: { on: boolean; title: string; toggle: () => void; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bookmarkLabel(on, title)}
      onPress={toggle}
      hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Icon name="bookmark" color={color ?? role.action} size={24} filled={on} />
    </Pressable>
  );
}

/** A filled bookmark that is only a picture: what a chapter or a paragraph shows when it is bookmarked (a toggle is the button that changes it). */
export function KeptMark({ size = 18 }: { size?: number }) {
  return <Icon name="bookmark" color={role.action} size={size} filled />;
}
