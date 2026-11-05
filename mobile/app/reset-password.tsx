import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pill } from '@/components/Pill';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field, FormMessage } from '@/components/auth/Field';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function ResetPassword() {
  const router = useRouter();
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <AuthShell title="Link expired" lead="Request a new password reset link and open it on this phone.">
        <Pill label="Request new link" onPress={() => router.replace('/forgot-password')} />
      </AuthShell>
    );
  }

  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) return setError(e.message);
    router.replace('/');
  };

  return (
    <AuthShell title="New password" lead={`For ${session.user.email ?? 'your account'}.`} back={false}>
      {!!error && <FormMessage>{error}</FormMessage>}
      <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="At least 8 characters" />
      <Field label="Repeat password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} />
      <Pill label="Save password" onPress={submit} loading={busy} />
    </AuthShell>
  );
}
