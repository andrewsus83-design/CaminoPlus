import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { radius, role } from '@/theme';
import { BOOKMARK_DAY, UNBOOKMARK_DAY } from './bookmarks';

// The top of the Daily reading screen, one row: the Back button, the title right next to it (the Fraunces title of the other screens, one step
// smaller than their h2 so that it can sit beside three buttons), and at the right edge the calendar and the bookmark. The buttons look like the
// round Back button of the other screens (components/ui.tsx IconButton) and are 44 by 44, the least a finger needs. The title wraps to a second
// line on the narrowest phones and at the biggest text sizes (it stops growing at 1.2 times) and never runs under a button.
const SIZE = 44;

function HeaderButton({ name, label, onPress, selected }: { name: IconName; label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => ({ width: SIZE, height: SIZE, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, opacity: pressed ? 0.6 : 1 })}
    >
      <Icon name={name} color={selected ? role.action : role.text} filled={selected} />
    </Pressable>
  );
}

export function DailyHeader({ onBack, onCalendar, bookmarked, onBookmark }: { onBack: () => void; onCalendar: () => void; bookmarked: boolean; onBookmark: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: SIZE }}>
      <HeaderButton name="back" label="Back" onPress={onBack} />
      <AppText variant="h3" accessibilityRole="header" numberOfLines={2} maxFontSizeMultiplier={1.2} style={{ flex: 1, minWidth: 0 }}>Daily reading</AppText>
      <HeaderButton name="calendar" label="Open calendar" onPress={onCalendar} />
      <HeaderButton name="bookmark" label={bookmarked ? UNBOOKMARK_DAY : BOOKMARK_DAY} selected={bookmarked} onPress={onBookmark} />
    </View>
  );
}
