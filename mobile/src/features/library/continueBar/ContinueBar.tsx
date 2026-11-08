import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { setAboveTabBar } from '@/lib/aboveTabBar';
import { useTabBarHidden } from '@/lib/tabBarVisibility';
import { layout, radius, role, shadowStyle, space } from '@/theme';
import { BAR_HEIGHT, BAR_PAD_LEFT, BAR_PAD_RIGHT, BAR_ROOM, CLOSE_SIZE, barBottom } from './barLayout';
import { setSearchFocused } from './searchFocus';
import { CONTINUE_TITLE, HIDE_LABEL, OPEN_HINT, barVisible } from './spot';
import { useContinueBar } from './useContinueBar';
import { useTyping } from './useTyping';

/**
 * The "Continue reading" bar: one slim bar that floats just above the tab bar, a mini player for the page you were reading. It takes the place of the two cards the Bible tab and
 * the Books tab used to have inside their pages. Two lines: "Continue reading" (the caption of the type scale) over the place, the chapter of the Bible ("Genesis 3") or of a book ("The French Way ·
 * Chapter 2"), whichever was read last (spot.ts), with the glyph of the Bible or of a book in gold. A tap opens the reader there. The X at the end hides it: it stays hidden,
 * across restarts, until the saved place is another one (hidden.ts). The books of the Library have titles of their own and some are long ("The Mountain of the Heart"), so the
 * place is drawn in two pieces, the name and then the chapter ("· Chapter 2"): when the line is too short it is the name that ends in an ellipsis, never the chapter.
 *
 * It is ONE line wherever it is mounted: `<ContinueBar />` is mounted by the Library screen (app/(tabs)/library.tsx) as the `overlay` of its Screen, and could be mounted by the
 * tabs layout instead without any other change, because it brings what it needs: its own data (useContinueBar.ts), its own place (above the tab bar, from the tab bar's own
 * numbers, barLayout.ts), and the room it takes from the lists under it, which it says to lib/aboveTabBar.ts while its screen is the one in view (components/Screen.tsx adds that
 * to the end of its list, so the last row can be scrolled clear of the bar).
 *
 * Not drawn on the readers (they have no tab bar either: they are not in the Library's screen), not on the other tabs (they do not mount it), not while the tab bar is hidden, and
 * not while somebody is typing: with the keyboard up the bar would float over the keys (useTyping.ts). Nothing here moves, so there is no motion to reduce: it appears and goes
 * at once.
 *
 * Colours are roles only: it is the hero card (role.inverse, with role.onInverse on it), the glyph is the gold of role.highlight, the first line the pale gold of the hero cards. The
 * place is Fraunces (the title font), the line over it Inter. No handwriting here: the screen already has its one Caveat note (the banner). Two buttons, in this order for a screen
 * reader and for a keyboard: the bar ("Continue reading, Genesis 3") and the close button ("Hide Continue reading", 48 by 48), side by side, never one inside the other.
 */
export function ContinueBar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { view, hide } = useContinueBar();
  const typing = useTyping();
  const tabBarHidden = useTabBarHidden();
  const present = !!view && !tabBarHidden;

  // The room is kept while there is a bar to show, also while it steps aside for the keyboard, so the page does not jump when the field is touched; it is given back when the screen
  // goes out of view (another tab, a reader over it) and when the person closes the bar.
  useFocusEffect(useCallback(() => {
    setAboveTabBar(present ? BAR_ROOM : 0);
    return () => setAboveTabBar(0);
  }, [present]));
  // A field that is left while it has the focus (a screen opens over it) must not keep the bar away when the screen comes back.
  useFocusEffect(useCallback(() => () => setSearchFocused(false), []));

  if (!view || !barVisible({ present, typing })) return null;
  return (
    <View
      style={{
        position: 'absolute', left: layout.screenMargin, right: layout.screenMargin, bottom: barBottom(insets.bottom), minHeight: BAR_HEIGHT, borderRadius: radius.pill,
        backgroundColor: role.inverse, flexDirection: 'row', alignItems: 'center', paddingLeft: BAR_PAD_LEFT, paddingRight: BAR_PAD_RIGHT, ...shadowStyle('lg'),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={view.spoken}
        accessibilityHint={OPEN_HINT}
        onPress={() => router.push(view.href)}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: space[3], opacity: pressed ? 0.85 : 1 })}
      >
        <Icon name={view.icon} color={role.highlight} size={28} strokeWidth={1.9} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="caption" maxFontSizeMultiplier={1.2} numberOfLines={1} color={role.onInverseAccent}>{CONTINUE_TITLE}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[1] }}>
            <AppText variant="h5" maxFontSizeMultiplier={1.2} numberOfLines={1} color={role.onInverse} style={{ flexShrink: 1, minWidth: 0 }}>{view.head}</AppText>
            {!!view.tail && <AppText variant="h5" maxFontSizeMultiplier={1.2} numberOfLines={1} color={role.onInverse} style={{ flexShrink: 0 }}>{view.tail}</AppText>}
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={HIDE_LABEL}
        onPress={hide}
        style={({ pressed }) => ({ width: CLOSE_SIZE, height: CLOSE_SIZE, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
      >
        <Icon name="close" color={role.onInverse} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
