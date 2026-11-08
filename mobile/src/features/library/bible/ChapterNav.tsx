import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { radius, role, shadowStyle } from '@/theme';
import { nextLabel, nextPlace, placeLabel, previousLabel, previousPlace, type Place } from './order';

/** What the buttons say when there is no chapter on that side: Genesis 1 has no chapter before it and Revelation 22 none after it. */
export const NO_PREVIOUS = 'Previous chapter: none, this is the first chapter of the Bible';
export const NO_NEXT = 'Next chapter: none, this is the last chapter of the Bible';

type Variant = 'top' | 'foot';

/**
 * One of the two buttons: "Previous" or "Next", named by where it goes. A screen reader hears the whole name ("Previous: Psalm 120", "Next: Tobit 1"); at the
 * top of the chapter the button is small and draws the destination alone beside its arrow, in JetBrains Mono ("‹ Psalm 120"); at the end of the chapter it has
 * the room to draw it all ("Previous: Psalm 120", the word in Inter and the chapter in JetBrains Mono). At the first and the last chapter of the Bible
 * the button is still there, dimmed and disabled, so that nothing moves. 48 high, never under 44.
 */
function Step({ side, place, variant, onGo }: { side: 'previous' | 'next'; place: Place; variant: Variant; onGo: (to: Place) => void }) {
  const to = side === 'previous' ? previousPlace(place) : nextPlace(place);
  const spoken = (side === 'previous' ? previousLabel(place) : nextLabel(place)) ?? (side === 'previous' ? NO_PREVIOUS : NO_NEXT);
  const word = side === 'previous' ? 'Previous' : 'Next';
  const colour = role.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled: !to }}
      disabled={!to}
      onPress={() => { if (to) onGo(to); }}
      style={({ pressed }) => ({
        minHeight: 48, flexGrow: 1, flexShrink: 0, flexBasis: variant === 'foot' ? '100%' : 'auto',
        flexDirection: 'row', alignItems: 'center', justifyContent: side === 'previous' ? 'flex-start' : 'flex-end', gap: 8, paddingHorizontal: 14,
        borderRadius: radius.pill, backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border, opacity: to ? 1 : 0.45, ...shadowStyle('sm'),
      })}
    >
      {side === 'previous' && <Icon name="back" color={role.action} size={20} />}
      {to && variant === 'top' && <AppText variant="mono" maxFontSizeMultiplier={1.3} numberOfLines={1} color={colour} style={{ fontSize: 14, lineHeight: 20 }}>{placeLabel(to)}</AppText>}
      {to && variant === 'foot' && (
        <AppText variant="label" maxFontSizeMultiplier={1.3} color={colour} style={{ fontSize: 15, lineHeight: 22, flexShrink: 1 }}>
          {word}: <AppText variant="mono" color={colour} style={{ fontSize: 15, lineHeight: 22 }}>{placeLabel(to)}</AppText>
        </AppText>
      )}
      {!to && <AppText variant="label" maxFontSizeMultiplier={1.3} color={colour} style={{ fontSize: 15, lineHeight: 22 }}>{word}</AppText>}
      {side === 'next' && <Icon name="chevron" color={role.action} size={20} />}
    </Pressable>
  );
}

/**
 * Previous and Next, across the books and the three parts (order.ts): from the last chapter of a book to the first of the next, Malachi 4 to Tobit 1, 2 Maccabees 15
 * to Matthew 1. At the top of the reader the two sit side by side when the names fit and one under the other when they do not (a wrapping row); at the end of the
 * chapter they are one under the other, full width. `onGo` says where the screen goes.
 */
export function ChapterNav({ place, variant, onGo }: { place: Place; variant: Variant; onGo: (to: Place) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Step side="previous" place={place} variant={variant} onGo={onGo} />
      <Step side="next" place={place} variant={variant} onGo={onGo} />
    </View>
  );
}
