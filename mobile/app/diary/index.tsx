import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, IconButton } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { confirmDelete } from '@/features/diary/confirm';
import { PRIVACY_LINE, dateLine, dateWithDraft, mediaUsageLine, metaLine, pagePreview, pageTitle, pagesLabel } from '@/features/diary/present';
import { isDraft, type DiaryEntry } from '@/features/diary/store';
import { useDiary } from '@/features/diary/useDiary';
import { radius, role } from '@/theme';

// Me > Notes > My diary: the pages, newest first. They live only on this phone (src/features/diary/store.ts) and the screen says so.
export default function DiaryList() {
  const router = useRouter();
  const { ready, entries, remove } = useDiary();
  const [deleteFailed, setDeleteFailed] = useState(false);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/me'));
  const write = () => router.push('/diary/new');
  const ask = (e: DiaryEntry) => confirmDelete(pageTitle(e), async () => setDeleteFailed(!(await remove(e.id))), metaLine(e) !== '');
  const usage = mediaUsageLine(entries);

  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={goBack} />
      <View style={{ gap: 8 }}>
        <AppText variant="h2" accessibilityRole="header">My diary</AppText>
        {entries.length > 0 && <AppText variant="label" muted>{pagesLabel(entries.length)}</AppText>}
        {usage !== '' && <AppText variant="caption" muted>{usage}</AppText>}
        <AppText variant="small" muted>{PRIVACY_LINE}</AppText>
      </View>

      {deleteFailed && <FormMessage>That page could not be deleted. Please try again.</FormMessage>}

      {ready && entries.length === 0 && (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: role.highlight, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="compose" color={role.onHighlight} size={30} />
          </View>
          <AppText variant="h4" style={{ textAlign: 'center' }}>No pages yet</AppText>
          <AppText variant="small" muted style={{ textAlign: 'center' }}>Write a few lines about your day on the Way: what you saw, who you met, how you feel.</AppText>
          <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <Pill large label="Write a new page" onPress={write} />
          </View>
        </Card>
      )}

      {entries.length > 0 && (
        <>
          <Pill large label="Write a new page" onPress={write} />
          <View style={{ gap: 12 }}>
            {entries.map((e) => {
              const name = pageTitle(e);
              const preview = pagePreview(e);
              const draft = isDraft(e);
              const date = dateWithDraft(dateLine(e.createdAt), draft);
              const attached = metaLine(e);
              return (
                <Card key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={attached ? `${name}. ${date}. ${attached}` : `${name}. ${date}`}
                    accessibilityHint="Opens this page"
                    onPress={() => router.push(`/diary/${e.id}`)}
                    style={({ pressed }) => ({ flex: 1, gap: 4, minHeight: 56, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
                  >
                    <AppText variant="label" numberOfLines={1}>{name}</AppText>
                    {!!preview && <AppText variant="small" muted numberOfLines={2}>{preview}</AppText>}
                    {attached !== '' && <AppText variant="caption" color={role.accentText} numberOfLines={1}>{attached}</AppText>}
                    <AppText variant="caption" muted>{date}</AppText>
                  </Pressable>
                  <IconButton flat name="trash" label={`Delete page: ${name}`} onPress={() => ask(e)} />
                </Card>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}
