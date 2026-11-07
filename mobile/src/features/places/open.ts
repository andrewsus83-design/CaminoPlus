// Opening a link (a phone number, an e-mail, a web page) from a screen. The address has already been checked by links.ts.
import { Alert, Linking } from 'react-native';

/** Hands `url` to the phone. A phone that cannot open it says so instead of doing nothing. Never throws. */
export async function openLink(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open it', 'This phone could not open the link.');
  }
}
