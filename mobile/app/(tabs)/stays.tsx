import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card, Chip, IconButton, Photo } from '@/components/ui';
import { Stay, stays } from '@/data/mock';
import { PromoBanner } from '@/components/PromoBanner';
import { Badge } from '@/features/business/ui';
import { BusinessFeedCard } from '@/features/business/BusinessCard';
import { ownerStore, useOwner } from '@/features/business/store';
import { Pill } from '@/components/Pill';
import { SampleNotice, SampleTag } from '@/components/SampleNotice';
import { c, layout, radius, role } from '@/theme';
// Sample content is never shared outside the app: share the invitation instead of an invented place or caption.
const SHARE_APP = 'Walking the Camino? CaminoPlus has offline maps, stays and a pilgrim passport: https://camino.plus';

const KINDS = ['All', 'Albergue', 'Hotel', 'Café'] as const;
const DISTANCES = [{ l: 'Any', v: Infinity }, { l: 'Under 1 km', v: 1 }, { l: 'Under 5 km', v: 5 }] as const;
const REVIEWS = [{ l: 'Any', v: 0 }, { l: '4.0+', v: 4 }, { l: '4.5+', v: 4.5 }] as const;
const PRICES = ['$', '$$', '$$$'] as const;
type Filters = { kind: (typeof KINDS)[number]; dist: number; rating: number; prices: string[] };
const NO_FILTERS: Filters = { kind: 'All', dist: Infinity, rating: 0, prices: [] };
// $ = under €20 (and cafés), $$ = €20 to €50, $$$ = over €50
const tier = (price: number | null) => (price == null || price < 20 ? '$' : price <= 50 ? '$$' : '$$$');

function FilterSheet({ open, value, onClose, onApply }: { open: boolean; value: Filters; onClose: () => void; onApply: (f: Filters) => void }) {
  const [f, setF] = useState(value);
  const [shown, setShown] = useState(open);
  if (open !== shown) { setShown(open); if (open) setF(value); }
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close filters" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(20,54,93,0.45)' }} />
      <View style={{ backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: layout.screenMargin, paddingTop: 24, paddingBottom: 36, gap: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="h4">Filters</AppText>
          <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={12}><Icon name="close" color={role.text} size={28} /></Pressable>
        </View>
        <View style={{ gap: 10 }}>
          <AppText variant="label">Type of stay</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{KINDS.map((k) => <Chip key={k} label={k} selected={f.kind === k} onPress={() => setF({ ...f, kind: k })} />)}</View>
        </View>
        <View style={{ gap: 10 }}>
          <AppText variant="label">Distance</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{DISTANCES.map((d) => <Chip key={d.l} label={d.l} selected={f.dist === d.v} onPress={() => setF({ ...f, dist: d.v })} />)}</View>
        </View>
        <View style={{ gap: 10 }}>
          <AppText variant="label">Review</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{REVIEWS.map((r) => <Chip key={r.l} label={r.l} selected={f.rating === r.v} onPress={() => setF({ ...f, rating: r.v })} />)}</View>
        </View>
        <View style={{ gap: 10 }}>
          <AppText variant="label">Price</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{PRICES.map((p) => <Chip key={p} label={p} selected={f.prices.includes(p)} onPress={() => setF({ ...f, prices: f.prices.includes(p) ? f.prices.filter((x) => x !== p) : [...f.prices, p] })} />)}</View>
          <AppText variant="caption" muted>$ under €20 · $$ €20 to €50 · $$$ over €50</AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Pill large variant="ghost" label="Reset" onPress={() => setF(NO_FILTERS)} /></View>
          <View style={{ flex: 1 }}><Pill large label="Show stays" onPress={() => onApply(f)} /></View>
        </View>
      </View>
    </Modal>
  );
}

function StayCard({ s, fav, onFav }: { s: Stay; fav: boolean; onFav: () => void }) {
  const router = useRouter();
  return (
    <Card style={{ padding: 12, gap: 12 }} onPress={() => router.push(`/stay/${s.id}`)}>
      <View>
        <Photo tint={s.tint} height={170} />
        <View style={{ position: 'absolute', top: 10, left: 10 }}><SampleTag /></View>
        <Pressable accessibilityLabel="Share this stay" onPress={() => Share.share({ message: SHARE_APP }).catch(() => {})} style={{ position: 'absolute', top: 10, right: 58, width: 40, height: 40, borderRadius: radius.pill, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="share" color={c.blue} size={20} />
        </Pressable>
        <Pressable accessibilityLabel={fav ? 'Remove favourite' : 'Add favourite'} onPress={onFav} style={{ position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: radius.pill, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="heart" color={fav ? c.red : c.blue} size={20} filled={fav} />
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
        {s.verifiedOwner && <Badge label="Verified owner" tone="blue" icon="shield" />}
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
  const router = useRouter();
  const owner = useOwner();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeCount = (filters.kind !== 'All' ? 1 : 0) + (filters.dist !== Infinity ? 1 : 0) + (filters.rating ? 1 : 0) + (filters.prices.length ? 1 : 0);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [onlyFavs, setOnlyFavs] = useState(false);
  const list = useMemo(() => stays.filter((s) => (filters.kind === 'All' || s.kind === filters.kind) && s.distanceKm <= filters.dist && s.rating >= filters.rating && (filters.prices.length === 0 || filters.prices.includes(tier(s.price))) && (!onlyFavs || favs.has(s.id)) && (s.name + s.town).toLowerCase().includes(q.toLowerCase())), [q, filters, favs, onlyFavs]);
  const toggle = (id: string) => setFavs((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 10 }}>
          <Icon name="search" color={c.blue} size={20} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search stays and cafes" placeholderTextColor={role.muted} style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 16, color: role.text }} />
        </View>
        <View>
          <IconButton name="filter" label="Filters" size={52} onPress={() => setFilterOpen(true)} badge={activeCount} />
        </View>
        <IconButton name="heart" label="Favourites" size={52} active={onlyFavs} onPress={() => setOnlyFavs((v) => !v)} />
      </View>
      <SampleNotice title="Sample stays">Real albergues, hotels and cafés from OpenStreetMap are coming soon. The places, prices and reviews below are examples that show how Stays will look.</SampleNotice>
      <PromoBanner promos={[
        { id: 'jubilee', eyebrow: 'Jubilee Year 2027', title: 'Holy Year beds in Santiago go fast', cta: 'Book early', icon: 'shell' },
        { id: 'owners', eyebrow: 'For business owners', title: 'Run an albergue or café on the Way?', cta: 'List your business', icon: 'briefcase', onPress: () => router.push('/business') },
        { id: 'stamp', eyebrow: 'Pilgrim tip', title: 'Stay where the stamp is: albergues with a sello', cta: 'See albergues', icon: 'stays', onPress: () => setFilters({ ...NO_FILTERS, kind: 'Albergue' }) },
      ]} />
      {list.map((s, i) => (
        <View key={s.id} style={{ gap: 16 }}>
          <StayCard s={s} fav={favs.has(s.id)} onFav={() => toggle(s.id)} />
          {i === 1 && owner.state === 'none' && !owner.feedCardHidden && (
            <BusinessFeedCard onPress={() => router.push('/business')} onDismiss={ownerStore.hideFeedCard} />
          )}
        </View>
      ))}
      {list.length === 0 && <AppText muted>Nothing matches. Try another search or reset the filters.</AppText>}
      <FilterSheet open={filterOpen} value={filters} onClose={() => setFilterOpen(false)} onApply={(f) => { setFilters(f); setFilterOpen(false); }} />
    </Screen>
  );
}
