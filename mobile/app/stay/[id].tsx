import { useState } from 'react';
import { ActivityIndicator, Pressable, Share, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { SampleNotice } from '@/components/SampleNotice';
import { BackButton } from '@/components/BackButton';
import { Card, IconButton, Photo, SectionLabel } from '@/components/ui';
import { Badge } from '@/features/business/ui';
import { OSM_COPYRIGHT_URL, OSM_CREDIT, amenityNames, kmIntoStageText, labelNames, mailtoUrl, offRouteText, openLink, osmObjectUrl, safeWebUrl, savedLine, telUrl, useStageStays, webLabel, type PlaceSource, type StayModel } from '@/features/places';
import { reviews, rooms, stays } from '@/data/mock';
import { icon, layout, radius, role, space } from '@/theme';
// Sample content is never shared outside the app: share the invitation instead of an invented place or caption.
const SHARE_APP = 'Walking the Camino? CaminoPlus has offline maps, stays and a pilgrim passport: https://camino.plus';

type Fav = { on: boolean; toggle: () => void };

function TopRow({ fav }: { fav: Fav }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <BackButton fallback="/stays" />
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <IconButton name="share" label="Share this stay" onPress={() => Share.share({ message: SHARE_APP }).catch(() => {})} />
        <IconButton name="heart" label={fav.on ? 'Remove favourite' : 'Add favourite'} active={fav.on} onPress={fav.toggle} />
      </View>
    </View>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: layout.screenMargin, paddingTop: space[3], paddingBottom: insets.bottom + space[3], backgroundColor: role.surface, borderTopWidth: 1, borderTopColor: role.border, flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
      {children}
    </View>
  );
}

/** One of the bundled sample stays: the page as it always was, labelled as a sample. */
function SampleStay({ s }: { s: (typeof stays)[number] }) {
  const [fav, setFav] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <Screen>
        <TopRow fav={{ on: fav, toggle: () => setFav((v) => !v) }} />
        <Photo tint={s.tint} height={260} style={{ borderRadius: radius.lg }} />
        <SampleNotice title="Sample stay">This place, its rooms, prices and reviews are examples. Real stays are coming soon.</SampleNotice>
        <AppText variant="h2">{s.name}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Icon name="star" color={role.highlight} size={icon.sm} />
          <AppText variant="label">{s.rating}</AppText>
          <AppText variant="small" muted>· {s.reviews} reviews · {s.town}</AppText>
        </View>
        <AppText variant="body" muted>A friendly pilgrim albergue on the Camino Francés. Communal dinner, laundry, and a quiet garden.</AppText>
        <SectionLabel>Beds and rooms</SectionLabel>
        {rooms.map((r) => (
          <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{r.name}</AppText>
              <AppText variant="caption" muted>{r.note}</AppText>
            </View>
            <AppText variant="h4">€{r.price}</AppText>
          </Card>
        ))}
        <SectionLabel>Reviews</SectionLabel>
        {reviews.map((v) => (
          <Card key={v.id} style={{ gap: space[1] }}>
            <AppText variant="label">{v.who} <AppText variant="mono" muted>{v.when}</AppText></AppText>
            <AppText variant="small">{v.text}</AppText>
          </Card>
        ))}
      </Screen>
      <BottomBar>
        <View style={{ flex: 1 }}>
          <AppText variant="h4">{s.price ? `€${s.price}` : 'Café'}</AppText>
          <AppText variant="caption" muted>{s.label}</AppText>
        </View>
        <View style={{ flex: 1 }}><Pill label="Contact opens soon" disabled /></View>
      </BottomBar>
    </View>
  );
}

/** One line of the details: a small heading and what OpenStreetMap says; a link when it can be opened. */
function Detail({ label, children, link }: { label: string; children: string; link?: string | null }) {
  const body = (
    <View style={{ gap: space[1] }}>
      <AppText variant="caption" muted>{label}</AppText>
      <AppText variant="body" color={link ? role.action : undefined} style={link ? { textDecorationLine: 'underline' } : undefined}>{children}</AppText>
    </View>
  );
  if (!link) return body;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${label}: ${children}`} onPress={() => { void openLink(link); }} style={{ minHeight: layout.touchHard, justifyContent: 'center' }}>
      {body}
    </Pressable>
  );
}

/** A real stay from the database. Nothing is invented: no price, no rating, no reviews, no rooms. */
function RealStay({ m, source, savedAt }: { m: StayModel; source: PlaceSource; savedAt: number | null }) {
  const [fav, setFav] = useState(false);
  const row = m.row;
  if (!row) return null;
  const phone = telUrl(row.phone);
  const mail = mailtoUrl(row.email);
  const web = safeWebUrl(row.website);
  // What is known about the place, and only that: a line is left out when its value is missing.
  const goodToKnow = [...labelNames(row.labels), ...(row.has_stamp ? ['Has a pilgrim stamp (sello)'] : [])];
  const onStage = [kmIntoStageText(row.km_from_stage_start), offRouteText(row.detour_m)].filter(Boolean);
  const facts: [string, string][] = [];
  if (row.address) facts.push(['Address', row.address]);
  if (row.opening_hours) facts.push(['Opening hours (from OpenStreetMap)', row.opening_hours]);
  if (row.beds != null) facts.push(['Beds', String(row.beds)]);
  if (row.amenities.length > 0) facts.push(['Amenities', amenityNames(row.amenities).join(', ')]);
  if (goodToKnow.length > 0) facts.push(['Good to know', goodToKnow.join(' · ')]);
  if (onStage.length > 0) facts.push(['On your stage', onStage.join(' · ')]);
  const cta = phone ? { label: 'Call', url: phone } : mail ? { label: 'Email', url: mail } : web ? { label: 'Website', url: web } : null;
  const osmPage = osmObjectUrl(row.osm_type, row.osm_id);
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <Screen>
        <TopRow fav={{ on: fav, toggle: () => setFav((v) => !v) }} />
        <Photo tint={m.tint} height={260} style={{ borderRadius: radius.lg }} />
        <AppText variant="h2">{m.name}</AppText>
        {m.verifiedOwner && <Badge label="Verified owner" tone="blue" icon="shield" />}
        <View style={{ gap: space[1] }}>
          <AppText variant="small" muted>{[m.kindLabel, m.town].filter(Boolean).join(' · ')}</AppText>
          <AppText variant="caption" muted>{m.sourceLine}</AppText>
          {source === 'cache' && <AppText variant="caption" muted>{savedLine(savedAt)}</AppText>}
        </View>
        {row.description && <AppText variant="body" muted>{row.description}</AppText>}
        <SectionLabel>Details</SectionLabel>
        {facts.length > 0 ? (
          <Card style={{ gap: space[4] }}>{facts.map(([label, text]) => <Detail key={label} label={label}>{text}</Detail>)}</Card>
        ) : (
          <AppText variant="small" muted>OpenStreetMap has no more details about this place yet.</AppText>
        )}
        <SectionLabel>Contact</SectionLabel>
        {row.phone || row.email || row.website ? (
          <Card style={{ gap: space[2] }}>
            {row.phone && <Detail label="Phone" link={phone}>{row.phone}</Detail>}
            {row.email && <Detail label="E-mail" link={mail}>{row.email}</Detail>}
            {row.website && <Detail label="Website" link={web}>{web ? webLabel(web) : row.website}</Detail>}
          </Card>
        ) : (
          <AppText variant="small" muted>No contact details are listed yet.</AppText>
        )}
        {row.source === 'osm' && (
          <View style={{ gap: space[1] }}>
            {osmPage && (
              <Pressable accessibilityRole="link" accessibilityLabel="See this place on OpenStreetMap" onPress={() => { void openLink(osmPage); }} style={{ minHeight: layout.touchHard, justifyContent: 'center' }}>
                <AppText variant="small" color={role.action}>See this place on OpenStreetMap, where anyone can correct it</AppText>
              </Pressable>
            )}
            <Pressable accessibilityRole="link" accessibilityLabel="OpenStreetMap copyright and licence" onPress={() => { void openLink(OSM_COPYRIGHT_URL); }} style={{ minHeight: layout.touchHard, justifyContent: 'center' }}>
              <AppText variant="caption" muted>{OSM_CREDIT}</AppText>
            </Pressable>
          </View>
        )}
      </Screen>
      <BottomBar>
        <View style={{ flex: 1 }}>
          <AppText variant="label" muted>{m.priceText}</AppText>
          <AppText variant="caption" muted>{m.chip ?? m.kindLabel}</AppText>
        </View>
        <View style={{ flex: 1 }}><Pill label={cta ? cta.label : 'No contact yet'} disabled={!cta} onPress={cta ? () => { void openLink(cta.url); } : undefined} /></View>
      </BottomBar>
    </View>
  );
}

export default function StayDetail() {
  const { id, stage } = useLocalSearchParams<{ id: string; stage?: string }>();
  const sample = stays.find((x) => x.id === id);
  // A real stay is read from the list of the stage it was opened from (the Stays tab passes it), which the app already has.
  const { rows, source, loading, savedAt } = useStageStays(sample ? null : stage);
  if (sample) return <SampleStay s={sample} />;
  const m = rows.find((r) => r.id === id && !r.sample);
  if (m) return <RealStay m={m} source={source} savedAt={savedAt} />;
  return (
    <Screen>
      <BackButton fallback="/stays" />
      {loading ? <ActivityIndicator accessibilityLabel="Loading the stay" color={role.action} style={{ marginTop: 24 }} /> : <AppText>Stay not found.</AppText>}
    </Screen>
  );
}
