import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card, IconButton } from '@/components/ui';
import { c, layout, role } from '@/theme';

// Credits and licences for the data and software CaminoPlus is built on. Several of these licences
// (OpenStreetMap ODbL, OpenMapTiles CC BY, Wikipedia CC BY-SA, SIL OFL fonts) require this notice.
// The same list is published at https://camino.plus/licences.
type Item = { name: string; what: string; licence: string; url: string };

const DATA: Item[] = [
  { name: 'OpenStreetMap', what: 'Map data and the places in the app: routes, towns, water, churches, albergues, cafés', licence: 'ODbL 1.0, © OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
  { name: 'OpenMapTiles', what: 'Vector tile schema behind the offline maps', licence: 'CC BY 4.0, © OpenMapTiles', url: 'https://openmaptiles.org/' },
  { name: 'Natural Earth', what: 'Low-zoom world map data', licence: 'Public domain', url: 'https://www.naturalearthdata.com/about/terms-of-use/' },
  { name: 'OpenFreeMap and MapTiler', what: 'Online base map tiles (only while you are online)', licence: 'Their terms; data © OpenStreetMap contributors', url: 'https://openfreemap.org/' },
  { name: 'Overture Maps, Wikidata, Wikipedia, Wikimedia Commons', what: 'Cross-checking places and descriptions', licence: 'CDLA-Permissive 2.0, CC0, CC BY-SA, and per-file Commons licences', url: 'https://camino.plus/licences' },
  { name: 'AI-generated sample pictures and clips', what: 'The sample journey shown before you have posts of your own', licence: 'Made by CaminoPlus with Google Nano Banana 2 and Veo 3.1 through OpenArt. AI-generated, not photographs of real places or people', url: 'https://openart.ai/' },
];

const SOFTWARE: Item[] = [
  { name: 'Noto Sans', what: 'Map label glyphs, bundled so labels work offline', licence: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org/' },
  { name: 'Fraunces, Inter, JetBrains Mono, Caveat', what: 'App fonts', licence: 'SIL Open Font License 1.1', url: 'https://fonts.google.com/' },
  { name: 'MapLibre Native', what: 'The map engine', licence: 'BSD 2-Clause', url: 'https://maplibre.org/' },
  { name: 'Expo, React Native, React, Supabase', what: 'App framework and backend client', licence: 'MIT', url: 'https://github.com/expo/expo/blob/main/LICENSE' },
];

function Group({ title, items }: { title: string; items: Item[] }) {
  return (
    <View style={{ gap: 10 }}>
      <AppText variant="label" color={role.accentText}>{title}</AppText>
      {items.map((i) => (
        <Pressable key={i.name} accessibilityRole="link" accessibilityLabel={`${i.name}: open licence details`} onPress={() => { void WebBrowser.openBrowserAsync(i.url); }}>
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppText variant="label" style={{ flex: 1 }}>{i.name}</AppText>
              <Icon name="chevron" color={c.blue} size={18} />
            </View>
            <AppText variant="small" muted>{i.what}</AppText>
            <AppText variant="caption" color={role.accentText}>{i.licence}</AppText>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

export default function Licences() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 40, gap: 20 }}>
        <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ gap: 8 }}>
          <AppText variant="h2">Licences and credits</AppText>
          <AppText variant="lead" muted>CaminoPlus stands on the shoulders of many open projects. Thank you to everyone who maps the Way.</AppText>
        </View>
        <Group title="MAPS AND DATA" items={DATA} />
        <Group title="FONTS AND SOFTWARE" items={SOFTWARE} />
        <AppText variant="caption" muted>Map data and places © OpenStreetMap contributors · © OpenMapTiles. Packs are rebuilt every month from fresh OpenStreetMap data. Places from OpenStreetMap are shown as they are, with where they came from and how far they were checked.</AppText>
      </ScrollView>
    </View>
  );
}
