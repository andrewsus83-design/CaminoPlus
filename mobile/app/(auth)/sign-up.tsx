import { useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field, FormMessage } from '@/components/auth/Field';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/authLinks';
import { role } from '@/theme';

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export default function SignUp() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const mail = email.trim().toLowerCase();
    if (!emailOk(mail)) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    const { data, error: e } = await supabase.auth.signUp({
      email: mail,
      password,
      options: { data: { full_name: name.trim() || undefined }, emailRedirectTo: authRedirectUrl() },
    });
    setBusy(false);
    if (e) return setError(e.message);
    // With "Confirm email" on there is no session yet: ask the user to check their inbox.
    if (!data.session) setSentTo(mail);
  };

  if (sentTo) {
    return (
      <AuthShell title="Check your email" lead={`We sent a confirmation link to ${sentTo}. Open it on this phone to finish creating your account.`}
        footer={<Pill variant="ghost" label="Back to sign in" onPress={() => router.replace('/sign-in')} />}>
        <FormMessage tone="info">No email after a few minutes? Check spam, or sign up again with the same address to resend.</FormMessage>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Start your Camino" lead="Create a free account. You can upgrade to CaminoPlus later.">
      {!!error && <FormMessage>{error}</FormMessage>}
      <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Ana Torres" maxLength={60} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="At least 8 characters" onSubmitEditing={submit} returnKeyType="go" />
      <Pill label="Create account" onPress={submit} loading={busy} />
      <AppText variant="caption" muted style={{ textAlign: 'center' }}>or</AppText>
      <GoogleButton onError={setError} />
      <Pressable onPress={() => router.replace('/sign-in')} style={{ alignSelf: 'center', paddingVertical: 8 }}>
        <AppText variant="small" muted>Have an account? <AppText variant="label" color={role.accentText}>Sign in</AppText></AppText>
      </Pressable>
    </AuthShell>
  );
}
