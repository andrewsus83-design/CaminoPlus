// "Delete this page?", asked the same way wherever a page can be deleted. Native: the system alert. Web: Alert.alert with
// buttons does nothing there, so the browser's own confirm (the same split as the log out button, components/AccountSection).
import { Alert, Platform } from 'react-native';
import { clip } from './present';

/** Asks first; `onConfirm` runs only when the person says yes. Without a way to ask, nothing is deleted. */
export function confirmDelete(pageName: string, onConfirm: () => void) {
  const title = 'Delete this page?';
  const message = `"${clip(pageName, 60)}" is only on this phone. Once it is deleted it cannot be brought back.`;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function' || !window.confirm(`${title}\n\n${message}`)) return;
    return void onConfirm();
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void onConfirm() },
  ]);
}
