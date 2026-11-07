import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { SampleNotice, SampleTag } from '@/components/SampleNotice';
import { Card } from '@/components/ui';
import { fixed, radius, role } from '@/theme';
import { LibraryTab, PREVIEW_NOTICE, SAMPLE_BOOKS, SAMPLE_PLAYLISTS, SAMPLE_SHELVES } from './sample';

// The three Library tabs. There is no real content yet (see sample.ts), so each tab starts with an honest notice and
// then shows, with example rows, where the content will go. Colours are read while drawing, never at import.

const Notice = ({ tab }: { tab: LibraryTab }) => <SampleNotice title="Preview">{PREVIEW_NOTICE[tab]}</SampleNotice>;

/** A small chip that says a row is not available yet. */
const Soon = () => (
  <View accessibilityLabel="Coming soon" style={{ paddingHorizontal: 10, height: 24, borderRadius: radius.pill, backgroundColor: role.sunken, justifyContent: 'center' }}>
    <AppText variant="mono" muted style={{ fontSize: 11, letterSpacing: 1 }}>SOON</AppText>
  </View>
);

export function BibleTab() {
  return (
    <View style={{ gap: 16 }}>
      <Notice tab="Bible" />
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="mono" muted style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 }}>Today&apos;s reading</AppText>
          <SampleTag />
        </View>
        <AppText variant="h4">One short reading for today</AppText>
        <AppText variant="small" muted>When the Bible is in the app, today&apos;s reading will be here, and it will work without a signal.</AppText>
      </Card>
      <Card style={{ padding: 4 }}>
        {SAMPLE_SHELVES.map((s, i) => (
          <View key={s.id} accessibilityState={{ disabled: true }} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: role.border }}>
            <Icon name="book" color={role.muted} size={24} />
            <View style={{ flex: 1 }}>
              <AppText variant="label">{s.title}</AppText>
              <AppText variant="caption" muted>{s.note}</AppText>
            </View>
            <Soon />
          </View>
        ))}
      </Card>
    </View>
  );
}

export function BooksTab() {
  return (
    <View style={{ gap: 16 }}>
      <Notice tab="Books" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {SAMPLE_BOOKS.map((b) => (
          <View key={b.id} accessibilityLabel={`${b.title}, sample cover`} style={{ flexBasis: '47%', flexGrow: 1, gap: 8 }}>
            {/* A cover is a pale picture colour that does not change with light/dark, so what is on it is the fixed navy. */}
            <View style={{ aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: fixed[b.colour], padding: 14, justifyContent: 'space-between' }}>
              <Icon name={b.icon} color={fixed.blue} size={28} />
              <AppText variant="h4" color={fixed.blue}>{b.title}</AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="caption" muted>{b.kind}</AppText>
              <SampleTag />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MusicTab() {
  return (
    <View style={{ gap: 16 }}>
      <Notice tab="Music" />
      <Card style={{ padding: 4 }}>
        {SAMPLE_PLAYLISTS.map((p, i) => (
          <View key={p.id} accessibilityState={{ disabled: true }} style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: role.border }}>
            <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: role.sunken, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="music" color={role.muted} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{p.title}</AppText>
              <AppText variant="caption" muted>{p.note}</AppText>
            </View>
            <Soon />
          </View>
        ))}
      </Card>
      <AppText variant="caption" muted>Songs will play only with a licence for them. Until we have one, nothing plays here.</AppText>
    </View>
  );
}
