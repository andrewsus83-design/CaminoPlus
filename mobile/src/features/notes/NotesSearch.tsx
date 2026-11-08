import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { c, fonts, radius, role } from '@/theme';

/** Browsers draw a focus outline on inputs; the border of the pill already shows focus. (Web only: native rejects the value.) */
const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as object | null;

export const NOTES_SEARCH_PLACEHOLDER = 'Search your notes';
export const NOTES_SEARCH_LABEL = 'Search your notes';
export const NOTES_CLEAR_LABEL = 'Clear search';

/**
 * The search field of the Notebook: the pill of the Library's search (the same height, the same colours, roles only), with its own words. What
 * is typed is a few letters of a word, so there is no autocorrect and no capital letter; the phone's key says "search" and closes the keyboard.
 */
export function NotesSearch({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) {
  const [focus, setFocus] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const edge = focus ? 2 : 1;
  return (
    <View style={{ minWidth: 0, height: 52, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: edge, borderColor: focus ? c.gold : role.border, flexDirection: 'row', alignItems: 'center', paddingLeft: 17 - edge, paddingRight: 5 - edge, gap: 8 }}>
      <Icon name="search" color={role.text} size={22} />
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholder={NOTES_SEARCH_PLACEHOLDER}
        placeholderTextColor={role.muted}
        accessibilityLabel={NOTES_SEARCH_LABEL}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        clearButtonMode="never"
        maxLength={60}
        style={[{ flex: 1, minWidth: 0, height: 48, paddingVertical: 0, fontFamily: fonts.body, fontSize: 17, color: role.text }, noOutline]}
      />
      {value.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel={NOTES_CLEAR_LABEL} onPress={() => { onChangeText(''); input.current?.focus(); }} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={role.muted} size={20} />
        </Pressable>
      )}
    </View>
  );
}
