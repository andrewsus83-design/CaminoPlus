import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { SampleNotice } from '@/components/SampleNotice';
import { BackButton } from '@/components/BackButton';
import { Avatar, Card, IconButton, SectionLabel } from '@/components/ui';
import { Badge } from '@/features/business/ui';
import { Availability, myListing, statusCopy } from '@/data/business';
import { c, fonts, radius, role, space, textStyle } from '@/theme';

const AVAIL: { id: Availability; label: string }[] = [
  { id: 'available', label: 'Beds free' },
  { id: 'few_left', label: 'Few left' },
  { id: 'full', label: 'Full' },
];

function Stat({ value, label, delta }: { value: string; label: string; delta?: number }) {
  return (
    <Card style={{ flex: 1, padding: space[3], gap: space[1] }}>
      <AppText variant="h3">{value}</AppText>
      <AppText variant="caption" muted>{label}</AppText>
      {delta !== undefined && <AppText variant="caption" color={c.success}>+{delta}%</AppText>}
    </Card>
  );
}

// Owner home (extranet): status, tonight's beds, stats, reviews, premium hook.
export default function BusinessDashboard() {
  const router = useRouter();
  const l = myListing;
  const st = statusCopy[l.status];
  const [avail, setAvail] = useState<Availability>('available');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <BackButton fallback="/settings" />
        <View style={{ marginLeft: 'auto' }}><Badge label={st.label} tone={st.tone} /></View>
        <IconButton name="pen" label="Edit listing" onPress={() => router.push('/business/register')} />
      </View>
      <SampleNotice title="Sample dashboard">This is what owners will see once listings are live. The place, numbers, reviews and beds below are examples.</SampleNotice>
      <AppText variant="h2">{l.name}</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <AppText variant="small" muted>{l.town} · {l.beds} beds</AppText>
        <Badge label="Verified owner" tone="blue" icon="shield" />
      </View>

      <SectionLabel>Tonight</SectionLabel>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {AVAIL.map((a) => {
          const on = avail === a.id;
          const bg = on ? (a.id === 'full' ? role.danger : a.id === 'few_left' ? role.highlight : c.success) : role.sunken;
          return (
            <Pressable key={a.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setAvail(a.id)}
              style={{ flex: 1, height: 56, borderRadius: radius.pill, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="label" color={on && a.id !== 'few_left' ? role.onDanger : role.text}>{a.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText variant="caption" muted>Pilgrims see this on the map and in Stays, updated now.</AppText>

      <SectionLabel>Last 30 days</SectionLabel>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <Stat value="1.8k" label="Views" delta={l.stats.viewsDelta} />
        <Stat value={String(l.stats.saves)} label="Saves" delta={l.stats.savesDelta} />
        <Stat value={String(l.stats.contactTaps)} label="Contact taps" />
      </View>

      <SectionLabel>Reviews</SectionLabel>
      {l.reviews.map((r) => {
        const reply = replies[r.id] ?? r.reply;
        return (
          <Card key={r.id} style={{ gap: space[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <Avatar size={36} />
              <AppText variant="label" style={{ flex: 1 }}>{r.who}</AppText>
              <Icon name="star" color={role.highlight} size={18} />
              <AppText variant="caption" muted>{r.stars} · {r.when}</AppText>
            </View>
            <AppText variant="body">{r.text}</AppText>
            {reply ? (
              <View style={{ backgroundColor: role.bg, borderRadius: radius.md, padding: space[3] }}>
                <AppText variant="caption" muted>Your reply</AppText>
                <AppText variant="small">{reply}</AppText>
              </View>
            ) : draft?.id === r.id ? (
              <View style={{ gap: space[2] }}>
                <TextInput value={draft.text} onChangeText={(t) => setDraft({ id: r.id, text: t })} placeholder="Write a friendly reply" placeholderTextColor={role.muted} multiline
                  style={{ minHeight: 80, borderRadius: radius.md, borderWidth: 1.5, borderColor: role.border, padding: space[3], fontFamily: fonts.body, fontSize: textStyle('small').fontSize, color: role.text }} />
                <Pill label="Post reply" onPress={() => { if (draft.text.trim()) { setReplies((p) => ({ ...p, [r.id]: draft.text.trim() })); setDraft(null); } }} />
              </View>
            ) : (
              <Pill variant="ghost" label="Reply as owner" onPress={() => setDraft({ id: r.id, text: '' })} />
            )}
          </Card>
        );
      })}

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: c.goldWash }}>
        <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: role.highlight, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="star" color={role.onHighlight} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="label">Boost your listing</AppText>
          <AppText variant="caption" muted>Featured spot in Stays · coming soon</AppText>
        </View>
        <Badge label="Soon" tone="gold" />
      </Card>
    </Screen>
  );
}
