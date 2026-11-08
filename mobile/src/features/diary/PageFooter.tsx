import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { layout, radius, role, space } from '@/theme';
import type { PageFooter as Footer } from './present';

/** The height of both buttons: well over the 48 that is the least, because this is where the thumb rests. */
export const FOOTER_BUTTON = 56;

/**
 * The row under the page: a small button on the left (a third of the row; "Read" while writing, "Edit" while reading) and the big one on the right
 * (two thirds; "Publish" for a draft, "Done" for a published page). When the page has no big button (a published page that is being read) the small one takes the whole
 * row. What each is, and when it is off, is decided by pageFooter() in present.ts; this only draws it.
 */
export function PageFooter({ footer, busy, onToggle, onPrimary, bottom }: { footer: Footer; busy: boolean; onToggle: () => void; onPrimary: () => void; bottom: number }) {
  const { primary } = footer;
  return (
    <View accessibilityRole="toolbar" accessibilityLabel="Page actions" style={{ flexDirection: 'row', gap: space[3], paddingHorizontal: layout.screenMargin, paddingTop: space[2], paddingBottom: Math.max(bottom, space[2]), backgroundColor: role.bg }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={footer.toggle === 'Edit' ? 'Edit this page' : 'Read this page'}
        accessibilityHint={footer.toggle === 'Edit' ? 'Opens the page for writing' : 'Shows the page as it will be read'}
        accessibilityState={{ disabled: footer.toggleOff }}
        disabled={footer.toggleOff}
        onPress={onToggle}
        style={({ pressed }) => ({ flex: 1, minHeight: FOOTER_BUTTON, borderRadius: radius.pill, borderWidth: 1, borderColor: role.border, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center', opacity: footer.toggleOff ? 0.5 : pressed ? 0.8 : 1 })}
      >
        <AppText variant="label">{footer.toggle}</AppText>
      </Pressable>
      {primary !== null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primary === 'Publish' ? 'Publish this note' : 'Done'}
          accessibilityHint={primary === 'Publish' ? 'Makes the draft a note in your Notes' : 'Goes back. The page is already saved'}
          accessibilityState={{ disabled: footer.primaryOff || busy, busy }}
          disabled={footer.primaryOff || busy}
          onPress={onPrimary}
          style={({ pressed }) => ({ flex: 2, minHeight: FOOTER_BUTTON, borderRadius: radius.pill, backgroundColor: role.action, alignItems: 'center', justifyContent: 'center', opacity: footer.primaryOff ? 0.5 : pressed ? 0.85 : 1 })}
        >
          {busy ? <ActivityIndicator color={role.onAction} /> : <AppText variant="label" color={role.onAction}>{primary}</AppText>}
        </Pressable>
      )}
    </View>
  );
}
