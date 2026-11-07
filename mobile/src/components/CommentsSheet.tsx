import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { FIXED } from './fixedColors';
import { COMMENT_INPUT_MAX, type SheetComment } from '@/lib/postComments';
import { c, fonts, layout, radius, role } from '@/theme';

/**
 * The comments sheet behind the comments button of the action rail: the one Discover has always had, now shared, so the
 * journey viewer opens the very same sheet. A bottom sheet over a dimmed page with the comments, an input and Send.
 *
 * It only draws. Where the comments come from is the screen's business: Discover's sample stories and the sample journey
 * keep them on the phone, a real post reads them from the database (lib/api.ts, listPostComments). `onSend` answers whether
 * the comment was taken; when it was not, the text is put back in the input so nothing the person wrote is lost.
 * `message` is one short honest sentence (offline, could not send) shown above the input. The sheet itself sits on the theme
 * background (role.bg), so its text keeps the theme colours; the dimmed page behind it and the gold Send button are fixed.
 */
export function CommentsSheet({ visible, comments, status = 'ready', message, onSend, onClose }: {
  visible: boolean;
  comments: SheetComment[];
  /** loading: the comments are being read. error: they could not be (the message says why) and nothing can be sent. */
  status?: 'ready' | 'loading' | 'error';
  message?: string | null;
  onSend: (text: string) => boolean | Promise<boolean>;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const taken = await onSend(text);
    if (!taken) setDraft((now) => now || text);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: FIXED.sheetScrim }}>
        <Pressable accessibilityLabel="Close comments" onPress={onClose} style={{ flex: 1 }} />
        <View style={{ maxHeight: height * 0.65, backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: layout.screenMargin, paddingTop: 20, paddingBottom: insets.bottom + 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="h4">Comments</AppText>
            <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={12}><Icon name="close" color={role.text} size={26} /></Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12 }}>
            {status === 'loading' && <AppText variant="small" muted>Loading comments…</AppText>}
            {status === 'ready' && comments.length === 0 && <AppText variant="small" muted>No comments yet. Be the first.</AppText>}
            {comments.map((cm) => (
              <View key={cm.id} style={{ gap: 2, opacity: cm.pending ? 0.6 : 1 }}>
                <AppText variant="caption" muted>@{cm.user}{cm.pending ? ' · sending…' : ''}</AppText>
                <AppText variant="small">{cm.text}</AppText>
              </View>
            ))}
          </ScrollView>
          {!!message && (
            <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ backgroundColor: c.red100, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 12 }}>
              <AppText variant="small" color={c.red700}>{message}</AppText>
            </View>
          )}
          {status !== 'error' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, paddingLeft: 18, paddingRight: 6 }}>
              <TextInput accessibilityLabel="Add a comment" value={draft} onChangeText={setDraft} onSubmitEditing={send} returnKeyType="send" maxLength={COMMENT_INPUT_MAX} placeholder="Add a comment…" placeholderTextColor={role.muted} style={{ flex: 1, fontFamily: fonts.body, fontSize: 17, color: role.text }} />
              <Pressable accessibilityRole="button" accessibilityLabel="Send comment" onPress={send} style={{ height: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: c.gold, justifyContent: 'center' }}>
                <AppText variant="label" color={FIXED.blue}>Send</AppText>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
