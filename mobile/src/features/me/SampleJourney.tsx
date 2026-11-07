import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { SAMPLE_BANNER } from '@/lib/sampleJourney';
import { c, radius, role } from '@/theme';
import { JourneyGrid } from './JourneyGrid';
import { SAMPLE } from './sampleJourneyAssets';

/**
 * The Journey tab while a pilgrim has no posts yet: the same grid and viewer their own posts will use, filled with the
 * bundled AI-generated sample. It is always labelled (the banner here, and a label inside the full-screen viewer), and
 * it disappears as soon as there is a real post.
 */
export function SampleJourney() {
  return (
    <>
      <View accessibilityLabel="Sample journey" style={{ alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: c.sand200 }}>
        <AppText variant="caption" color={role.text} style={{ textAlign: 'center' }}>{SAMPLE_BANNER}</AppText>
      </View>
      <JourneyGrid posts={SAMPLE.posts} sample={SAMPLE.media} />
    </>
  );
}
