// Confirm sheets, action menus, a text prompt and toasts that work the same on iOS, Android and
// web (Alert.alert does nothing on web). Usage in a screen:
//   const { confirm, menu, prompt, toast, host } = useDialogs();
//   if (await confirm({ title: 'Unfriend Ana?', confirmLabel: 'Unfriend', destructive: true })) ...
//   ...render {host} once at the bottom of the screen.
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { c, fonts, radius, role, shadowStyle, layout } from '@/theme';
import { Btn, noOutline } from './primitives';

export type MenuOption<T extends string = string> = { key: T; label: string; icon?: IconName; destructive?: boolean; hint?: string };
type ConfirmOpts = { title: string; message?: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean; icon?: IconName };
type MenuOpts<T extends string> = { title?: string; message?: string; options: MenuOption<T>[] };
type PromptOpts = { title: string; message?: string; initial?: string; placeholder?: string; maxLength?: number; confirmLabel: string };
type NoticeOpts = { title: string; message: string; icon?: IconName; primary?: { label: string; value: string }; closeLabel?: string };

type State =
  | ({ type: 'confirm'; resolve: (v: boolean) => void } & ConfirmOpts)
  | ({ type: 'menu'; resolve: (v: string | null) => void } & MenuOpts<string>)
  | ({ type: 'prompt'; resolve: (v: string | null) => void } & PromptOpts)
  | ({ type: 'notice'; resolve: (v: string | null) => void } & NoticeOpts);

export function useDialogs() {
  const [state, setState] = useState<State | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ type: 'confirm', resolve, ...o })), []);
  const menu = useCallback(<T extends string>(o: MenuOpts<T>) => new Promise<T | null>((resolve) => setState({ type: 'menu', resolve: resolve as (v: string | null) => void, ...(o as MenuOpts<string>) })), []);
  const prompt = useCallback((o: PromptOpts) => new Promise<string | null>((resolve) => setState({ type: 'prompt', resolve, ...o })), []);
  /** A message with one optional main button: resolves to its `value`, or null when closed. */
  const notice = useCallback((o: NoticeOpts) => new Promise<string | null>((resolve) => setState({ type: 'notice', resolve, ...o })), []);
  const toast = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastText(text);
    toastTimer.current = setTimeout(() => setToastText(null), 3200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const close = useCallback((answer: boolean | string | null) => {
    setState((s) => {
      if (!s) return s;
      if (s.type === 'confirm') s.resolve(answer === true);
      else (s.resolve as (v: string | null) => void)(typeof answer === 'string' ? answer : null);
      return null;
    });
  }, []);

  const host = useMemo(() => <DialogHost state={state} close={close} toastText={toastText} />, [state, close, toastText]);
  return { confirm, menu, prompt, notice, toast, host };
}

function Sheet({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,54,93,0.45)' }}>
        <Pressable accessibilityLabel={`Close ${label}`} accessibilityRole="button" onPress={onClose} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
        <View accessibilityViewIsModal style={{ backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: 12, paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 12) + 16, gap: 16, maxHeight: '88%', ...shadowStyle('xl') }}>
          <View style={{ alignSelf: 'center', width: 48, height: 5, borderRadius: radius.pill, backgroundColor: role.border }} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DialogHost({ state, close, toastText }: { state: State | null; close: (a: boolean | string | null) => void; toastText: string | null }) {
  const insets = useSafeAreaInsets();
  return (
    <>
      {state?.type === 'confirm' && (
        <Sheet label={state.title} onClose={() => close(false)}>
          <View style={{ gap: 8 }}>
            {state.icon && (
              <View style={{ width: 56, height: 56, borderRadius: radius.pill, backgroundColor: state.destructive ? c.red100 : c.goldWash, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <Icon name={state.icon} color={state.destructive ? c.red700 : c.goldInk} size={28} />
              </View>
            )}
            <AppText variant="h4" accessibilityRole="header">{state.title}</AppText>
            {!!state.message && <AppText variant="small" muted>{state.message}</AppText>}
          </View>
          <View style={{ gap: 10 }}>
            <Btn label={state.confirmLabel} variant={state.destructive ? 'danger' : 'primary'} onPress={() => close(true)} />
            <Btn label={state.cancelLabel ?? 'Cancel'} variant="ghost" onPress={() => close(false)} />
          </View>
        </Sheet>
      )}

      {state?.type === 'menu' && (
        <Sheet label={state.title ?? 'menu'} onClose={() => close(null)}>
          {(!!state.title || !!state.message) && (
            <View style={{ gap: 4 }}>
              {!!state.title && <AppText variant="h4" accessibilityRole="header" numberOfLines={2}>{state.title}</AppText>}
              {!!state.message && <AppText variant="small" muted numberOfLines={3}>{state.message}</AppText>}
            </View>
          )}
          <ScrollView style={{ flexGrow: 0 }} bounces={false}>
            <View style={{ backgroundColor: role.surface, borderRadius: radius.md, borderWidth: 1, borderColor: role.border, overflow: 'hidden' }}>
              {state.options.map((o, i) => (
                <Pressable
                  key={o.key} accessibilityRole="button" accessibilityLabel={o.label} onPress={() => close(o.key)}
                  style={({ pressed }) => ({ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border, backgroundColor: pressed ? c.sand200 : 'transparent' })}
                >
                  {o.icon && <Icon name={o.icon} color={o.destructive ? c.red : role.text} size={24} />}
                  <View style={{ flex: 1 }}>
                    <AppText variant="body" color={o.destructive ? c.red : role.text} style={{ fontSize: 18, lineHeight: 24 }}>{o.label}</AppText>
                    {!!o.hint && <AppText variant="caption" muted style={{ letterSpacing: 0 }}>{o.hint}</AppText>}
                  </View>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Btn label="Cancel" variant="ghost" onPress={() => close(null)} />
        </Sheet>
      )}

      {state?.type === 'prompt' && <PromptSheet state={state} close={close} />}

      {state?.type === 'notice' && (
        <Sheet label={state.title} onClose={() => close(null)}>
          <View style={{ gap: 10 }}>
            <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: c.goldWash, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={state.icon ?? 'shell'} color={c.goldInk} size={32} />
            </View>
            <AppText variant="h4" accessibilityRole="header">{state.title}</AppText>
            <AppText variant="small" muted>{state.message}</AppText>
          </View>
          <View style={{ gap: 10 }}>
            {state.primary && <Btn label={state.primary.label} onPress={() => close(state.primary!.value)} />}
            <Btn label={state.closeLabel ?? (state.primary ? 'Not now' : 'OK')} variant={state.primary ? 'ghost' : 'primary'} onPress={() => close(null)} />
          </View>
        </Sheet>
      )}

      {!!toastText && (
        <View pointerEvents="none" style={{ position: 'absolute', left: layout.screenMargin, right: layout.screenMargin, bottom: insets.bottom + 96, alignItems: 'center' }}>
          <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ maxWidth: 420, backgroundColor: c.blue900, borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 14, ...shadowStyle('lg') }}>
            <AppText variant="small" color={c.parchment} style={{ textAlign: 'center' }}>{toastText}</AppText>
          </View>
        </View>
      )}
    </>
  );
}

function PromptSheet({ state, close }: { state: Extract<State, { type: 'prompt' }>; close: (a: string | null) => void }) {
  const [value, setValue] = useState(state.initial ?? '');
  const ok = value.trim().length > 0;
  return (
    <Sheet label={state.title} onClose={() => close(null)}>
      <View style={{ gap: 8 }}>
        <AppText variant="h4" accessibilityRole="header">{state.title}</AppText>
        {!!state.message && <AppText variant="small" muted>{state.message}</AppText>}
      </View>
      <TextInput
        autoFocus value={value} onChangeText={setValue} maxLength={state.maxLength} placeholder={state.placeholder} placeholderTextColor={role.muted}
        accessibilityLabel={state.title} returnKeyType="done" onSubmitEditing={() => ok && close(value.trim())}
        style={[{ minHeight: 60, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 2, borderColor: c.gold, paddingHorizontal: 22, fontFamily: fonts.body, fontSize: 19, color: role.text }, noOutline]}
      />
      {state.maxLength != null && <AppText variant="caption" muted style={{ textAlign: 'right', marginTop: -8 }}>{value.length} / {state.maxLength}</AppText>}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Btn label="Cancel" variant="ghost" onPress={() => close(null)} /></View>
        <View style={{ flex: 1 }}><Btn label={state.confirmLabel} disabled={!ok} onPress={() => close(value.trim())} /></View>
      </View>
    </Sheet>
  );
}
