import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { copyText } from '@/lib/clipboard';
import { shareAndRecord } from '@/lib/postShare';
import { SHEET, shareText, type Made, type ShareKind } from '@/lib/shareLinks';
import { icon, layout, radius, role, scrim, space } from '@/theme';

// The question before a share link is made: what the link shows, what it does not, and that anybody who has it can see it until
// it is stopped. Nothing is made until "Make link" is tapped; then the phone's own share sheet opens with the link. The link is
// made on the server (it needs a connection, and the sheet says so when there is none).

function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
      <Icon name="check" color={role.action} size={icon.smPlus} />
      <AppText variant="small" style={{ flex: 1 }}>{text}</AppText>
    </View>
  );
}

export function ShareLinkSheet({ kind, onClose, make }: { kind: ShareKind; onClose: () => void; make: (o: { stays: boolean }) => Promise<Made> }) {
  const insets = useSafeAreaInsets();
  const words = SHEET[kind];
  const [stays, setStays] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The link, once it exists and the share sheet did not take it (closed, failed, or none on this device): shown here to copy.
  const [ready, setReady] = useState<string | null>(null);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const made = await make({ stays });
    if (!made.ok) {
      setBusy(false);
      setProblem(made.message);
      return;
    }
    // The link exists now (and counts toward the 50). When the share sheet takes it, done; when it was closed, failed or is not there
    // (a computer's browser), the link stays on this sheet with a Copy button: it is never lost silently.
    const text = shareText(kind, made.url);
    const res = typeof Share?.share === 'function' ? await shareAndRecord({ share: () => Share.share({ message: text }) }) : { outcome: 'failed' as const };
    setBusy(false);
    if (res.outcome === 'shared') { onClose(); return; }
    setReady(text);
  };

  const copy = async () => {
    if (!ready) return;
    let ok = false;
    const nav = Platform.OS === 'web' && typeof navigator !== 'undefined' ? (navigator as { clipboard?: { writeText?: (t: string) => Promise<void> } }) : null;
    if (nav?.clipboard?.writeText) ok = await nav.clipboard.writeText(ready).then(() => true, () => false);
    else ok = await copyText(ready);
    setCopied(ok ? 'yes' : 'no');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: scrim }}>
        <View
          accessibilityViewIsModal
          onStartShouldSetResponder={() => true}
          style={{ alignSelf: 'center', width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: role.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}
        >
          <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenMargin, paddingTop: space[6], paddingBottom: insets.bottom + space[4], gap: space[4] }}>
            <AppText variant="h4" accessibilityRole="header">{words.title}</AppText>
            <View style={{ gap: space[2] }}>
              <AppText variant="label">The link shows</AppText>
              {words.shows.map((s) => <Bullet key={s} text={s} />)}
            </View>
            {kind === 'plan' && (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: stays }}
                aria-checked={stays}
                accessibilityLabel={SHEET.plan.staysOption}
                onPress={() => setStays((v) => !v)}
                style={{ minHeight: layout.touchPrimary, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], borderRadius: radius.md, borderWidth: 1, borderColor: stays ? role.action : role.border }}
              >
                <View style={{ width: 28, height: 28, borderRadius: radius.sm, borderWidth: 2, borderColor: role.action, backgroundColor: stays ? role.action : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {stays && <Icon name="check" color={role.onAction} size={icon.sm} />}
                </View>
                <AppText variant="small" style={{ flex: 1 }}>{SHEET.plan.staysOption}</AppText>
              </Pressable>
            )}
            <AppText variant="small" muted>{words.hides}</AppText>
            <AppText variant="small" muted>{words.live}</AppText>
            <View style={{ flexDirection: 'row', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: role.bg }}>
              <Icon name="info" color={role.action} size={icon.md} />
              <AppText variant="small" style={{ flex: 1 }}>{SHEET.anyone}</AppText>
            </View>
            {!!problem && <AppText variant="small" color={role.danger} accessibilityRole="alert">{problem}</AppText>}
            {ready ? (
              <View style={{ gap: space[3] }}>
                <AppText variant="label" accessibilityRole="alert">{SHEET.ready}</AppText>
                <View style={{ padding: space[3], borderRadius: radius.md, borderWidth: 1, borderColor: role.border, backgroundColor: role.bg }}>
                  <AppText variant="small" selectable>{ready}</AppText>
                </View>
                {copied && <AppText variant="small" muted>{copied === 'yes' ? SHEET.copied : SHEET.copyByHand}</AppText>}
                <Pill label={SHEET.copy} onPress={copy} />
                <Pill label={SHEET.done} variant="ghost" onPress={onClose} />
              </View>
            ) : (
              <>
                <View style={{ gap: space[2] }}>
                  <Pill label={SHEET.make} onPress={go} loading={busy} />
                  <Pill label={SHEET.cancel} variant="ghost" onPress={onClose} disabled={busy} />
                </View>
                <AppText variant="caption" muted style={{ textAlign: 'center' }}>{SHEET.needsNetwork}</AppText>
              </>
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}
