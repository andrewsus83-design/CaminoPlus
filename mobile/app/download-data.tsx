import { useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { Card, IconButton } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { supabase } from '@/lib/supabase';
import { assertOnline, isOfflineError } from '@/lib/net';
import { c, layout, role } from '@/theme';

// Settings > Account > Download my data. public.export_my_data() returns everything the person has put
// into CaminoPlus as one JSON document; the share sheet lets them save it to Files, mail it to themselves
// or send it to another app. Only the person's own rows are included.
const INCLUDED = [
  'Your profile and settings',
  'Your journeys, days, stamps and tracks',
  'Your posts, comments, likes and saved posts',
  'Your favourites, reviews and crowd reports',
  'Your friends, followers and the messages you sent',
  'Your health data, achievements and XP',
];

export default function DownloadData() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await assertOnline();
      const { data, error: e } = await supabase.rpc('export_my_data');
      if (e) throw e;
      const text = JSON.stringify(data, null, 2);
      const res = await Share.share({ title: 'My CaminoPlus data', message: text });
      if (res.action !== Share.dismissedAction) setDone(true);
    } catch (e) {
      setError(isOfflineError(e)
        ? 'You are offline. Connect to Wi-Fi or mobile data and try again.'
        : 'We could not prepare your data. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 40, gap: 16 }} style={{ backgroundColor: role.bg }}>
      <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <View style={{ gap: 8 }}>
        <AppText variant="h2">Download my data</AppText>
        <AppText variant="lead" muted>Get a copy of what you have shared with CaminoPlus, as one file you can keep.</AppText>
      </View>
      <Card style={{ gap: 8 }}>
        <AppText variant="label">What is in the file</AppText>
        {INCLUDED.map((t) => <AppText key={t} variant="small">• {t}</AppText>)}
        <AppText variant="caption" muted>Photos and videos are not inside the file. Other people appear only as ids. Your diary is not in the file: its pages, photos, videos and places are only on this phone, and we never receive them.</AppText>
      </Card>
      {!!error && <FormMessage>{error}</FormMessage>}
      {done && <Card style={{ backgroundColor: c.goldWash }}><AppText variant="small">Your data was shared. Keep the file somewhere safe: it is personal.</AppText></Card>}
      <Pill large label="Prepare my data" onPress={run} loading={busy} />
    </ScrollView>
  );
}
