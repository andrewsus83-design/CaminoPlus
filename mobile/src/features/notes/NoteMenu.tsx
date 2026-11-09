import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { layout, radius, role, scrim } from '@/theme';
import { TOUCH_MIN } from './timeline';

// The "…" menu of a note: a sheet from the bottom, over everything (the tab bar too), like the menu of a post. Edit, Share link and Delete,
// and a way out. Share link asks first (ShareLinkSheet) and then makes a link to a COPY of the words; the note itself stays on the phone. It only says which one was chosen: the screen opens the page, or asks "Delete this page?" with the diary's own question first.
// A tap on the dimmed part, the phone's back button and Cancel all close it.

function Item({ icon, label, danger, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }) {
  const colour = danger ? role.danger : role.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: layout.touchPrimary, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: pressed ? role.bg : 'transparent' })}
    >
      <Icon name={icon} color={colour} size={24} />
      <AppText variant="lead" color={colour}>{label}</AppText>
    </Pressable>
  );
}

export function NoteMenu({ title, onClose, onEdit, onShareLink, onDelete }: { title: string; onClose: () => void; onEdit: () => void; onShareLink?: () => void; onDelete: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel="Close the menu" onPress={onClose} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: scrim }}>
        {/* The sheet takes its own touches, so a tap on a blank part of it does not close it. */}
        <View
          accessibilityViewIsModal
          onStartShouldSetResponder={() => true}
          style={{ alignSelf: 'center', width: '100%', maxWidth: 560, backgroundColor: role.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: layout.screenMargin, paddingTop: 20, paddingBottom: insets.bottom + 16, gap: 4, minHeight: TOUCH_MIN }}
        >
          <AppText variant="small" muted numberOfLines={1} style={{ paddingHorizontal: 12, paddingBottom: 8 }}>{title}</AppText>
          <Item icon="pen" label="Edit" onPress={onEdit} />
          {onShareLink && <Item icon="share" label="Share link" onPress={onShareLink} />}
          <Item icon="trash" label="Delete" danger onPress={onDelete} />
          <View style={{ marginTop: 12 }}>
            <Pill large variant="ghost" label="Cancel" onPress={onClose} />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
