import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Pill } from './Pill';
import { c, layout, role } from '@/theme';

/**
 * Shown when someone is signed in but their account could not be loaded and nothing is saved on this
 * phone yet (for example the first launch after installing, without signal). It never sends them to
 * onboarding: we simply do not know yet whether they already have a Camino.
 */
export function AccountUnavailable({ message, busy, onRetry, onSignOut }: { message: string | null; busy: boolean; onRetry: () => void; onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  const offline = !message || /offline/i.test(message);
  return (
    <View style={{ flex: 1, backgroundColor: role.bg, justifyContent: 'center', paddingHorizontal: layout.screenMargin, paddingTop: insets.top, paddingBottom: insets.bottom + 24, gap: 20 }}>
      <View style={{ alignItems: 'center', gap: 16 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.goldWash, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="shell" color={c.gold} size={42} />
        </View>
        <AppText variant="h3" style={{ textAlign: 'center' }}>{offline ? 'No signal right now' : 'We could not open your account'}</AppText>
        <AppText variant="lead" muted style={{ textAlign: 'center' }}>
          {offline
            ? 'Connect to Wi-Fi or mobile data once and your Camino will open. After that it works offline too.'
            : message}
        </AppText>
      </View>
      <View style={{ gap: 12 }}>
        <Pill large label="Try again" onPress={onRetry} loading={busy} />
        <Pill variant="ghost" label="Log out" onPress={onSignOut} disabled={busy} />
      </View>
      {busy && <ActivityIndicator color={role.action} />}
    </View>
  );
}
