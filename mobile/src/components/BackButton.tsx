import { useRouter, type Href } from 'expo-router';
import { IconButton } from './ui';

// THE Back button of the app, and the only one: the round 48 px IconButton (the surface colour, a hairline) with the back chevron, named "Back", at the left of the
// first row of a screen that was opened from another one. No screen draws its own: not a pill that says "Contents", not a bare icon, not a button of another size or
// without the hairline (src/lib/__tests__/navigation.test.ts fails when one does, and lists the few places that draw the chevron for something else, a "Previous"
// arrow, with the reason of each).
//
//  - With nothing but `fallback` it goes back to the screen before this one, and to `fallback` when there is none (a link, a notification or a reload opened this screen
//    and there is nothing behind it): the screen's home, "/library" for the Library, "/me" for what Me opens, "/" when it has none.
//  - With `onPress` it does what that says (a step back inside a screen: the second step of a form, the contents of a book that the reader came from).
//  - `hint` is what a screen reader adds after "Back" when the button goes somewhere other than the screen before ("Back to the contents of this book").
type Props = { onPress?: () => void; fallback?: Href; hint?: string };

export function BackButton({ onPress, fallback = '/', hint }: Props) {
  const router = useRouter();
  return <IconButton name="back" label="Back" hint={hint} onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace(fallback)))} />;
}
