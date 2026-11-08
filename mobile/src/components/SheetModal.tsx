import { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, radius, role, scrim } from '@/theme';

/**
 * A bottom sheet over a dimmed page, in the style of the comments sheet: a modal that slides up, a tap on the dimmed part closes it, the
 * keyboard pushes it up on iOS, and its content sits on the theme background (role.bg) with the screen's side margin. It only frames: what is in
 * it, and what closing means, is the caller's. `maxHeight` is the share of the screen it may take.
 */
export function SheetModal({ children, onClose, closeLabel = 'Close', maxHeight = 0.88 }: { children: ReactNode; onClose: () => void; closeLabel?: string; maxHeight?: number }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: scrim }}>
        <Pressable accessibilityLabel={closeLabel} onPress={onClose} style={{ flex: 1 }} />
        <View style={{ maxHeight: height * maxHeight, backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: layout.screenMargin, paddingTop: 20, paddingBottom: insets.bottom + 16, gap: 14 }}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
