import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, IconButton } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { useAuth } from '@/lib/auth';
import { assertOnline, isOfflineError } from '@/lib/net';
import { collectMyData, saveExport, summarize } from '@/lib/dataExport';
import { c, layout, role } from '@/theme';

// Settings > Account > Download my data. A copy of everything the account holds, as one JSON file the
// pilgrim keeps (GDPR access and portability). The work is in lib/dataExport.ts.
const INCLUDED = [
  'Your profile, settings and account details',
  'Your journeys, day plans, stamps and GPS tracks',
  'Your posts, comments, likes and saved posts, with links to your photos and videos',
  'Your friends, follows, chats you sent and notifications',
  'Health and smartwatch data, points and badges',
];

export default function DownloadData() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async () => {
    const user = session?.user;
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await assertOnline();
      const data = await collectMyData(user.id, user.email ?? null, (n, total) => setProgress(`Collecting your data… ${Math.round((n / total) * 100)}%`));
      setProgress('Preparing the file…');
      const saved = await saveExport(data);
      const s = summarize(data);
      if (saved) setDone(`Your file is ready: ${s.rows.toLocaleString()} records from ${s.tables} parts of your account.`);
    } catch (e) {
      setError(isOfflineError(e)
        ? 'You need a connection to download your data. Connect to Wi-Fi or mobile data and try again.'
        : 'We could not prepare your data. Please try again. If it keeps failing, write to privacy@camino.plus and we will send it to you.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: role.bg }} contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 40, gap: 16 }}>
      <IconButton name="back" label="Back" onPress={() => router.back()} />
      <View style={{ gap: 8 }}>
        <AppText variant="h2">Download my data</AppText>
        <AppText variant="lead" muted>Get a copy of everything your CaminoPlus account holds, in one file you can keep.</AppText>
      </View>

      <Card style={{ gap: 12 }}>
        <AppText variant="label">What is included</AppText>
        {INCLUDED.map((t) => (
          <View key={t} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="check" color={c.success} size={18} />
            <AppText variant="small" style={{ flex: 1 }}>{t}</AppText>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 6, backgroundColor: c.goldWash }}>
        <AppText variant="label">Good to know</AppText>
        <AppText variant="small">The file is in JSON, a standard format other apps and services can read. Photo and video links in it work for 7 days. Keep the file private: it holds your personal data.</AppText>
      </Card>

      {!!error && <FormMessage>{error}</FormMessage>}
      {!!done && (
        <Card style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.successWash }}>
          <Icon name="check" color={c.success} size={20} />
          <AppText variant="small" style={{ flex: 1 }}>{done}</AppText>
        </Card>
      )}
      {!!progress && <AppText variant="small" muted accessibilityLiveRegion="polite">{progress}</AppText>}

      <View style={{ gap: 12, marginTop: 8 }}>
        <Pill large label={done ? 'Download again' : 'Download my data'} onPress={run} loading={busy} />
      </View>
    </ScrollView>
  );
}
