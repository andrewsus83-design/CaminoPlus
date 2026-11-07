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
 *
 * `report` (real posts only): other pilgrims' words are on this sheet, so each of their comments has a "Report" that asks what
 * is wrong with the reasons the chat uses (the screen passes them in) and sends the report through `send`, which answers an
 * error sentence or null when it went through. A sample has none: nobody wrote it.
 */
export type CommentReport = {
  reasons: readonly { key: string; label: string }[];
  prompt: string;
  thanks: string;
  send: (comment: SheetComment, reason: string) => Promise<string | null>;
};

export function CommentsSheet({ visible, comments, status = 'ready', message, report, onSend, onClose }: {
  visible: boolean;
  comments: SheetComment[];
  /** loading: the comments are being read. error: they could not be (the message says why) and nothing can be sent. */
  status?: 'ready' | 'loading' | 'error';
  message?: string | null;
  report?: CommentReport;
  onSend: (text: string) => boolean | Promise<boolean>;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [reporting, setReporting] = useState<SheetComment | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reported, setReported] = useState<{ text: string; failed: boolean } | null>(null);
  const close = () => { setReporting(null); setReported(null); onClose(); };
  const sendReport = async (reason: string) => {
    if (!report || !reporting || sendingReport) return;
    setSendingReport(true);
    const error = await report.send(reporting, reason);
    setSendingReport(false);
    setReporting(null);
    setReported(error ? { text: error, failed: true } : { text: report.thanks, failed: false });
  };
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const taken = await onSend(text);
    if (!taken) setDraft((now) => now || text);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: FIXED.sheetScrim }}>
        <Pressable accessibilityLabel="Close comments" onPress={close} style={{ flex: 1 }} />
        <View style={{ maxHeight: height * (reporting ? 0.85 : 0.65), backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: layout.screenMargin, paddingTop: 20, paddingBottom: insets.bottom + 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="h4">Comments</AppText>
            <Pressable accessibilityLabel="Close" onPress={close} hitSlop={12}><Icon name="close" color={role.text} size={26} /></Pressable>
          </View>
          {reporting && report ? (
            <>
              <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12 }}>
                <AppText variant="label">Report this comment</AppText>
                <AppText variant="small" muted numberOfLines={2}>@{reporting.user}: {reporting.text}</AppText>
                <AppText variant="small" muted>{report.prompt}</AppText>
                <View style={{ backgroundColor: role.surface, borderRadius: radius.md, borderWidth: 1, borderColor: role.border, overflow: 'hidden', opacity: sendingReport ? 0.6 : 1 }}>
                  {report.reasons.map((r, i) => (
                    <Pressable key={r.key} accessibilityRole="button" accessibilityLabel={r.label} disabled={sendingReport} onPress={() => sendReport(r.key)} style={{ minHeight: 52, justifyContent: 'center', paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border }}>
                      <AppText variant="small">{r.label}</AppText>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel report" onPress={() => setReporting(null)} style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
                <AppText variant="label">Cancel</AppText>
              </Pressable>
            </>
          ) : (
            <>
              <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12 }}>
                {status === 'loading' && <AppText variant="small" muted>Loading comments…</AppText>}
                {status === 'ready' && comments.length === 0 && <AppText variant="small" muted>No comments yet. Be the first.</AppText>}
                {comments.map((cm) => (
                  <View key={cm.id} style={{ gap: 2, opacity: cm.pending ? 0.6 : 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <AppText variant="caption" muted>@{cm.user}{cm.pending ? ' · sending…' : ''}</AppText>
                      {!!report && !cm.mine && !cm.pending && (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Report comment by @${cm.user}`} onPress={() => { setReported(null); setReporting(cm); }} hitSlop={{ top: 12, bottom: 12, left: 16, right: 4 }}>
                          <AppText variant="caption" muted style={{ textDecorationLine: 'underline' }}>Report</AppText>
                        </Pressable>
                      )}
                    </View>
                    <AppText variant="small">{cm.text}</AppText>
                  </View>
                ))}
              </ScrollView>
              {!!reported && (
                <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ backgroundColor: reported.failed ? c.red100 : c.goldWash, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 12 }}>
                  <AppText variant="small" color={reported.failed ? c.red700 : role.accentText}>{reported.text}</AppText>
                </View>
              )}
              {!!message && (
                <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ backgroundColor: c.red100, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 12 }}>
                  <AppText variant="small" color={c.red700}>{message}</AppText>
                </View>
              )}
            </>
          )}
          {status !== 'error' && !reporting && (
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
