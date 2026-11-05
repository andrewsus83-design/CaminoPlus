import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pill } from '@/components/Pill';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field, FormMessage } from '@/components/auth/Field';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/authLinks';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim()) return setError('Enter the email you signed up with.');
    setBusy(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: authRedirectUrl('reset') });
    setBusy(false);
    if (e) return setError(e.message);
    setSent(true);
  };

  return (
    <AuthShell title="Reset password" lead="We will email you a link to choose a new password."
      footer={sent ? <Pill variant="ghost" label="Back to sign in" onPress={() => router.replace('/sign-in')} /> : undefined}>
      {!!error && <FormMessage>{error}</FormMessage>}
      {sent ? (
        <FormMessage tone="info">{`If an account exists for ${email.trim()}, a reset link is on its way. Open it on this phone.`}</FormMessage>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" onSubmitEditing={submit} />
          <Pill label="Send reset link" onPress={submit} loading={busy} />
        </>
      )}
    </AuthShell>
  );
}
