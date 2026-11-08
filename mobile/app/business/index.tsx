import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { SampleNotice } from '@/components/SampleNotice';
import { BackButton } from '@/components/BackButton';
import { Photo } from '@/components/ui';
import { Badge, Highlight } from '@/features/business/ui';
import { tints } from '@/data/mock';
import { radius } from '@/theme';

// Settings > For business > List your business (Agoda-extranet style landing).
export default function BusinessWelcome() {
  const router = useRouter();
  return (
    <Screen>
      <BackButton fallback="/stays" />
      <Badge label="For business owners" tone="gold" icon="briefcase" />
      <SampleNotice title="Listings open soon">Look around and try the steps. At the end we email your details to the team, and we write to you the day business listings open.</SampleNotice>
      <AppText variant="h1">Welcome pilgrims to your door</AppText>
      <AppText variant="body" muted>Albergue, hotel, café, shop or service on the Camino? List it for free and reach pilgrims walking past today.</AppText>
      <Photo tint={tints[4]} height={160} style={{ borderRadius: radius.lg }} />
      <View style={{ gap: 18, marginTop: 4 }}>
        <Highlight icon="shield" title="Verified owner badge" text="Stand out in Stays and on the map" />
        <Highlight icon="stays" title="Beds free or full, in one tap" text="Pilgrims see it live, even on the trail" />
        <Highlight icon="chat" title="Answer reviews and messages" text="Views, saves and taps on your dashboard" />
      </View>
      <AppText variant="small" muted>5 short steps · about 10 minutes · we check every listing by hand before it goes live.</AppText>
      <Pill variant="gold" label="Get started · it's free" onPress={() => router.push('/business/register')} />
      <Pill variant="ghost" label="See a sample dashboard" onPress={() => router.push('/business/dashboard')} />
    </Screen>
  );
}
