import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSearchFocused } from './searchFocus';

/**
 * Is somebody typing: the phone's keyboard is open, or the search field of the Library has the focus. The "Continue reading" bar steps aside while it is true, because the
 * bar sits at the bottom and would float over the keys. The keyboard says when it opens and closes (iOS says it before the keys move: "will", Android after: "did"); the
 * search field says when it has the focus (searchFocus.ts), which also covers a browser, where there is no such event, and a phone with a keyboard attached, where no keys
 * show. Either is enough.
 */
export function useTyping(): boolean {
  const searching = useSearchFocused();
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboard(true));
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  return searching || keyboard;
}
