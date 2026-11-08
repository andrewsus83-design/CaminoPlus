import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { c, fonts, layout, radius, role } from '@/theme';
import { PLACE_FINDING, PLACE_EXPLAIN, PLACE_EXPLAIN_TITLE, PLACE_LOOKUP_NOTE, PLACE_PRIVATE, placeProblemMessage } from './present';
import { PLACE_NAME_MAX, coordsText, placeLabel, type DiaryPlace } from './place';
import type { PlaceFlow } from './usePlace';

// Browsers draw their own outline inside a text field; the border of the row shows the focus instead. Web only: native rejects the value.
const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as object | null;

// The place of a page: the chip when the page is read (a pin, the name or the coordinates; a tap opens the phone's maps app), the row
// in the editor (pin, name field, a button that takes the place off), and the panel that walks through adding one. The colours are
// the roles of the theme; every control is at least 48 high and has a label.

/** The place as a chip, for the page when it is read: tap it to see it in the maps app. */
export function PlaceChip({ place, onOpen }: { place: DiaryPlace; onOpen: () => void }) {
  const label = placeLabel(place);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: layout.touchPrimary, borderRadius: radius.pill, borderWidth: 1, borderColor: role.border, backgroundColor: role.surface, paddingHorizontal: 16, alignSelf: 'flex-start', maxWidth: '100%' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Place: ${label}. Opens it in your maps app`}
        onPress={onOpen}
        style={({ pressed }) => ({ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: layout.touchPrimary, opacity: pressed ? 0.8 : 1 })}
      >
        <Icon name="pin" color={role.accentText} size={22} strokeWidth={2} />
        <AppText variant="label" numberOfLines={2} style={{ flexShrink: 1 }}>{label}</AppText>
      </Pressable>
    </View>
  );
}

/**
 * The place in the editor, in one row: the pin (opens the maps app), the name (a field: the phone's map service gave one, or the
 * pilgrim types it, also with no signal), and the button that takes the place off the page. The coordinates are the caption, so
 * the person can see exactly what is kept.
 */
export function PlaceEditRow({ place, onOpen, onRemove, onName, onFocusChange }: { place: DiaryPlace; onOpen: () => void; onRemove: () => void; onName: (name: string) => void; onFocusChange?: (focused: boolean) => void }) {
  const [name, setName] = useState(place.name ?? '');
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: layout.touchPrimary, borderRadius: radius.pill, borderWidth: focus ? 2 : 1, borderColor: focus ? c.gold : role.border, backgroundColor: role.surface, paddingHorizontal: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${placeLabel(place)} in your maps app`} onPress={onOpen} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pin" color={role.accentText} size={22} strokeWidth={2} />
        </Pressable>
        <TextInput
          value={name}
          onChangeText={(t) => { setName(t); onName(t); }}
          onFocus={() => { setFocus(true); onFocusChange?.(true); }}
          onBlur={() => { setFocus(false); onFocusChange?.(false); }}
          maxLength={PLACE_NAME_MAX}
          placeholder="Name this place (optional)"
          placeholderTextColor={role.muted}
          accessibilityLabel="Place name"
          returnKeyType="done"
          style={[{ flex: 1, minHeight: 48, color: role.text, fontFamily: fonts.bodyBold, fontSize: 17 }, noOutline]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Remove place" onPress={onRemove} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={role.muted} size={20} strokeWidth={2} />
        </Pressable>
      </View>
      <AppText variant="caption" muted style={{ paddingHorizontal: 16 }}>{coordsText(place)}</AppText>
    </View>
  );
}

/** The steps of adding a place (usePlace.ts): the explanation before the phone asks, the wait, and the calm words when it did not work. */
export function PlacePanel({ flow, onContinue, onClose, onSettings }: { flow: PlaceFlow; onContinue: () => void; onClose: () => void; onSettings: () => void }) {
  if (flow.step === 'idle') return null;
  if (flow.step === 'explain') {
    return (
      <Card style={{ gap: 12 }}>
        <AppText variant="h4" accessibilityRole="header">{PLACE_EXPLAIN_TITLE}</AppText>
        <AppText variant="small">{PLACE_EXPLAIN}</AppText>
        <AppText variant="small" muted>{PLACE_LOOKUP_NOTE}</AppText>
        <Pill label="Continue" onPress={onContinue} />
        <Pill label="Not now" variant="ghost" onPress={onClose} />
      </Card>
    );
  }
  if (flow.step === 'locating') {
    return (
      <Card style={{ gap: 12 }}>
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={role.action} />
          <AppText variant="label">{PLACE_FINDING}</AppText>
        </View>
        <AppText variant="small" muted>{PLACE_PRIVATE}</AppText>
        <Pill label="Cancel" variant="ghost" onPress={onClose} />
      </Card>
    );
  }
  const settings = flow.failure === 'blocked' || flow.failure === 'services-off';
  const again = flow.failure === 'timeout' || flow.failure === 'unavailable' || flow.failure === 'denied';
  return (
    <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
      <FormMessage tone="info">{placeProblemMessage(flow.failure)}</FormMessage>
      {settings && <Pill label="Open Settings" onPress={onSettings} />}
      {again && <Pill label="Try again" onPress={onContinue} />}
      <Pill label="Close" variant="ghost" onPress={onClose} />
    </View>
  );
}
