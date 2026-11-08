import { Pressable, ScrollView, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { layout, radius, role } from '@/theme';
import type { Formats } from './richtext';

export type FormatAction = 'bold' | 'italic' | 'heading' | 'bullet' | 'quote';

const TOOLS: { action: FormatAction; icon: IconName; label: string }[] = [
  { action: 'bold', icon: 'bold', label: 'Bold' },
  { action: 'italic', icon: 'italic', label: 'Italic' },
  { action: 'heading', icon: 'heading', label: 'Heading' },
  { action: 'bullet', icon: 'list', label: 'Bulleted list' },
  { action: 'quote', icon: 'quote', label: 'Quote' },
];

function Tool({ icon, label, on, onPress, disabled }: { icon: IconName; label: string; on?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? `${label}, on` : label}
      accessibilityState={{ selected: !!on, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flexGrow: 1, flexBasis: 0, minWidth: 48, height: layout.touchMin, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}
    >
      <View style={{ width: 44, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? role.highlight : 'transparent' }}>
        <Icon name={icon} color={on ? role.onHighlight : role.text} size={24} strokeWidth={on ? 2.2 : 1.75} />
      </View>
    </Pressable>
  );
}

/**
 * The bar above the keyboard: bold, italic, heading, bullets and quote on the selected text (the buttons that are on look pressed),
 * then, when this phone can do them, a photo or video from the library and the place you are at. Edge to edge, one row of buttons
 * that are at least 48 wide; on a screen too narrow for all of them the row scrolls. Pressing a button never takes the keyboard away.
 */
export function FormatBar({ formats, formatsOff, onFormat, onMedia, onPlace, mediaBusy, hasPlace }: {
  formats: Formats;
  /** True while the title has the keyboard: the formats are for the text, so they are dimmed and do nothing. */
  formatsOff?: boolean;
  onFormat: (a: FormatAction) => void;
  /** Absent when this phone cannot choose photos and videos: the button is not drawn. */
  onMedia?: () => void;
  onPlace?: () => void;
  mediaBusy?: boolean;
  hasPlace?: boolean;
}) {
  const on: Record<FormatAction, boolean> = { bold: formats.bold, italic: formats.italic, heading: formats.heading, bullet: formats.bullet, quote: formats.quote };
  return (
    <View accessibilityRole="toolbar" style={{ backgroundColor: role.surface, borderTopWidth: 1, borderTopColor: role.border }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ flexGrow: 1, alignItems: 'center' }}>
        {TOOLS.map((t) => <Tool key={t.action} icon={t.icon} label={t.label} on={on[t.action]} disabled={formatsOff} onPress={() => onFormat(t.action)} />)}
        {(onMedia || onPlace) && <View style={{ width: 1, height: 28, backgroundColor: role.border, marginHorizontal: 2 }} />}
        {onMedia && <Tool icon="image" label="Add photos or videos" onPress={onMedia} disabled={mediaBusy} />}
        {onPlace && <Tool icon="pin" label={hasPlace ? 'Change place' : 'Add place'} onPress={onPlace} />}
      </ScrollView>
    </View>
  );
}
