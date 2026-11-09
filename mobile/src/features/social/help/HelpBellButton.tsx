// The bell for the Maps control stack: a 56 dp round button, the bell in Cross Red. Day = parchment button, night =
// the dark button of the Walk view with a lighter red (plain Cross Red on that dark blue is only 2.5:1; this tint is 5.4:1).
// A small dot says "you rang the bell a little while ago": the sheet then opens on what was sent and on "I am OK now".
import { useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { fixed, shadowStyle } from '@/theme';
import { clockTime } from '../logic';
import { getAlert, subscribeAlert } from './alertStore';
import { activeAlert, alertLastAt } from './logic';

const NIGHT_BUTTON = '#13243C';
const NIGHT_BORDER = 'rgba(246,239,226,0.24)';
const NIGHT_BELL = '#E8776A';

export function HelpBellButton({ tone = 'day', onPress, size = 56 }: { tone?: 'day' | 'night'; onPress: () => void; size?: number }) {
  const night = tone === 'night';
  const alert = useSyncExternalStore(subscribeAlert, getAlert, getAlert);
  const rung = activeAlert(alert, Date.now());
  const bg = night ? NIGHT_BUTTON : fixed.parchment; // the button sits on the map, which has its own day and night: never the app's dark mode
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Need help"
      accessibilityHint={rung ? `Opens help. You rang the bell at ${clockTime(alertLastAt(rung))}.` : 'Opens help: call 112, or tell your friends where you are.'}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderWidth: night ? 1.5 : 0, borderColor: NIGHT_BORDER,
        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, ...shadowStyle('md'),
      })}
    >
      <Icon name="bell" color={night ? NIGHT_BELL : fixed.red} size={Math.round(size * 0.5)} strokeWidth={2.1} />
      {!!rung && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', top: 6, right: 6, width: 14, height: 14, borderRadius: 7, backgroundColor: night ? NIGHT_BELL : fixed.red, borderWidth: 2, borderColor: bg }} />}
    </Pressable>
  );
}
