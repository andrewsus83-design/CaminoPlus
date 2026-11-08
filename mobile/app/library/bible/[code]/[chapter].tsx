import { useLocalSearchParams } from 'expo-router';
import { placeFromParams } from '@/features/library/bible/order';
import { MISSING_CHAPTER, PlaceMissing } from '@/features/library/bible/PlaceMissing';
import { Reader } from '@/features/library/bible/Reader';

// Library > Bible > a book > a chapter: the words. The address is /library/bible/<code>/<chapter>, with ?v=<verse> to open at a verse
// (/library/bible/PSA/121?v=3 is Psalm 121:3), so a link, a search result, a bookmark and the card "Continue reading" all lead here the same way, and it
// works as a first screen (Back then goes to the chapters of the book). An address that names no chapter (a book that does not exist, a chapter past the last
// one) is a calm "not found" with a way back, never a crash. The reader is features/library/bible/Reader.tsx; it keys on the chapter, so Previous and Next,
// which replace this screen, start the next chapter at its top with nothing chosen.
export default function BibleChapter() {
  const { code, chapter, v } = useLocalSearchParams<{ code?: string; chapter?: string; v?: string }>();
  const at = placeFromParams(code, chapter, v);
  if (!at) return <PlaceMissing message={MISSING_CHAPTER} code={typeof code === 'string' ? code : undefined} />;
  return <Reader key={`${at.place.code}.${at.place.chapter}`} place={at.place} verse={at.verse} />;
}
