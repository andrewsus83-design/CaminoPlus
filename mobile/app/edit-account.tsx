import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/authLinks';
import { layout, radius, role, space, textStyle } from '@/theme';

// Getters, so the colours follow the light/dark theme (read each time the style is used). The type of a field is the body variant, textStyle('body'): a TextInput cannot be an AppText.
const input = { height: 56, get color() { return role.text; }, get backgroundColor() { return role.surface; }, borderRadius: radius.lg, borderWidth: 1, get borderColor() { return role.border; }, paddingHorizontal: space[4] };

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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + space[10], gap: layout.stackGap }}>
        <BackButton fallback="/settings" />
        <AppText variant="h2">Edit account</AppText>
        <View style={{ gap: space[2] }}>
          <AppText variant="label">Name</AppText>
          <TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Your name" placeholderTextColor={role.muted} style={[textStyle('body'), input]} />
        </View>
        <View style={{ gap: space[2] }}>
          <AppText variant="label">Username</AppText>
          <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={24} placeholder="username" placeholderTextColor={role.muted} style={[textStyle('body'), input]} />
        </View>
        <View style={{ gap: space[2] }}>
          <AppText variant="label">Email</AppText>
          <TextInput value={email} onChangeText={setEmail} editable={!isGoogle} autoCapitalize="none" keyboardType="email-address" style={[textStyle('body'), input, isGoogle && { opacity: 0.6 }]} />
          {isGoogle && <AppText variant="caption" muted>You signed in with Google, so your email is managed by Google.</AppText>}
        </View>
        <Pressable accessibilityRole="button" onPress={save} disabled={busy} style={{ height: 68, borderRadius: radius.pill, backgroundColor: role.action, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
          <AppText variant="label" color={role.onAction}>{busy ? 'Saving…' : 'Save changes'}</AppText>
        </Pressable>
        {!isGoogle && (
          <Pressable accessibilityRole="button" onPress={resetPassword} style={{ height: 56, borderRadius: radius.pill, borderWidth: 1.5, borderColor: role.action, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="label" color={role.action}>Change password by email</AppText>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Delete account" onPress={() => router.push('/delete-account')} hitSlop={8} style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center', marginTop: space[3] }}>
          <AppText variant="label" color={role.danger}>Delete account</AppText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
