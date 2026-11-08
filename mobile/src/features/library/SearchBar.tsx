import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { Icon } from '@/components/Icon';
import { c, fonts, radius, role, space } from '@/theme';
import { setSearchFocused } from './continueBar/searchFocus';

/** Browsers draw a focus outline on inputs; the border of the pill already shows focus. (Web only: native rejects the value.) */
const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as object | null;

export const SEARCH_PLACEHOLDER = 'Search the Library';
/** On a phone under 352 wide the pill is too narrow for the whole sentence (it would be cut in the middle of a word): the short one fits down to 320. */
export const SEARCH_PLACEHOLDER_NARROW = 'Search';
export const NARROW_UNDER = 352;
export const SEARCH_LABEL = 'Search the library';
export const CLEAR_LABEL = 'Clear search';

/**
 * The search field of the Library: a pill 52 high (as high as the round button next to it), the search icon 16 from its edge, the text, and
 * a clear button (x, 48 by 48, 4 from the edge) once something is typed. It takes the width it is given and shrinks with it (minWidth 0 on both the pill and
 * the input: without it a web input keeps its own width and pushes the buttons out of the row).
 *
 * Colours are roles only: typed text role.text, placeholder and the x role.muted (both well over 4.5:1 on role.surface in light and
 * dark), border role.border and gold while it has focus. Focus makes the border 2 instead of 1 thick and takes the same from the
 * padding, so nothing in the row moves. The phone's own keyboard key says "search" and closes the keyboard; there is no
 * autocorrect, no capital letter and no spell check, because what is typed is a few letters of a title. `onFocus` tells the screen the field was touched: it is
 * the moment to get the search ready (the first search of the Bible reads and folds its words), a beat before the first letter arrives. Whether the field has the
 * focus is also told to the "Continue reading" bar (continueBar/searchFocus.ts), which steps aside while it does, so it never floats over the keyboard.
 */
export function SearchBar({ value, onChangeText, onFocus }: { value: string; onChangeText: (text: string) => void; onFocus?: () => void }) {
  const [focus, setFocus] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const narrow = useWindowDimensions().width < NARROW_UNDER;
  const edge = focus ? 2 : 1;
  // The "Continue reading" bar steps aside while the field has the focus; a field that goes away while it has it gives the focus back.
  useEffect(() => { setSearchFocused(focus); return () => setSearchFocused(false); }, [focus]);
  return (
    <View
      style={{
        flex: 1, minWidth: 0, height: 52, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: edge, borderColor: focus ? c.gold : role.border,
        flexDirection: 'row', alignItems: 'center', paddingLeft: space[4] - edge, paddingRight: space[1] - edge, gap: space[2],
      }}
    >
      <Icon name="search" color={role.text} />
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => { setFocus(true); onFocus?.(); }}
        onBlur={() => setFocus(false)}
        placeholder={narrow ? SEARCH_PLACEHOLDER_NARROW : SEARCH_PLACEHOLDER}
        placeholderTextColor={role.muted}
        accessibilityLabel={SEARCH_LABEL}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        clearButtonMode="never"
        maxLength={60}
        style={[{ flex: 1, minWidth: 0, height: 48, paddingVertical: 0, fontFamily: fonts.body, fontSize: 17, color: role.text }, noOutline]}
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CLEAR_LABEL}
          onPress={() => { onChangeText(''); input.current?.focus(); }}
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="close" color={role.muted} size={20} />
        </Pressable>
      )}
    </View>
  );
}
