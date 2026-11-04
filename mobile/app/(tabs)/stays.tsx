import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card, Chip, IconButton, Photo } from '@/components/ui';
import { Stay, stays } from '@/data/mock';
import { c, radius, role } from '@/theme';

const FILTERS = ['All', 'Albergue', 'Hotel', 'Café'] as const;

function StayCard({ s, fav, onFav }: { s: Stay; fav: boolean; onFav: () => void }) {
  const router = useRouter();
  return (
    <Card style={{ padding: 12, gap: 12 }} onPress={() => router.push(`/stay/${s.id}`)}>
      <View>
        <Photo tint={s.tint} height={170} />
        <Pressable accessibilityLabel={fav ? 'Remove favourite' : 'Add favourite'} onPress={onFav} style={{ position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: radius.pill, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="heart" color={fav ? c.red : c.blue} size={20} />
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 8, paddingBottom: 8, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="h4" style={{ flex: 1 }}>{s.name}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="star" color={c.gold} size={16} />
            <AppText variant="label">{s.rating}</AppText>
          </View>
        </View>
        <AppText variant="small" muted>{s.kind} · {s.town} · {s.distanceKm} km away · {s.reviews} reviews</AppText>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <AppText variant="label">{s.price ? `€${s.price} / night` : 'Café'}</AppText>
          <View style={{ paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: c.goldWash, justifyContent: 'center' }}>
            <AppText variant="caption" color={role.accentText}>{s.label}</AppText>
          </View>
        </View>
      </View>
    </Card>
  );
}

export default function Stays() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [onlyFavs, setOnlyFavs] = useState(false);
  const list = useMemo(() => stays.filter((s) => (filter === 'All' || s.kind === filter) && (!onlyFavs || favs.has(s.id)) && (s.name + s.town).toLowerCase().includes(q.toLowerCase())), [q, filter, favs, onlyFavs]);
  const toggle = (id: string) => setFavs((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 10 }}>
          <Icon name="search" color={c.blue} size={20} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search stays and cafes" placeholderTextColor={role.muted} style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16, color: role.text }} />
        </View>
        <IconButton name="heart" label="Favourites" size={52} onPress={() => setOnlyFavs((v) => !v)} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0, marginHorizontal: -24 }}>
        <View style={{ width: 16 }} />
        {FILTERS.map((f) => (<Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />))}
        <View style={{ width: 16 }} />
      </ScrollView>
      {list.map((s) => (<StayCard key={s.id} s={s} fav={favs.has(s.id)} onFav={() => toggle(s.id)} />))}
      {list.length === 0 && <AppText muted>Nothing matches. Try another search.</AppText>}
    </Screen>
  );
}
