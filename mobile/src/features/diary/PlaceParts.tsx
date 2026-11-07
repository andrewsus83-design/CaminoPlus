import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { fonts, layout, radius, role } from '@/theme';
import { PLACE_FINDING, PLACE_EXPLAIN, PLACE_EXPLAIN_TITLE, PLACE_LOOKUP_NOTE, placeProblemMessage } from './present';
import { PLACE_NAME_MAX, placeLabel, type DiaryPlace } from './place';
import type { PlaceFlow } from './usePlace';

// The place of a page: the chip (a pin, the name or the coordinates; a tap opens the phone's maps app, a button takes it off), the
// field to name it, and the panel that walks through adding one. The colours are the roles of the theme; every control is at least
// 48 high and has a label.

/** The place as a chip: tap it to see it in the maps app. With `onRemove` (the editor) a button at its end takes the place off the page. */
export function PlaceChip({ place, onOpen, onRemove }: { place: DiaryPlace; onOpen: () => void; onRemove?: () => void }) {
  const label = placeLabel(place);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: layout.touchMin, borderRadius: radius.pill, borderWidth: 1, borderColor: role.border, backgroundColor: role.surface, paddingLeft: 16, paddingRight: onRemove ? 4 : 16, alignSelf: 'flex-start', maxWidth: '100%' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Place: ${label}. Opens it in your maps app`}
        onPress={onOpen}
        style={({ pressed }) => ({ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: layout.touchMin, opacity: pressed ? 0.8 : 1 })}
      >
        <Icon name="pin" color={role.accentText} size={22} strokeWidth={2} />
        <AppText variant="label" numberOfLines={2} style={{ flexShrink: 1 }}>{label}</AppText>
      </Pressable>
      {onRemove && (
        <Pressable accessibilityRole="button" accessibilityLabel="Remove place" onPress={onRemove} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={role.muted} size={20} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

/** A name for the place, optional: the phone's map service gave one, or the pilgrim types it (always possible, also with no signal). */
export function PlaceNameField({ place, onName, onFocusChange }: { place: DiaryPlace; onName: (name: string) => void; onFocusChange?: (focused: boolean) => void }) {
  const [name, setName] = useState(place.name ?? '');
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      value={name}
      onChangeText={(t) => { setName(t); onName(t); }}
      onFocus={() => { setFocus(true); onFocusChange?.(true); }}
      onBlur={() => { setFocus(false); onFocusChange?.(false); }}
      maxLength={PLACE_NAME_MAX}
      placeholder="Name this place (optional)"
      placeholderTextColor={role.placeholder}
      accessibilityLabel="Place name"
      returnKeyType="done"
      style={{ minHeight: layout.touchMin - 8, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: focus ? 2 : 1, borderColor: focus ? role.highlight : role.border, backgroundColor: role.surface, color: role.text, fontFamily: fonts.body, fontSize: 17 }}
    />
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
        <AppText variant="small" muted>Only on this phone. It is not uploaded or shared.</AppText>
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
