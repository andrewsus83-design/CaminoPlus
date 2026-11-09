import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { appleButtonKit, isAppleSignInAvailable, signInWithApple } from '@/lib/authApple';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { layout } from '@/theme';

/**
 * "Continue with Apple": one button for sign in and sign up, next to the Google button and just as big (App Store 4.8).
 * Apple's own button (its logo, its words, its colours: black in light mode, white in dark mode), drawn by iOS.
 * Nothing at all on Android, on the web, or in an app made before build 1.2.0 (lib/authApple.ts says why).
 * `large` matches the large Google button of the welcome screen (68); otherwise it is a main action (56, layout.touchPrimary).
 */
export function AppleButton({ onError, large }: { onError: (msg: string | null) => void; large?: boolean }) {
  const [available, setAvailable] = useState(false);
  const busy = useRef(false);
  const { scheme } = useTheme();
  const { refresh } = useAuth();

  useEffect(() => {
    let alive = true;
    void isAppleSignInAvailable().then((ok) => { if (alive) setAvailable(ok); });
    return () => { alive = false; };
  }, []);

  const kit = available ? appleButtonKit() : null;
  if (!kit) return null;
  const height = large ? 68 : layout.touchPrimary;

  const go = async () => {
    if (busy.current) return;
    busy.current = true;
    onError(null);
    const res = await signInWithApple();
    busy.current = false;
    if (!res.ok && !res.cancelled) onError(res.error ?? 'Apple sign-in did not finish. Please try again.');
    if (res.ok && res.nameSaved) void refresh();
  };

  return (
    <View style={{ height, alignSelf: 'stretch' }}>
      <kit.Button
        buttonType={kit.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={scheme === 'dark' ? kit.AppleAuthenticationButtonStyle.WHITE : kit.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={height / 2}
        onPress={go}
        style={{ height, width: '100%' }}
      />
    </View>
  );
}
