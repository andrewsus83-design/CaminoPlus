// Simple two-stop bottom sheet (peek / open). Drag the handle or tap it to toggle.
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import { radius, role, shadowStyle } from '@/theme';

type Props = { open: boolean; onOpenChange: (open: boolean) => void; peek: number; full: number; bottom: number; children: ReactNode };

export function BottomSheet({ open, onOpenChange, peek, full, bottom, children }: Props) {
  const hidden = full - peek; // how far the sheet slides down when peeking
  const y = useRef(new Animated.Value(open ? 0 : hidden)).current;
  const start = useRef(0);

  useEffect(() => {
    Animated.spring(y, { toValue: open ? 0 : hidden, useNativeDriver: true, bounciness: 4 }).start();
  }, [open, hidden, y]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          y.stopAnimation((v) => (start.current = v));
        },
        onPanResponderMove: (_, g) => y.setValue(Math.min(hidden, Math.max(0, start.current + g.dy))),
        onPanResponderRelease: (_, g) => {
          const end = start.current + g.dy;
          const next = g.vy < -0.4 ? true : g.vy > 0.4 ? false : end < hidden / 2;
          Animated.spring(y, { toValue: next ? 0 : hidden, useNativeDriver: true, bounciness: 4 }).start();
          if (next !== open) onOpenChange(next);
        },
      }),
    [hidden, open, onOpenChange, y],
  );

  return (
    <Animated.View
      style={{
        position: 'absolute', left: 12, right: 12, bottom, height: full,
        borderRadius: radius.lg, backgroundColor: role.surface, ...shadowStyle('lg'),
        transform: [{ translateY: y }],
      }}
    >
      <View {...pan.panHandlers}>
        <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Collapse details' : 'Expand details'} onPress={() => onOpenChange(!open)} style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
          <View style={{ width: 44, height: 5, borderRadius: radius.pill, backgroundColor: role.border }} />
        </Pressable>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 16 }}>{children}</View>
    </Animated.View>
  );
}
