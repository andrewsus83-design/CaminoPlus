import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { assertOnline } from './net';

// Settings > Support: feedback, rating and help all go through here. Messages land in public.app_feedback
// (migration 20261108000000_app_feedback.sql); the team reads them with the service role.
export const SUPPORT_EMAIL = 'hello@camino.plus';
export const FEEDBACK_MAX = 2000;
export const FEEDBACK_MIN = 3;

export type FeedbackKind = 'feedback' | 'idea' | 'problem' | 'rating';

export const KIND_LABEL: Record<Exclude<FeedbackKind, 'rating'>, string> = {
  feedback: 'Feedback',
  idea: 'An idea',
  problem: 'A problem',
};

export const RATING_WORDS = ['', 'Not good', 'Could be better', 'It is okay', 'Good', 'Great, Buen Camino!'] as const;

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

/** Why a message cannot be sent yet, or null. Kept pure so it is easy to test. */
export function feedbackProblem(kind: FeedbackKind, message: string, rating: number | null): string | null {
  const text = message.trim();
  if (kind === 'rating') {
    if (!rating || rating < 1 || rating > 5) return 'Tap a star to rate CaminoPlus.';
    return text.length > FEEDBACK_MAX ? `Please keep it under ${FEEDBACK_MAX} characters.` : null;
  }
  if (text.length < FEEDBACK_MIN) return 'Please write a few words so we understand.';
  if (text.length > FEEDBACK_MAX) return `Please keep it under ${FEEDBACK_MAX} characters.`;
  return null;
}

export async function sendFeedback(kind: FeedbackKind, message: string, rating: number | null = null): Promise<void> {
  const problem = feedbackProblem(kind, message, rating);
  if (problem) throw new Error(problem);
  await assertOnline();
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
  const { error } = await supabase.from('app_feedback').insert({
    kind,
    rating: kind === 'rating' ? rating : null,
    message: message.trim(),
    app_version: appVersion(),
    platform,
  });
  if (error) throw new Error(error.message);
}

/** Opens the phone's mail app with the version and platform filled in, for people who prefer email. */
export function mailSupport(subject: string): Promise<void> {
  const body = `\n\n---\nCaminoPlus ${appVersion()} · ${Platform.OS} ${String(Platform.Version)}`;
  return Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
}
