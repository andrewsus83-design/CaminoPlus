import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { IconButton } from '@/components/ui';

/**
 * A book or a chapter that is not in the app: a link, a bookmark or a note from an earlier version of it. Friendly, and a way out. Never an error:
 * what the pilgrim wrote or kept about it is still on the phone.
 */
export function NotHere({ title, line, goBack }: { title: string; line: string; goBack: () => void }) {
  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={goBack} />
      <View style={{ gap: 8 }}>
        <AppText variant="h2" accessibilityRole="header">{title}</AppText>
        <AppText variant="lead" muted>{line}</AppText>
      </View>
      <Pill large label="Back" onPress={goBack} />
    </Screen>
  );
}
