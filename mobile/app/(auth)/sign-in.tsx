import { useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field, FormMessage } from '@/components/auth/Field';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { supabase } from '@/lib/supabase';
import { role } from '@/theme';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e) setError(e.message === 'Email not confirmed' ? 'Please confirm your email first. Check your inbox for the link.' : e.message);
    // On success the route guard moves to onboarding or the tabs.
  };

  return (
    <AuthShell title="Welcome back" lead="Sign in to pick up where you left the trail.">
      {!!error && <FormMessage>{error}</FormMessage>}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" placeholder="Your password" onSubmitEditing={submit} returnKeyType="go" />
      <Pressable onPress={() => router.push('/forgot-password')} style={{ alignSelf: 'flex-end', paddingVertical: 4 }}>
        <AppText variant="label" color={role.accentText}>Forgot password?</AppText>
      </Pressable>
      <Pill label="Sign in" onPress={submit} loading={busy} />
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>or</AppText>
      <GoogleButton onError={setError} />
      <Pressable onPress={() => router.replace('/sign-up')} style={{ alignSelf: 'center', paddingVertical: 8 }}>
        <AppText variant="small" muted>New here? <AppText variant="label" color={role.accentText}>Create an account</AppText></AppText>
      </Pressable>
    </AuthShell>
  );
}
