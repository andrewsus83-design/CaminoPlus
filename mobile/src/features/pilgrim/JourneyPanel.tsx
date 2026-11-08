import { ActivityIndicator, View } from 'react-native';
import { AppText } from '@/components/AppText';
import type { Post, PostMediaUrl } from '@/lib/api';
import { JourneyGrid, type JourneyOwner } from '@/features/me/JourneyGrid';
import { EmptyState, ErrorState } from '@/features/social/components/states';
import { role, space } from '@/theme';
import { type PilgrimView, noJourneys, pilgrimName, privateWords } from './logic';

type Ready = Extract<PilgrimView<Post>, { status: 'ready' }>;

/**
 * The Journey of another pilgrim, under their card: the posts this viewer may see, in the grid and the full-screen viewer that Me has (the love, bookmark,
 * comments and share of the action rail), without the card that writes a post, which only your own journey has. Or why there is none to show: a private
 * profile, a journey that is loading or did not load, a pilgrim who has shared nothing with this viewer yet.
 */
export function JourneyPanel({ view, media, onRetry, onOpenPilgrim }: {
  view: Ready; media: Record<string, PostMediaUrl[]>; onRetry: () => void; onOpenPilgrim: (id: string) => void;
}) {
  const name = pilgrimName(view.pilgrim);
  const owner: JourneyOwner = { id: view.pilgrim.id, name, username: view.pilgrim.username, avatarUrl: view.pilgrim.avatar_url };
  if (view.minimal) {
    const w = privateWords(name);
    return <EmptyState icon="shield" title={w.title} text={w.text} />;
  }
  const j = view.journeys;
  let body;
  if (j.status === 'loading') {
    body = <ActivityIndicator accessibilityLabel="Loading the journey" color={role.action} style={{ marginTop: space[6] }} />;
  } else if (j.status === 'error') {
    body = <ErrorState title={j.error.offline ? 'You are offline' : 'The journey did not load'} text={j.error.message} onRetry={onRetry} />;
  } else if (j.posts.length === 0) {
    const w = noJourneys(view.relation, name);
    body = <EmptyState icon="steps" title={w.title} text={w.text} />;
  } else {
    body = <JourneyGrid posts={j.posts} media={media} owner={owner} onOpenPilgrim={onOpenPilgrim} />;
  }
  return (
    <View style={{ gap: space[3] }}>
      <AppText variant="h4" accessibilityRole="header">Journey</AppText>
      {body}
    </View>
  );
}
