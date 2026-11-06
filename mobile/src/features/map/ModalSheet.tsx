// Edge-to-edge bottom sheet with two stops: half height and (almost) full screen.
// Drag the handle up to expand, down to go back to half and then to close. Also closed by the X
// or by tapping the map above it. The tab bar is hidden meanwhile (see maps.tsx).
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { layout, radius, role, shadowStyle } from '@/theme';

type Props = { half: number; max: number; bottomInset: number; onClose: () => void; children: ReactNode };

export function ModalSheet({ half, max, bottomInset, onClose, children }: Props) {
  // The sheet is `max` tall; translateY positions it: 0 = expanded, max - half = half, max = closed.
  const halfY = Math.max(0, max - half);
  const y = useRef(new Animated.Value(max)).current;
  const start = useRef(0);
  const at = useRef(halfY); // current stop
  const closing = useRef(false);
  const expanded = useRef(false);

  const go = (to: number, done?: () => void) => {
    at.current = to;
    expanded.current = to === 0;
    Animated.spring(y, { toValue: to, useNativeDriver: true, bounciness: 2, speed: 16 }).start(done ? () => done() : undefined);
  };
  useEffect(() => { go(halfY); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(y, { toValue: max, duration: 200, useNativeDriver: true }).start(() => onClose());
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => y.stopAnimation((v) => (start.current = v)),
        onPanResponderMove: (_, g) => y.setValue(Math.min(max, Math.max(0, start.current + g.dy))),
        onPanResponderRelease: (_, g) => {
          const end = start.current + g.dy;
          if (g.vy < -0.5) return go(0);
          if (g.vy > 0.5) return end > halfY - 20 ? close() : go(halfY);
          if (end < halfY / 2) go(0);
          else if (end < halfY + half / 2) go(halfY);
          else close();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [y, max, half, halfY],
  );

  return (
    <>
      <Pressable accessibilityLabel="Close details" onPress={close} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: max, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: role.surface, ...shadowStyle('lg'), transform: [{ translateY: y }] }}>
        <View {...pan.panHandlers} style={{ height: 64, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 56, height: 6, borderRadius: radius.pill, backgroundColor: role.border }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={close} hitSlop={8} style={{ position: 'absolute', right: layout.screenMargin, top: 6, width: 52, height: 52, borderRadius: 26, backgroundColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color={role.text} size={30} strokeWidth={2.2} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: layout.screenMargin, paddingBottom: bottomInset + 32 }}>
          {children}
        </ScrollView>
      </Animated.View>
    </>
  );
}
