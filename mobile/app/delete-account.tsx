import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, IconButton } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { clearDiary } from '@/features/diary/storage';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { assertOnline, isOfflineError } from '@/lib/net';
import { c, fonts, layout, radius, role } from '@/theme';

// Settings > Account > Edit account > Delete account. Required by the App Store and Google Play for apps
// that let people create an account. The work happens in the delete-account edge function (it needs the
// service role); this screen only asks, clearly, and signs the phone out afterwards.
const WILL_GO = [
  'Your profile, journey plan and stamps',
  'Your posts, photos and videos',
  'Your friends, chats and group memberships',
  'Everything saved for you in the cloud',
  'The pages of your diary on this phone',
];

export default function DeleteAccount() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = text.trim().toUpperCase() === 'DELETE';

  const run = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    const uid = session?.user.id; // read now: once signed out there is no session to ask
    try {
      await assertOnline();
      const { error: e } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
      if (e) throw e;
      // The account is gone, so is the diary. It exists only on this phone and is the one thing signing out keeps
      // (src/features/diary/store.ts), so it is cleared here, and only after the server said yes. Nothing that goes
      // wrong while clearing it may stop the deletion from finishing: the sign-out below must always happen.
      if (uid) {
        try { await clearDiary(uid); } catch { /* clearDiary does not throw; this keeps it that way for the flow */ }
      }
      Alert.alert('Account deleted', 'Your account and your data were deleted. Thank you for walking with us. Buen Camino!');
      await signOut(); // clears this phone; the route guard then returns to the welcome screen
    } catch (e) {
      setError(isOfflineError(e)
        ? 'You need a connection to delete your account. Connect to Wi-Fi or mobile data and try again.'
        : 'We could not delete your account. Please try again. If it keeps failing, write to privacy@camino.plus and we will do it for you.');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: role.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 40, gap: 16 }}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <View style={{ gap: 8 }}>
          <AppText variant="h2">Delete account</AppText>
          <AppText variant="lead" muted>This removes your CaminoPlus account and what is in it. It cannot be undone.</AppText>
        </View>

        <Card style={{ gap: 12 }}>
          <AppText variant="label">What will be deleted</AppText>
          {WILL_GO.map((t) => (
            <View key={t} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Icon name="close" color={c.red} size={18} />
              <AppText variant="small" style={{ flex: 1 }}>{t}</AppText>
            </View>
          ))}
        </Card>

        <Card style={{ gap: 6, backgroundColor: c.goldWash }}>
          <AppText variant="label">Before you go</AppText>
          <AppText variant="small">Pilgrim Plus is billed by the App Store or Google Play. Deleting your account does not cancel it, so please cancel the subscription there first to avoid another charge. Offline maps stay on this phone until you remove the app.</AppText>
        </Card>

        <View style={{ gap: 8 }}>
          <AppText variant="label">Type DELETE to confirm</AppText>
          <TextInput
            value={text}
            onChangeText={setText}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor={role.muted}
            accessibilityLabel="Type DELETE to confirm"
            style={{ height: 56, fontFamily: fonts.body, fontSize: 19, color: role.text, backgroundColor: role.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: confirmed ? c.red : role.border, paddingHorizontal: 16 }}
          />
        </View>

        {!!error && <FormMessage>{error}</FormMessage>}

        <View style={{ gap: 12, marginTop: 8 }}>
          <Pill large label="Delete my account" onPress={run} disabled={!confirmed} loading={busy} />
          <Pill large variant="ghost" label="Keep my account" onPress={() => router.back()} disabled={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
