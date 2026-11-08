import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { radius, role, shadowStyle } from '@/theme';
import { CONTINUE_TITLE, continueLabel } from './lastRead';
import { placeLabel, type Place } from './order';

/**
 * The card on the Bible tab that takes a pilgrim back to the chapter read last: "Continue reading" over the chapter ("Psalm 121"), a book glyph and a
 * chevron. Shown only when something was read (the screen gives a place, never a made-up one). ONE button for a screen reader ("Continue reading,
 * Psalm 121"). The chapter is a reference, so it is in JetBrains Mono; the words over it are Inter. 64 high at the least, the width of the page.
 */
export function ContinueCard({ place, onOpen }: { place: Place; onOpen: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={continueLabel(place)}
      accessibilityHint="Opens the chapter where you stopped"
      onPress={onOpen}
      style={({ pressed }) => ({
        minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingLeft: 16, paddingRight: 12, borderRadius: radius.lg,
        backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border, ...shadowStyle('sm'),
      })}
    >
      <View aria-hidden style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: role.sunken, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="book" color={role.action} size={22} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="label" muted maxFontSizeMultiplier={1.3} style={{ fontSize: 14, lineHeight: 18 }}>{CONTINUE_TITLE}</AppText>
        <AppText variant="mono" maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontSize: 17, lineHeight: 24 }}>{placeLabel(place)}</AppText>
      </View>
      <Icon name="chevron" color={role.muted} size={22} />
    </Pressable>
  );
}
