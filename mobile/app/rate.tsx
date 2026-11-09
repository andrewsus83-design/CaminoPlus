import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { BackButton } from '@/components/BackButton';
import { Card } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { isOfflineError } from '@/lib/net';
import { FEEDBACK_MAX, RATING_WORDS, feedbackProblem, sendFeedback } from '@/lib/support';
import { c, layout, radius, role, space, textStyle } from '@/theme';

// Settings > Support > Rate CaminoPlus. One to five shells-as-stars and an optional note.
export default function Rate() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stars, setStars] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const problem = feedbackProblem('rating', text, stars);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await sendFeedback('rating', text, stars);
      setSent(true);
    } catch (e) {
      setError(isOfflineError(e)
        ? 'You are offline. Connect to Wi-Fi or mobile data and send again.'
        : 'We could not send your rating. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: role.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + space[10], gap: layout.stackGap }}>
        <BackButton />
        <View style={{ gap: space[2] }}>
          <AppText variant="h2">Rate CaminoPlus</AppText>
          <AppText variant="lead" muted>How is the app working for you on the Way?</AppText>
        </View>

        {sent ? (
          <Card style={{ gap: space[3], backgroundColor: c.goldWash }}>
            <AppText variant="label">Thank you!</AppText>
            <AppText variant="small">Your {stars}-star rating was saved. If you enjoy CaminoPlus, telling a fellow pilgrim helps most. Buen Camino!</AppText>
            <Pill large label="Done" onPress={() => router.back()} />
          </Card>
        ) : (
          <>
            <Card style={{ alignItems: 'center', gap: space[3], paddingVertical: space[6] }}>
              {/* Five stars, each a 48 by 48 button around a 32 px star (the largest icon size): 5 x 48 + 4 x 4 is 256, which a 320 phone holds inside the card's padding. */}
              <View style={{ flexDirection: 'row', gap: space[1] }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} ${n === 1 ? 'star' : 'stars'}`} accessibilityState={{ selected: stars === n }} onPress={() => { setStars(n); setError(null); }} style={{ padding: space[2] }}>
                    <Icon name="star" size={32} color={stars && n <= stars ? role.highlight : role.placeholder} filled={!!stars && n <= stars} />
                  </Pressable>
                ))}
              </View>
              <AppText variant="label" muted>{stars ? RATING_WORDS[stars] : 'Tap a star'}</AppText>
            </Card>
            <View style={{ gap: space[2] }}>
              <AppText variant="label">Anything to add? (optional)</AppText>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                maxLength={FEEDBACK_MAX}
                textAlignVertical="top"
                placeholder="What did you like or miss?"
                placeholderTextColor={role.muted}
                accessibilityLabel="Anything to add"
                style={{ minHeight: 120, ...textStyle('body'), color: role.text, backgroundColor: role.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: role.border, padding: space[4] }}
              />
            </View>
            {!!error && <FormMessage>{error}</FormMessage>}
            <Pill large label="Send my rating" onPress={send} loading={busy} disabled={!stars} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
