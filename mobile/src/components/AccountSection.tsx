import { Alert, Platform, View } from 'react-native';
import { AppText } from './AppText';
import { Pill } from './Pill';
import { Card, SectionLabel } from './ui';
import { useAuth } from '@/lib/auth';
import { c } from '@/theme';

/** Settings > Account: who is signed in, how, and sign out. */
export function AccountSection() {
  const { session, profile, signOut } = useAuth();
  const user = session?.user;
  const provider = user?.app_metadata?.provider === 'google' ? 'Google' : 'Email';
  const confirmSignOut = () => {
    if (Platform.OS === 'web') return void signOut();
    Alert.alert('Sign out?', 'Downloaded stages stay on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };
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
      <Pill variant="ghost" label="Sign out" onPress={confirmSignOut} />
    </View>
  );
}
