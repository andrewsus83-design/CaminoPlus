import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Fab } from '@/components/Fab';
import { PromoBanner } from '@/components/PromoBanner';
import { SubTabs } from '@/components/ui';
import { DiaryCard } from '@/features/diary/DiaryCard';
import { BibleTab, BooksTab, MusicTab } from '@/features/library/LibraryTabs';
import { LIBRARY_TABS, LibraryTab } from '@/features/library/sample';

// Library: a banner, your private diary, then three tabs: Bible, Books, Music. The gold pen writes a diary page.
// The tabs hold example content until we have chosen what we may include (see features/library/sample.ts); each tab
// says so. The diary is real: it is written and kept on this phone (features/diary).
export default function Library() {
  const router = useRouter();
  const [tab, setTab] = useState<LibraryTab>('Bible');
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <AppText variant="h2" accessibilityRole="header">Library</AppText>
        <PromoBanner promos={[
          { id: 'bible', eyebrow: 'Preview · Bible', title: 'Scripture for the long road', cta: 'See the Bible tab', icon: 'book', onPress: () => setTab('Bible') },
          { id: 'books', eyebrow: 'Preview · Books', title: 'Guides and stories from the Way', cta: 'See the Books tab', icon: 'library', onPress: () => setTab('Books') },
          { id: 'music', eyebrow: 'Preview · Music', title: 'Songs for the walk', cta: 'See the Music tab', icon: 'music', onPress: () => setTab('Music') },
        ]} />
        <DiaryCard />
        <SubTabs tabs={LIBRARY_TABS} value={tab} onChange={setTab} />
        {tab === 'Bible' && <BibleTab />}
        {tab === 'Books' && <BooksTab />}
        {tab === 'Music' && <MusicTab />}
      </Screen>
      <Fab label="Write in your diary" icon="compose" onPress={() => router.push('/diary/new')} />
    </View>
  );
}
