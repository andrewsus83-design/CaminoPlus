import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card, Chip, IconButton, Photo } from '@/components/ui';
import { PromoBanner } from '@/components/PromoBanner';
import { Badge } from '@/features/business/ui';
import { BusinessFeedCard } from '@/features/business/BusinessCard';
import { ownerStore, useOwner } from '@/features/business/store';
import { Pill } from '@/components/Pill';
import { SampleNotice, SampleTag } from '@/components/SampleNotice';
import { OSM_COPYRIGHT_URL, OSM_CREDIT, openLink, sampleStaysNotice, savedLine, useMyStage, useStageStays, type StayModel } from '@/features/places';
import { fonts, layout, radius, role, scrim, space, textStyle } from '@/theme';
// Sample content is never shared outside the app: share the invitation instead of an invented place or caption.
const SHARE_APP = 'Walking the Camino? CaminoPlus has offline maps, stays and a pilgrim passport: https://camino.plus';

const KINDS = ['All', 'Albergue', 'Hotel', 'Café'] as const;
const DISTANCES = [{ l: 'Any', v: Infinity }, { l: 'Under 1 km', v: 1 }, { l: 'Under 5 km', v: 5 }] as const;
const REVIEWS = [{ l: 'Any', v: 0 }, { l: '4.0+', v: 4 }, { l: '4.5+', v: 4.5 }] as const;
const PRICES = ['$', '$$', '$$$'] as const;
type Filters = { kind: (typeof KINDS)[number]; dist: number; rating: number; prices: string[] };
const NO_FILTERS: Filters = { kind: 'All', dist: Infinity, rating: 0, prices: [] };
// Real stays come a page at a time: a stage can have a few hundred cafés and bars.
const PAGE = 40;

function FilterSheet({ open, value, distanceLabel, onClose, onApply }: { open: boolean; value: Filters; distanceLabel: string; onClose: () => void; onApply: (f: Filters) => void }) {
  const [f, setF] = useState(value);
  const [shown, setShown] = useState(open);
  if (open !== shown) { setShown(open); if (open) setF(value); }
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close filters" onPress={onClose} style={{ flex: 1, backgroundColor: scrim }} />
      <View style={{ backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: layout.screenMargin, paddingTop: layout.sheetPadding, paddingBottom: space[10], gap: space[5] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="h4">Filters</AppText>
          <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={12}><Icon name="close" color={role.text} size={28} /></Pressable>
        </View>
        <View style={{ gap: space[3] }}>
          <AppText variant="label">Type of stay</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{KINDS.map((k) => <Chip key={k} label={k} selected={f.kind === k} onPress={() => setF({ ...f, kind: k })} />)}</View>
        </View>
        <View style={{ gap: space[3] }}>
          <AppText variant="label">{distanceLabel}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{DISTANCES.map((d) => <Chip key={d.l} label={d.l} selected={f.dist === d.v} onPress={() => setF({ ...f, dist: d.v })} />)}</View>
        </View>
        <View style={{ gap: space[3] }}>
          <AppText variant="label">Review</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{REVIEWS.map((r) => <Chip key={r.l} label={r.l} selected={f.rating === r.v} onPress={() => setF({ ...f, rating: r.v })} />)}</View>
        </View>
        <View style={{ gap: space[3] }}>
          <AppText variant="label">Price</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{PRICES.map((p) => <Chip key={p} label={p} selected={f.prices.includes(p)} onPress={() => setF({ ...f, prices: f.prices.includes(p) ? f.prices.filter((x) => x !== p) : [...f.prices, p] })} />)}</View>
          <AppText variant="caption" muted>$ under €20 · $$ €20 to €50 · $$$ over €50</AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <View style={{ flex: 1 }}><Pill large variant="ghost" label="Reset" onPress={() => setF(NO_FILTERS)} /></View>
          <View style={{ flex: 1 }}><Pill large label="Show stays" onPress={() => onApply(f)} /></View>
        </View>
      </View>
    </Modal>
  );
}

function StayCard({ s, stageId, fav, onFav }: { s: StayModel; stageId: string | null; fav: boolean; onFav: () => void }) {
  const router = useRouter();
  // a real stay opens with the stage it was listed for (the stay page reads it from the same list); a sample opens as it always did
  return (
    <Card style={{ padding: space[3], gap: space[3] }} onPress={() => router.push(s.sample || !stageId ? `/stay/${s.id}` : `/stay/${s.id}?stage=${stageId}`)}>
      <View>
        <Photo tint={s.tint} height={170} />
        {s.sample && <View style={{ position: 'absolute', top: space[3], left: space[3] }}><SampleTag /></View>}
        <View style={{ position: 'absolute', top: space[3], right: space[3], flexDirection: 'row', gap: space[2] }}>
          <IconButton name="share" label="Share this stay" onPress={() => Share.share({ message: SHARE_APP }).catch(() => {})} />
          <IconButton name="heart" label={fav ? 'Remove favourite' : 'Add favourite'} active={fav} onPress={onFav} />
        </View>
      </View>
      <View style={{ paddingHorizontal: space[2], paddingBottom: space[2], gap: space[1] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="h4" style={{ flex: 1 }}>{s.name}</AppText>
          {s.rating != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
              <Icon name="star" color={role.highlight} size={18} />
              <AppText variant="label">{s.rating}</AppText>
            </View>
          )}
        </View>
        {s.verifiedOwner && <Badge label="Verified owner" tone="blue" icon="shield" />}
        <AppText variant="small" muted>{s.subtitle}</AppText>
        {s.sourceLine && <AppText variant="caption" muted>{s.sourceLine}</AppText>}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space[2] }}>
          <AppText variant="label" muted={!s.sample}>{s.priceText}</AppText>
          {s.chip && <Badge label={s.chip} tone="wash" />}
        </View>
      </View>
    </Card>
  );
}

export default function Stays() {
  const router = useRouter();
  const owner = useOwner();
  const stage = useMyStage();
  const { rows, source, loading: listLoading, offline, error, savedAt } = useStageStays(stage.stageId);
  const loading = stage.loading || listLoading;
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeCount = (filters.kind !== 'All' ? 1 : 0) + (filters.dist !== Infinity ? 1 : 0) + (filters.rating ? 1 : 0) + (filters.prices.length ? 1 : 0);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [onlyFavs, setOnlyFavs] = useState(false);
  const list = useMemo(() => rows.filter((s) => (filters.kind === 'All' || s.group === filters.kind) && (s.distanceKm == null || s.distanceKm <= filters.dist) && (s.rating ?? 0) >= filters.rating && (filters.prices.length === 0 || (s.priceTier != null && filters.prices.includes(s.priceTier))) && (!onlyFavs || favs.has(s.id)) && (s.name + (s.town ?? '')).toLowerCase().includes(q.toLowerCase())), [rows, q, filters, favs, onlyFavs]);
  const toggle = (id: string) => setFavs((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // a page at a time; a new search, filter or stage starts again at the first page
  const pageKey = [stage.stageId, source, q, filters.kind, filters.dist, filters.rating, filters.prices.join(), onlyFavs].join('|');
  const [paging, setPaging] = useState({ key: pageKey, shown: PAGE });
  const shown = paging.key === pageKey ? paging.shown : PAGE;
  const sample = source === 'sample';
  const credit = !sample && rows.some((s) => s.row?.source === 'osm');
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ flex: 1, minWidth: 0, height: 52, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], gap: space[2] }}>
          <Icon name="search" color={role.text} size={20} />
          {/* 15, not 17: at 17 the placeholder "Search stays and cafes" (187 px) no longer fits the field on a 390 phone; 15 (the caption size) keeps it whole */}
          <TextInput value={q} onChangeText={setQ} placeholder="Search stays and cafes" placeholderTextColor={role.muted} style={{ flex: 1, minWidth: 0, height: 48, paddingVertical: 0, fontFamily: fonts.body, fontSize: textStyle('caption').fontSize, color: role.text }} />
        </View>
        <View>
          <IconButton name="filter" label="Filters" size={52} onPress={() => setFilterOpen(true)} badge={activeCount} />
        </View>
        <IconButton name="heart" label="Favourites" size={52} active={onlyFavs} onPress={() => setOnlyFavs((v) => !v)} />
      </View>
      {loading && <ActivityIndicator accessibilityLabel="Looking for places on your stage" color={role.action} style={{ marginTop: space[6] }} />}
      {!loading && sample && <SampleNotice title="Sample stays">{sampleStaysNotice({ offline, error })}</SampleNotice>}
      {!loading && !sample && (
        <View style={{ gap: space[1] }}>
          <AppText variant="small" muted>{stage.stageName ? `Along your stage: ${stage.stageName}` : 'Along your stage'}</AppText>
          {source === 'cache' && <AppText variant="caption" muted>{savedLine(savedAt)}</AppText>}
        </View>
      )}
      <PromoBanner promos={[
        { id: 'jubilee', eyebrow: 'Jubilee Year 2027', title: 'Holy Year beds in Santiago go fast', cta: 'Book early', icon: 'shell' },
        { id: 'owners', eyebrow: 'For business owners', title: 'Run an albergue or café on the Way?', cta: 'List your business', icon: 'briefcase', onPress: () => router.push('/business') },
        { id: 'stamp', eyebrow: 'Pilgrim tip', title: 'Stay where the stamp is: albergues with a sello', cta: 'See albergues', icon: 'stays', onPress: () => setFilters({ ...NO_FILTERS, kind: 'Albergue' }) },
      ]} />
      {!loading && list.slice(0, shown).map((s, i) => (
        <View key={s.id} style={{ gap: space[4] }}>
          <StayCard s={s} stageId={stage.stageId} fav={favs.has(s.id)} onFav={() => toggle(s.id)} />
          {i === 1 && owner.state === 'none' && !owner.feedCardHidden && (
            <BusinessFeedCard onPress={() => router.push('/business')} onDismiss={ownerStore.hideFeedCard} />
          )}
        </View>
      ))}
      {!loading && list.length > shown && <Pill variant="ghost" label={`Show more places (${list.length - shown} more)`} onPress={() => setPaging({ key: pageKey, shown: shown + PAGE })} />}
      {!loading && list.length === 0 && <AppText muted>Nothing matches. Try another search or reset the filters.</AppText>}
      {credit && (
        <Pressable accessibilityRole="link" accessibilityLabel="OpenStreetMap copyright and licence" onPress={() => { void openLink(OSM_COPYRIGHT_URL); }} hitSlop={8} style={{ minHeight: 48, justifyContent: 'center' }}>
          <AppText variant="caption" muted>Place data {OSM_CREDIT}</AppText>
        </Pressable>
      )}
      <FilterSheet open={filterOpen} value={filters} distanceLabel={sample ? 'Distance' : 'Distance from the Camino'} onClose={() => setFilterOpen(false)} onApply={(f) => { setFilters(f); setFilterOpen(false); }} />
    </Screen>
  );
}
