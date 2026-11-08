import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { fonts, layout, radius, role, shadowStyle } from '@/theme';
import { TESTAMENTS, TESTAMENT_LABEL, type Testament } from './books';

/** The bar is this high (the choices inside it are 48, never under 44). */
export const BAR_HEIGHT = 56;
/** The Bible list ends with this much room, so that its last row can be scrolled clear of the bar. */
export const BAR_ROOM = BAR_HEIGHT;
/** Under this width (the same as the search field's) the bar keeps 12 from the edges instead of 16, which gives the three labels room down to 320. */
export const BAR_NARROW_UNDER = 352;

/** What is drawn on a choice: the two that have two words go on two lines, so the three fit side by side from 320 up and look alike at every width. A screen reader says the plain label. */
export const BAR_DRAWN: Record<Testament, string> = { old: 'Old\nTestament', deutero: 'Deuterocanon', new: 'New\nTestament' };

/**
 * The three choices at the bottom of the Bible tab: Old Testament, Deuterocanon, New Testament. One is on at a time (the filled one);
 * the list above shows the books of that part. It floats just above the tab bar, 8 clear of it, the same place the gold pen takes on
 * Notes (the two never meet: the screen draws only one), and respects the safe area the way the tab bar does: the two numbers
 * (14 and 88) are the tab bar's own, see components/TabBar.tsx and components/Fab.tsx; src/lib/__tests__/navigation.test.ts fails when
 * they drift apart.
 *
 * A group of radio choices for a screen reader ("Old Testament, radio button, checked"), not tabs: the real tab bar below is the only
 * thing on the screen that is a "tab" to it. (`aria-checked` is there as well as `accessibilityState`, because the web build only reads
 * the first.) The labels are 14 with the weight of the tab bar's, the same for the filled one and the others so that nothing moves when
 * the choice changes. The middle label is a single long word, so it keeps its own width (it never shrinks, never wraps) and the other
 * two share what is left, each on two lines (BAR_DRAWN). Colours are roles: the filled choice is role.action with role.onAction, the
 * others role.text on the role.surface of the bar.
 */
export function TestamentBar({ value, onChange }: { value: Testament; onChange: (t: Testament) => void }) {
  const insets = useSafeAreaInsets();
  const narrow = useWindowDimensions().width < BAR_NARROW_UNDER;
  const edge = narrow ? 12 : layout.screenMargin;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Part of the Bible"
      style={{
        position: 'absolute', left: edge, right: edge, bottom: Math.max(insets.bottom - 14, 10) + 88 + 8, height: BAR_HEIGHT,
        flexDirection: 'row', alignItems: 'stretch', gap: 2, padding: 3, borderRadius: radius.pill,
        backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, ...shadowStyle('md'),
      }}
    >
      {TESTAMENTS.map((t) => {
        const on = t === value;
        return (
          <Pressable
            key={t}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={TESTAMENT_LABEL[t]}
            onPress={() => onChange(t)}
            style={({ pressed }) => ({
              flexGrow: t === 'deutero' ? 0 : 1, flexShrink: t === 'deutero' ? 0 : 1, flexBasis: t === 'deutero' ? 'auto' : 0,
              paddingHorizontal: narrow ? 4 : 8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? role.action : 'transparent', opacity: pressed ? 0.85 : 1,
            })}
          >
            <AppText style={{ fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 18, textAlign: 'center', color: on ? role.onAction : role.text }}>{BAR_DRAWN[t]}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
