import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { radius, role } from '@/theme';
import { END_OF_BOOK } from './copy';
import { nextLabel, partName, previousLabel, splitTitle, type ChapterNav } from './reading';

// The end of a chapter: Next, then Previous, each a wide button named by where it goes (a screen reader hears "Next: Book Two, Chapter I. Of the inward life";
// the eye sees NEXT in JetBrains Mono, the part when it changes, the chapter in Inter and what it is about under it, in one line), one short handwritten note, and, at the end of the
// last chapter, the end of the book with the credit of the edition and the way back to the contents. At the first and the last chapter the button that has no
// chapter to go to is still there, dimmed and disabled, so that nothing moves.

/** The one short handwritten note of the end of a chapter (Caveat), and of the end of the book. */
export const CHAPTER_NOTE = 'Rest a little';
export const BOOK_NOTE = 'Buen Camino!';

const NO_PREVIOUS = 'This is the first chapter';
const NO_NEXT = 'This is the last chapter';

function Step({ side, nav, onPress }: { side: 'previous' | 'next'; nav: ChapterNav; onPress: () => void }) {
  const to = side === 'previous' ? nav.prev : nav.next;
  const next = side === 'next';
  const filled = next && !!to;
  const ink = filled ? role.onAction : role.text;
  const part = to && to.part && to.part !== nav.part ? partName(to.part) : null;
  const { label, subtitle } = to ? splitTitle(to.title) : { label: next ? NO_NEXT : NO_PREVIOUS, subtitle: '' };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={next ? nextLabel(nav) : previousLabel(nav)}
      accessibilityState={{ disabled: !to }}
      disabled={!to}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.lg,
        backgroundColor: filled ? role.action : role.surface, borderWidth: 1, borderColor: filled ? role.action : role.border, opacity: to ? (pressed ? 0.85 : 1) : 0.45,
      })}
    >
      {!next && <Icon name="back" color={role.action} size={22} />}
      <View style={{ flex: 1, minWidth: 0, gap: 2, alignItems: next ? 'flex-end' : 'flex-start' }}>
        <AppText variant="mono" maxFontSizeMultiplier={1.3} color={filled ? role.onAction : role.muted} style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1.2, textTransform: 'uppercase', textAlign: next ? 'right' : 'left' }}>
          {part ? `${next ? 'Next' : 'Previous'} · ${part}` : next ? 'Next' : 'Previous'}
        </AppText>
        <AppText variant="label" maxFontSizeMultiplier={1.3} numberOfLines={2} color={ink} style={{ textAlign: next ? 'right' : 'left' }}>{label}</AppText>
        {!!subtitle && <AppText variant="small" maxFontSizeMultiplier={1.3} numberOfLines={1} color={filled ? role.onAction : role.muted} style={{ fontSize: 15, lineHeight: 20, textAlign: next ? 'right' : 'left' }}>{subtitle}</AppText>}
      </View>
      {next && <Icon name="chevron" color={filled ? role.onAction : role.action} size={22} />}
    </Pressable>
  );
}

type Props = { nav: ChapterNav; credit: string; onPrevious: () => void; onNext: () => void; onContents: () => void };

export function ChapterFooter({ nav, credit, onPrevious, onNext, onContents }: Props) {
  const last = !nav.next;
  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      <Step side="next" nav={nav} onPress={onNext} />
      <Step side="previous" nav={nav} onPress={onPrevious} />
      <AppText variant="accent" color={role.accentText} style={{ textAlign: 'center', marginTop: 8 }}>{last ? BOOK_NOTE : CHAPTER_NOTE}</AppText>
      {last && (
        <View style={{ gap: 12, alignItems: 'center', marginTop: 8 }}>
          <AppText variant="h4" accessibilityRole="header" style={{ textAlign: 'center' }}>{END_OF_BOOK}</AppText>
          <AppText variant="caption" muted style={{ textAlign: 'center' }}>{credit}</AppText>
          <View style={{ alignSelf: 'stretch' }}><Pill variant="ghost" label="Back to contents" onPress={onContents} /></View>
        </View>
      )}
    </View>
  );
}
