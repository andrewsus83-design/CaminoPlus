import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { IconButton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/authLinks';
import { c, fonts, layout, radius, role } from '@/theme';

const input = { height: 56, fontFamily: fonts.body, fontSize: 19, color: role.text, backgroundColor: role.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: role.border, paddingHorizontal: 16 } as const;

export default function EditAccount() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile, refresh } = useAuth();
  const user = session?.user;
  const isGoogle = user?.app_metadata?.provider === 'google';
  const [name, setName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!user) return;
    const n = name.trim();
    const u = username.trim().replace(/^@/, '').toLowerCase();
    if (!n) return Alert.alert('Name needed', 'Please enter your name.');
    if (!/^[a-z0-9_.]{3,24}$/.test(u)) return Alert.alert('Username', 'Use 3 to 24 letters, numbers, dots or underscores.');
    setBusy(true);
    try {
      await updateProfile(user.id, { display_name: n, username: u });
      let note = 'Your account was updated.';
      const newEmail = email.trim().toLowerCase();
      if (!isGoogle && newEmail && newEmail !== user.email) {
        const { error } = await supabase.auth.updateUser({ email: newEmail });
        if (error) throw error;
        note = 'Your account was updated. Check both inboxes to confirm the new email address.';
      }
      await refresh();
      Alert.alert('Saved', note, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Please try again.';
      Alert.alert('Could not save', /duplicate|unique/i.test(msg) ? 'That username is already taken.' : msg);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: authRedirectUrl('reset') });
    Alert.alert(error ? 'Could not send' : 'Check your email', error ? error.message : `We sent a link to ${user.email} to choose a new password.`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: role.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <AppText variant="h2">Edit account</AppText>
        <View style={{ gap: 6 }}>
          <AppText variant="label">Name</AppText>
          <TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Your name" placeholderTextColor={role.muted} style={input} />
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="label">Username</AppText>
          <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={24} placeholder="username" placeholderTextColor={role.muted} style={input} />
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="label">Email</AppText>
          <TextInput value={email} onChangeText={setEmail} editable={!isGoogle} autoCapitalize="none" keyboardType="email-address" style={[input, isGoogle && { opacity: 0.6 }]} />
          {isGoogle && <AppText variant="caption" muted>You signed in with Google, so your email is managed by Google.</AppText>}
        </View>
        <Pressable accessibilityRole="button" onPress={save} disabled={busy} style={{ height: 68, borderRadius: 34, backgroundColor: c.blue, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
          <AppText variant="label" color={c.parchment}>{busy ? 'Saving…' : 'Save changes'}</AppText>
        </Pressable>
        {!isGoogle && (
          <Pressable accessibilityRole="button" onPress={resetPassword} style={{ height: 56, borderRadius: 28, borderWidth: 1.5, borderColor: c.blue, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="label" color={c.blue}>Change password by email</AppText>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
