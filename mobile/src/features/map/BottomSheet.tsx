// Two-stop bottom sheet (peek / open). Drag the header up or down, or tap the handle.
// Content scrolls inside once the sheet is open, so nothing is ever cut off.
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { layout, radius, role, shadowStyle } from '@/theme';

type Props = { open: boolean; onOpenChange: (open: boolean) => void; peek: number; full: number; bottom: number; children: ReactNode };

export function BottomSheet({ open, onOpenChange, peek, full, bottom, children }: Props) {
  const hidden = Math.max(0, full - peek); // how far the sheet slides down when peeking
  const y = useRef(new Animated.Value(open ? 0 : hidden)).current;
  const start = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    Animated.spring(y, { toValue: open ? 0 : hidden, useNativeDriver: true, bounciness: 3 }).start();
  }, [open, hidden, y]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Capture so the handle button inside never swallows a drag.
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          y.stopAnimation((v) => (start.current = v));
        },
        onPanResponderMove: (_, g) => y.setValue(Math.min(hidden, Math.max(0, start.current + g.dy))),
        onPanResponderRelease: (_, g) => {
          const end = start.current + g.dy;
          const next = g.vy < -0.3 ? true : g.vy > 0.3 ? false : end < hidden / 2;
          Animated.spring(y, { toValue: next ? 0 : hidden, useNativeDriver: true, bounciness: 3 }).start();
          if (next !== openRef.current) onOpenChange(next);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [hidden, onOpenChange, y],
  );

  return (
    <Animated.View
      style={{
        position: 'absolute', left: layout.screenMargin, right: layout.screenMargin, bottom, height: full,
        borderRadius: radius.lg, backgroundColor: role.surface, ...shadowStyle('lg'),
        transform: [{ translateY: y }],
      }}
    >
      <View {...pan.panHandlers} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Collapse details' : 'Expand details'} onPress={() => onOpenChange(!openRef.current)} style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 52, height: 6, borderRadius: radius.pill, backgroundColor: role.border }} />
        </Pressable>
        {open && (
          <Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={() => onOpenChange(false)} hitSlop={8} style={{ position: 'absolute', right: 8, top: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color={role.muted} size={24} />
          </Pressable>
        )}
      </View>
      {/* While peeking, the whole card is a drag handle; once open the content scrolls. */}
      <View style={{ flex: 1 }} {...(open ? {} : pan.panHandlers)}>
        <ScrollView scrollEnabled={open} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          {children}
        </ScrollView>
      </View>
    </Animated.View>
  );
}
