import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { PilgrimAvatar } from '@/features/social/components/primitives';
import { role } from '@/theme';
import { COMPOSER_PLACEHOLDER, FILTER_LABEL, NOTES_PRIVACY, NOTE_FILTERS, TOUCH_MIN, filterLabel, type NoteCounts, type NoteFilter } from './timeline';

// The top of the feed, like the top of the timeline: a composer row (the person's picture, a prompt, two small shortcuts), the one quiet
// line that says where the notes are, and the filter row (All, Photos and videos, Places) as tabs. The prompt and the shortcuts all open
// a new page: the screen decides where (the editor is not changed for this, so the shortcuts do not choose a photo or a place by
// themselves; the label of each says so).

/** A small button under the prompt: an icon in the action colour, 44 by 44 to touch. */
function Shortcut({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} color={role.action} size={22} />
    </Pressable>
  );
}

export function NotesHeader({ name, photo, seed, onWrite, filter, counts, onFilter }: { name: string; photo: string | null; seed: string; onWrite: () => void; filter: NoteFilter; counts: NoteCounts; onFilter: (f: NoteFilter) => void }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12 }}>
        <PilgrimAvatar name={name} uri={photo} seed={seed} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Write a new note" accessibilityHint="Opens a blank page" onPress={onWrite} style={({ pressed }) => ({ minHeight: TOUCH_MIN + 4, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <AppText muted numberOfLines={2}>{COMPOSER_PLACEHOLDER}</AppText>
          </Pressable>
          <View style={{ flexDirection: 'row', marginLeft: -11 }}>
            <Shortcut icon="image" label="Write a new note, then add a photo" onPress={onWrite} />
            <Shortcut icon="pin" label="Write a new note, then add a place" onPress={onWrite} />
          </View>
        </View>
      </View>
      <AppText variant="caption" muted style={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 14 }}>{NOTES_PRIVACY}</AppText>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: role.border }}>
        {NOTE_FILTERS.map((f) => {
          const on = f === filter;
          return (
            <Pressable
              key={f}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              aria-selected={on}
              accessibilityLabel={filterLabel(f, counts[f])}
              onPress={() => onFilter(f)}
              style={{ flexGrow: 1, flexShrink: 1, alignItems: 'center', justifyContent: 'center', minHeight: TOUCH_MIN, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 3, borderBottomColor: on ? role.action : 'transparent', marginBottom: -1 }}
            >
              <AppText variant="label" color={on ? role.text : role.muted} style={{ textAlign: 'center' }}>{FILTER_LABEL[f]}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
