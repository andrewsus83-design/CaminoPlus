import { memo, useMemo, useState } from 'react';
import { Pressable, Text, View, type AccessibilityActionEvent } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import type { DiaryPlace } from '@/features/diary/place';
import { RichText } from '@/features/diary/RichText';
import type { DiaryEntry } from '@/features/diary/store';
import { PilgrimAvatar } from '@/features/social/components/primitives';
import { radius, role, textStyle } from '@/theme';
import { NoteMedia } from './NoteMedia';
import { BODY_CLAMP_PX, BLANK_NOTE, FADE_PX, FADE_STEPS, SHOW_LESS, SHOW_MORE, TOUCH_MIN, needsMore, noteRow } from './timeline';

// One note of the feed, like one post of a timeline: the person's picture at the left, and to its right a line (name, handle, a dot, the time,
// and the "…" button), the title in bold when there is one, the words (the diary's RichText, cut at eight lines with "Show more"), the photos and
// videos as a grid, the place as a chip, and a row of actions (Share). A tap anywhere else on the row opens the page.
//
// For a screen reader the row is ONE thing that reads like a sentence (who, when, the title, the first words, what is attached), and what its
// parts do (share, edit, delete, see the photos, open the place) are actions of that one thing, so a person is not asked to swipe through
// eight small controls to get past a note.

export type NoteActions = {
  open: (id: string) => void;
  edit: (id: string) => void;
  more: (entry: DiaryEntry) => void;
  remove: (entry: DiaryEntry) => void;
  share: (text: string) => void;
  media: (id: string, start: number) => void;
  place: (place: DiaryPlace) => void;
  toggle: (id: string) => void;
};

export type NoteWho = { name: string; handle: string; photo: string | null; seed: string };

/**
 * The words of the note, cut at eight lines by the height they measure: "Show more" is only there when something is cut. The cut is made by
 * height, and a blank line between two paragraphs is half a line high, so it can fall in the middle of a line: the last few pixels fade into
 * the background (`behind` is the colour the row is drawn on right now), so a cut line reads as "there is more" and never as a mistake.
 */
function Words({ text, full, open, behind, onToggle }: { text: string; full: string; open: boolean; behind: string; onToggle: () => void }) {
  const [more, setMore] = useState(false);
  return (
    <View>
      <View style={{ maxHeight: open ? undefined : BODY_CLAMP_PX, overflow: 'hidden' }}>
        {/* This one is as tall as the words are, whatever its parent shows of it: that is what is measured (only while the note is closed). */}
        <View onLayout={(e) => { if (!open) setMore(needsMore(e.nativeEvent.layout.height)); }}>
          <RichText text={open ? full : text} />
        </View>
        {more && !open && (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: FADE_PX }}>
            {Array.from({ length: FADE_STEPS }, (_, i) => (
              <View key={i} style={{ height: FADE_PX / FADE_STEPS, backgroundColor: behind, opacity: (i + 1) / FADE_STEPS }} />
            ))}
          </View>
        )}
      </View>
      {more && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Show less of this note' : 'Show more of this note'}
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          onPress={onToggle}
          style={({ pressed }) => ({ minHeight: TOUCH_MIN, justifyContent: 'center', alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
        >
          <AppText variant="label" color={role.accentText}>{open ? SHOW_LESS : SHOW_MORE}</AppText>
        </Pressable>
      )}
    </View>
  );
}

function NoteRowView({ entry, uid, now, who, open, actions }: { entry: DiaryEntry; uid: string; now: Date; who: NoteWho; open: boolean; actions: NoteActions }) {
  const row = useMemo(() => noteRow(entry, now, who), [entry, now, who]);
  const { time } = row;
  const hasWords = row.full.trim() !== '';

  const available = useMemo(() => [
    ...(row.share !== '' ? [{ name: 'share', label: 'Share' }] : []),
    { name: 'edit', label: 'Edit' },
    { name: 'delete', label: 'Delete' },
    ...(row.media.length > 0 ? [{ name: 'media', label: 'See the photos and videos' }] : []),
    ...(row.place ? [{ name: 'place', label: 'Open the place in your maps app' }] : []),
  ], [row.share, row.media.length, row.place]);
  const onAction = (e: AccessibilityActionEvent) => {
    switch (e.nativeEvent.actionName) {
      case 'share': actions.share(row.share); break;
      case 'edit': actions.edit(entry.id); break;
      case 'delete': actions.remove(entry); break;
      case 'media': actions.media(entry.id, 0); break;
      case 'place': if (row.place) actions.place(row.place); break;
      default: break;
    }
  };

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={row.label}
      accessibilityHint="Opens this note"
      accessibilityActions={available}
      onAccessibilityAction={onAction}
      onPress={() => actions.open(entry.id)}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: row.share !== '' ? 4 : 14, backgroundColor: pressed ? role.sunken : 'transparent' })}
    >
      {({ pressed }) => (
        <>
          <PilgrimAvatar name={who.name} uri={who.photo} seed={who.seed} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 24 }}>
              {/* The name and the handle are one line of text, so when the column is narrow the end of the handle goes first, then the
                  handle, and the name last; the time never shrinks. */}
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline' }}>
                <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {who.name}
                  {who.handle !== '' && <Text style={[textStyle('caption'), { color: role.muted }]}>{` ${who.handle}`}</Text>}
                </AppText>
                {time !== null && <AppText variant="caption" muted style={{ flexShrink: 0 }}>{` · ${time.short}`}</AppText>}
              </View>
              {/* 44 by 44 to touch; the negative margins keep the line as low as its text, and the dots on the edge of the column */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More: edit or delete this note"
                accessibilityHint="Opens a menu"
                onPress={() => actions.more(entry)}
                style={({ pressed: down }) => ({ width: TOUCH_MIN, height: TOUCH_MIN, marginTop: -10, marginBottom: -10, marginRight: -12, alignItems: 'center', justifyContent: 'center', opacity: down ? 0.6 : 1 })}
              >
                <Icon name="more" color={role.muted} size={22} />
              </Pressable>
            </View>

            {row.title !== '' && <AppText variant="h4" style={{ fontSize: 20, lineHeight: 26, marginTop: 2 }}>{row.title}</AppText>}
            {hasWords && <View style={{ marginTop: 4 }}><Words text={row.body} full={row.full} open={open} behind={pressed ? role.sunken : role.bg} onToggle={() => actions.toggle(entry.id)} /></View>}
            {row.blank && <AppText muted style={{ marginTop: 4 }}>{BLANK_NOTE}</AppText>}
            {row.media.length > 0 && <View style={{ marginTop: 10 }}><NoteMedia uid={uid} items={row.media} onOpen={(i) => actions.media(entry.id, i)} /></View>}
            {row.place !== null && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Place: ${row.placeText}. Opens it in your maps app`}
                onPress={() => actions.place(row.place as DiaryPlace)}
                style={({ pressed: down }) => ({ marginTop: 10, alignSelf: 'flex-start', maxWidth: '100%', minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: role.border, backgroundColor: role.surface, opacity: down ? 0.8 : 1 })}
              >
                <Icon name="pin" color={role.accentText} size={18} strokeWidth={2} />
                <AppText variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>{row.placeText}</AppText>
              </Pressable>
            )}
            {row.share !== '' && (
              <View style={{ flexDirection: 'row', marginTop: 4, marginLeft: -11 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share the words of this note"
                  accessibilityHint="Opens the share sheet. Only the words are shared"
                  onPress={() => actions.share(row.share)}
                  style={({ pressed: down }) => ({ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', opacity: down ? 0.6 : 1 })}
                >
                  <Icon name="share" color={role.muted} size={22} />
                </Pressable>
              </View>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

/** Rows are made of what a note is and what the person is, and are drawn again only when one of them changes. */
export const NoteRow = memo(NoteRowView);
