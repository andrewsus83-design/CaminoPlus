import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { FormMessage } from '@/components/auth/Field';
import { completeAuthFromUrl } from '@/lib/authLinks';
import { supabase } from '@/lib/supabase';
import { layout, role } from '@/theme';

// Landing screen for caminoplus://auth-callback (email confirmation, password
// reset, Google on Android). Exchanges the code for a session, then moves on.
export default function AuthCallback() {
  const router = useRouter();
  const url = Linking.useURL();
  const done = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url || done.current) return;
    done.current = true;
    (async () => {
      const isReset = /[?&#]next=reset/.test(url) || /type=recovery/.test(url);
      const res = await completeAuthFromUrl(url);
      const { data } = await supabase.auth.getSession();
      if (res.ok || data.session) router.replace(isReset ? '/reset-password' : '/');
      else setError(res.error ?? 'This link could not be used.');
    })();
  }, [url, router]);

  return (
    <View style={{ flex: 1, backgroundColor: role.bg, justifyContent: 'center', padding: layout.screenMargin, gap: 20 }}>
      {error ? (
        <>
          <AppText variant="h3">Link did not work</AppText>
          <FormMessage>{error}</FormMessage>
          <AppText variant="small" muted>Links expire after a while and work only on the phone where you asked for them. Request a new one and try again.</AppText>
          <Pill label="Back to start" onPress={() => router.replace('/')} />
        </>
      ) : (
        <View style={{ alignItems: 'center', gap: 16 }}>
          <ActivityIndicator color={role.action} />
          <AppText variant="small" muted>Signing you in…</AppText>
        </View>
      )}
    </View>
  );
}
