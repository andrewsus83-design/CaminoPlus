import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { Pill } from './Pill';
import { Card } from './ui';
import { copyText } from '@/lib/clipboard';
import { checkAndApplyUpdate, useBuild, type UpdateResult } from '@/lib/useBuildInfo';

const MESSAGE: Record<UpdateResult['kind'], string> = {
  off: 'Updates are off in this build.',
  current: 'You are on the newest version.',
  reloading: 'Restarting into the new version…',
  error: 'Could not check for updates.',
};

/** Settings > This build: which code this phone runs, copyable for a bug report, and a button to fetch an update now. */
export function BuildCard() {
  const { text, canCheckForUpdates } = useBuild();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const copy = async () => {
    if (await copyText(text.copy)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  const check = async () => {
    setBusy(true);
    setStatus(null);
    const r = await checkAndApplyUpdate();
    setStatus(r.kind === 'error' ? `${MESSAGE.error} ${r.message}` : MESSAGE[r.kind]);
    setBusy(false);
  };
  return (
    <Card style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Copy build information" onPress={copy} style={{ gap: 4 }}>
        <AppText variant="label">{text.title}</AppText>
        <AppText variant="mono" muted style={{ fontSize: 12, lineHeight: 18 }}>{text.code}</AppText>
        <AppText variant="mono" muted style={{ fontSize: 12, lineHeight: 18 }}>{text.update}</AppText>
        <AppText variant="caption" muted>{copied ? 'Copied' : 'Tap to copy'}</AppText>
      </Pressable>
      {canCheckForUpdates && (
        <View style={{ gap: 8 }}>
          <Pill label="Check for updates" variant="ghost" loading={busy} onPress={check} />
          {!!status && <AppText variant="caption" muted accessibilityLiveRegion="polite">{status}</AppText>}
        </View>
      )}
    </Card>
  );
}
