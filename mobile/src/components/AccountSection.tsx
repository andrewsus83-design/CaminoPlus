import { useRouter } from 'expo-router';
import { Alert, Platform, Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Card, SectionLabel } from './ui';
import { useAuth } from '@/lib/auth';
import { c } from '@/theme';

/** Round log out button for the top right of Settings; asks before signing out. */
export function LogoutButton() {
  const { signOut } = useAuth();
  const confirm = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && !window.confirm('Log out of CaminoPlus?')) return;
      return void signOut();
    }
    Alert.alert('Log out?', 'Are you sure you want to log out? Downloaded stages stay on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={confirm} hitSlop={8}
      style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: c.white, borderWidth: 1, borderColor: c.sand300, opacity: pressed ? 0.8 : 1 })}>
      <Icon name="logout" color={c.blue} size={26} />
    </Pressable>
  );
}

/** Settings > Account: who is signed in and how. */
export function AccountSection() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const user = session?.user;
  const provider = user?.app_metadata?.provider === 'google' ? 'Google' : 'Email';
  const rows: [string, string][] = [
    ['Name', profile?.display_name || '-'],
    ['Username', profile?.username ? `@${profile.username}` : '-'],
    ['Email', user?.email ?? '-'],
    ['Signed in with', provider],
  ];
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel>Account</SectionLabel>
      <Card style={{ padding: 4 }}>
        {rows.map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: c.sand300 }}>
            <AppText variant="label">{k}</AppText>
            <AppText variant="small" muted numberOfLines={1} style={{ flexShrink: 1 }}>{v}</AppText>
          </View>
        ))}
      </Card>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit account" onPress={() => router.push('/edit-account')}
        style={({ pressed }) => ({ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: c.white, borderWidth: 1.5, borderColor: c.blue, opacity: pressed ? 0.8 : 1 })}>
        <Icon name="pen" color={c.blue} size={22} />
        <AppText variant="label" color={c.blue}>Edit account</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Delete account" onPress={() => router.push('/delete-account')} hitSlop={8}
        style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="label" color={c.red}>Delete account</AppText>
      </Pressable>
    </View>
  );
}
