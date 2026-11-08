import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { radius, role } from '@/theme';
import { TESTAMENTS, TESTAMENT_LABEL, type Testament } from './books';

/** The control is this high (the choices inside it are 48, never under 44). */
export const BAR_HEIGHT = 56;

/** A person who has made the phone's text larger still gets larger labels here, up to this much: three labels in a row of a 320 wide phone cannot grow without end. */
export const BAR_MAX_FONT_SCALE = 1.2;

/** What is drawn on a choice: the two that have two words go on two lines, so the three fit side by side from 320 up and look alike at every width. A screen reader says the plain label. */
export const BAR_DRAWN: Record<Testament, string> = { old: 'Old\nTestament', deutero: 'Deuterocanon', new: 'New\nTestament' };

/**
 * The three choices of the Bible tab: Old Testament, Deuterocanon, New Testament. One is on at a time (the filled one); the grid of books under it
 * shows the books of that part. It sits in the page, directly under the daily reading banner and above the books, and scrolls with them: it is a
 * segmented pill (a sunken track and a filled choice), not the underline of the Bible, Books and Notes strip at the very top of the screen.
 *
 * A group of radio choices for a screen reader ("Old Testament, radio button, checked"), not tabs: the real tab bar below is the only thing on the
 * screen that is a "tab" to it. (`aria-checked` is there as well as `accessibilityState`, because the web build only reads the first.) The labels are
 * Inter, 14 with the weight of the tab bar's, the same for the filled one and the others so that nothing moves when the choice changes. The middle label
 * is a single long word, so it keeps its own width (it never shrinks, never wraps) and the other two share what is left, each on two lines (BAR_DRAWN).
 * Colours are roles: the filled choice is role.action with role.onAction, the others role.text on the role.sunken track.
 */
export function TestamentBar({ value, onChange }: { value: Testament; onChange: (t: Testament) => void }) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Part of the Bible"
      style={{ height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'stretch', gap: 2, padding: 4, borderRadius: radius.pill, backgroundColor: role.sunken }}
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
              paddingHorizontal: 6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? role.action : 'transparent', opacity: pressed ? 0.85 : 1,
            })}
          >
            <AppText variant="label" maxFontSizeMultiplier={BAR_MAX_FONT_SCALE} color={on ? role.onAction : role.text} style={{ fontSize: 14, lineHeight: 18, textAlign: 'center' }}>{BAR_DRAWN[t]}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
