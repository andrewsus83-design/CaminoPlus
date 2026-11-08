// "Delete this note?", asked the same way wherever a note can be deleted. Native: the system alert. Web: Alert.alert with buttons does nothing
// there, so the browser's own confirm (the same split as the diary's, features/diary/confirm.ts).
import { Alert, Platform } from 'react-native';

export const DELETE_TITLE = 'Delete this note?';
export const deleteMessage = (what: 'note' | 'reflection') => `This ${what} is only on this phone. Once it is deleted it cannot be brought back.`;

/** Asks first; `onConfirm` runs only when the person says yes. Without a way to ask, nothing is deleted. */
export function confirmDeleteNote(what: 'note' | 'reflection', onConfirm: () => void) {
  const message = deleteMessage(what);
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function' || !window.confirm(`${DELETE_TITLE}\n\n${message}`)) return;
    return void onConfirm();
  }
  Alert.alert(DELETE_TITLE, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void onConfirm() },
  ]);
}
