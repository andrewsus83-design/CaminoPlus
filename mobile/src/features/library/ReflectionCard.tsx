import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { Card } from '@/components/ui';
import { snippet, spansText, type Span } from './books';
import { c, role } from '@/theme';
import type { Note } from '@/features/notes/notes';

export const REFLECTION_LABEL = 'Reflection';
export const WRITE_REFLECTION = 'Write your reflection';
export const WROTE_REFLECTION = 'You wrote a reflection';
export const OPEN_REFLECTION = 'Open your reflection';

/**
 * The end of a day of a reflection book: its questions as the prompt, with the button that opens the sheet to answer them; or, once the
 * pilgrim has written a reflection, a line that says so with its first words and the button to open it (to read it, change it, or grow it into a
 * Diary page). The answer is a note of its own kind on the day (notes.ts), private and only on this phone, like every note.
 */
export function ReflectionCard({ questions, reflection, onOpen }: { questions: readonly Span[][]; reflection: Note | null; onOpen: () => void }) {
  return (
    <Card style={{ gap: 14, borderLeftWidth: 4, borderLeftColor: c.gold }}>
      <AppText variant="mono" muted style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 }}>{REFLECTION_LABEL}</AppText>
      {questions.length > 0 && (
        <View style={{ gap: 10 }}>
          {questions.map((q, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
              <AppText color={role.accentText} importantForAccessibility="no" accessibilityElementsHidden style={{ width: 14, textAlign: 'center' }}>•</AppText>
              <AppText style={{ flex: 1 }}>{spansText(q)}</AppText>
            </View>
          ))}
        </View>
      )}
      {reflection ? (
        <>
          <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
            <AppText variant="label">{WROTE_REFLECTION}</AppText>
            <AppText variant="small" muted numberOfLines={2}>{snippet(reflection.text.replace(/\s+/g, ' '), 140)}</AppText>
          </View>
          <Pill variant="ghost" label={OPEN_REFLECTION} onPress={onOpen} />
        </>
      ) : (
        <Pill label={WRITE_REFLECTION} onPress={onOpen} />
      )}
    </Card>
  );
}
