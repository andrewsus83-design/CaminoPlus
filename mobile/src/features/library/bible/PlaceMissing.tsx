import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { BackButton } from '@/components/BackButton';
import { Card } from '@/components/ui';
import { bookByCode } from './books';
import { bookHref } from './order';

export const MISSING_BOOK = 'This book is not in the Bible list.';
export const MISSING_CHAPTER = 'This chapter is not in the Bible list.';

/**
 * What a screen of the Bible shows for an address that leads nowhere (a link with a book that does not exist, a chapter past the last one, a chapter the text
 * does not have): a calm sentence, the way back, and the way on to the Bible tab or to the chapters of the book when there is one. Never a crash and never a
 * blank. `code` is the book of the address, if it was one.
 */
export function PlaceMissing({ message, code }: { message: string; code?: string }) {
  const router = useRouter();
  const book = code ? bookByCode(code.toUpperCase()) : undefined;
  return (
    <Screen tabBar={false}>
      <BackButton fallback="/library" />
      <AppText variant="h2" accessibilityRole="header">Not found</AppText>
      <Card style={{ gap: 16 }}>
        <AppText variant="small" accessibilityLiveRegion="polite">{message}</AppText>
        <View style={{ gap: 8 }}>
          {book && <Pill variant="ghost" label={`Chapters of ${book.name}`} onPress={() => router.replace(bookHref(book.code))} />}
          <Pill variant="primary" label="Open the Bible" onPress={() => router.replace('/library')} />
        </View>
      </Card>
    </Screen>
  );
}
