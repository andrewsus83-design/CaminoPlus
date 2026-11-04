import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, IconButton, Photo, SectionLabel } from '@/components/ui';
import { reviews, rooms, stays } from '@/data/mock';
import { c, radius, role } from '@/theme';

export default function StayDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = stays.find((x) => x.id === id);
  if (!s) return <Screen><AppText>Stay not found.</AppText></Screen>;
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <Screen>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <IconButton name="back" label="Back" onPress={() => router.back()} />
          <IconButton name="heart" label="Favourite" />
        </View>
        <Photo tint={s.tint} height={260} style={{ borderRadius: radius.lg }} />
        <AppText variant="h2">{s.name}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="star" color={c.gold} size={18} />
          <AppText variant="label">{s.rating}</AppText>
          <AppText variant="small" muted>· {s.reviews} reviews · {s.town}</AppText>
        </View>
        <AppText variant="body" muted>A friendly pilgrim albergue on the Camino Francés. Communal dinner, laundry, and a quiet garden.</AppText>
        <SectionLabel>Beds and rooms</SectionLabel>
        {rooms.map((r) => (
          <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{r.name}</AppText>
              <AppText variant="caption" muted>{r.note}</AppText>
            </View>
            <AppText variant="h4">€{r.price}</AppText>
          </Card>
        ))}
        <SectionLabel>Reviews</SectionLabel>
        {reviews.map((v) => (
          <Card key={v.id} style={{ padding: 16, gap: 4 }}>
            <AppText variant="label">{v.who} <AppText variant="mono" muted style={{ fontSize: 12 }}>{v.when}</AppText></AppText>
            <AppText variant="small">{v.text}</AppText>
          </Card>
        ))}
      </Screen>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: role.surface, borderTopWidth: 1, borderTopColor: role.border, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1 }}>
          <AppText variant="h4">{s.price ? `€${s.price}` : 'Café'}</AppText>
          <AppText variant="caption" muted>{s.label}</AppText>
        </View>
        <View style={{ flex: 1 }}><Pill label="Contact" /></View>
      </View>
    </View>
  );
}
