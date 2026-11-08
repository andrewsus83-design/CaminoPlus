import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { BackButton } from '@/components/BackButton';
import { Card, Chip } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { isOfflineError } from '@/lib/net';
import { FEEDBACK_MAX, KIND_LABEL, FeedbackKind, feedbackProblem, mailSupport, sendFeedback } from '@/lib/support';
import { c, layout, radius, role, space, textStyle } from '@/theme';

// Settings > Support > Send feedback. Goes to the team through public.app_feedback.
const KINDS = ['feedback', 'idea', 'problem'] as const;
type Kind = (typeof KINDS)[number];

export default function Feedback() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<Kind>('feedback');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const problem = feedbackProblem(kind as FeedbackKind, text, null);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await sendFeedback(kind, text);
      setSent(true);
    } catch (e) {
      setError(isOfflineError(e)
        ? 'You are offline. Your words are still here: connect to Wi-Fi or mobile data and send again.'
        : 'We could not send this. Please try again, or write to us by email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: role.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + space[10], gap: layout.stackGap }}>
        <BackButton />
        <View style={{ gap: space[2] }}>
          <AppText variant="h2">Send feedback</AppText>
          <AppText variant="lead" muted>Tell us what works, what does not, or what you wish the app did on the Way. A person on the team reads every message.</AppText>
        </View>

        {sent ? (
          <Card style={{ gap: space[3], backgroundColor: c.goldWash }}>
            <AppText variant="label">Thank you, pilgrim</AppText>
            <AppText variant="small">Your message reached the team. We cannot answer every one, but each one helps us make the map and the app better.</AppText>
            <Pill large label="Done" onPress={() => router.back()} />
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {KINDS.map((k) => <Chip key={k} label={KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />)}
            </View>
            <View style={{ gap: space[2] }}>
              <AppText variant="label">{kind === 'problem' ? 'What went wrong?' : kind === 'idea' ? 'What is your idea?' : 'Your message'}</AppText>
              <TextInput
                value={text}
                onChangeText={(t) => { setText(t); if (error) setError(null); }}
                multiline
                maxLength={FEEDBACK_MAX}
                textAlignVertical="top"
                placeholder={kind === 'problem' ? 'For example: the map is blank on stage 5' : 'Write here'}
                placeholderTextColor={role.muted}
                accessibilityLabel="Your message"
                style={{ minHeight: 180, ...textStyle('body'), color: role.text, backgroundColor: role.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: role.border, padding: space[4] }}
              />
              <AppText variant="caption" muted style={{ textAlign: 'right' }}>{text.length} / {FEEDBACK_MAX}</AppText>
            </View>
            {!!error && <FormMessage>{error}</FormMessage>}
            <View style={{ gap: space[3] }}>
              <Pill large label="Send" onPress={send} loading={busy} disabled={text.trim().length === 0} />
              <Pill large variant="ghost" label="Write by email instead" onPress={() => { void mailSupport(`CaminoPlus ${KIND_LABEL[kind].toLowerCase()}`).catch(() => setError('No mail app found. You can write to hello@camino.plus.')); }} disabled={busy} />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
