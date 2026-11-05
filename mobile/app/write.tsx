import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { IconButton, Photo } from '@/components/ui';
import { role } from '@/theme';
import { tints } from '@/data/mock';
import { useAuth } from '@/lib/auth';
import { createJournalPost } from '@/lib/api';
import { FormMessage } from '@/components/auth/Field';

export default function Write() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const { session, journey, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = async () => {
    if (!session || !text.trim()) return setError('Write a few words about today first.');
    setBusy(true); setError(null);
    try {
      await createJournalPost({ userId: session.user.id, body: text.trim(), journeyId: journey?.id ?? null, routeId: journey?.route_id ?? null });
      await refresh();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconButton name="close" label="Close" onPress={() => router.back()} />
          <AppText variant="h4" style={{ flex: 1, textAlign: 'center', marginRight: 48 }}>New journey post</AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Photo tint={tints[0]} height={100} style={{ width: 100 }} />
          <TextInput multiline maxLength={600} value={text} onChangeText={setText} placeholder="How was today's stage?" placeholderTextColor={role.muted} style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 18, lineHeight: 26, color: role.text, textAlignVertical: 'top' }} />
        </View>
        <AppText variant="mono" muted style={{ textAlign: 'right', fontSize: 12 }}>{text.length} / 600</AppText>
      </Screen>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 16, gap: 8 }}>
        {!!error && <FormMessage>{error}</FormMessage>}
        <Pill label="Post" onPress={post} loading={busy} disabled={!text.trim()} />
      </View>
    </View>
  );
}
