import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/ui';
import { radius, role } from '@/theme';
import { EMPTY_CARD_LINE, dateLine, pageTitle, pagesLabel } from './present';
import { useDiary } from './useDiary';

/**
 * The diary on the Library screen: how many pages, the latest one, and a tap opens the list. It reads the diary again every
 * time the screen comes back into view, so a page written a moment ago shows after Back. Until the first read the card shows
 * only its name (never "empty" to someone who has pages); a diary that cannot be read looks like an empty one.
 */
export function DiaryCard() {
  const router = useRouter();
  const { ready, entries } = useDiary();
  const latest = entries[0];
  const label = !ready ? 'My diary' : latest ? `My diary, ${pagesLabel(entries.length)}. Latest: ${pageTitle(latest)}, ${dateLine(latest.createdAt)}` : `My diary. ${EMPTY_CARD_LINE}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens your diary" onPress={() => router.push('/diary')} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56 }}>
        <View style={{ width: 52, height: 52, borderRadius: radius.pill, backgroundColor: role.highlight, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="compose" color={role.onHighlight} size={26} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="h4">My diary</AppText>
          {ready && (latest ? (
            <>
              <AppText variant="small" muted>{pagesLabel(entries.length)}</AppText>
              <AppText variant="label" numberOfLines={1} style={{ marginTop: 6 }}>{pageTitle(latest)}</AppText>
              <AppText variant="caption" muted>{dateLine(latest.createdAt)}</AppText>
            </>
          ) : (
            <AppText variant="small" muted>{EMPTY_CARD_LINE}</AppText>
          ))}
        </View>
        <Icon name="chevron" color={role.muted} size={22} />
      </Card>
    </Pressable>
  );
}
