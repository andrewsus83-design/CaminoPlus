// Sheet that slides up from the bottom when opened and is dismissed by the X,
// by dragging it down, or by tapping the map above it. The tab bar is hidden meanwhile.
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { Icon } from '@/components/Icon';
import { radius, role, shadowStyle } from '@/theme';

type Props = { height: number; bottom: number; onClose: () => void; children: ReactNode };

export function ModalSheet({ height, bottom, onClose, children }: Props) {
  const y = useRef(new Animated.Value(height + bottom + 40)).current;
  const start = useRef(0);
  const closing = useRef(false);

  useEffect(() => {
    Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 3 }).start();
  }, [y]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(y, { toValue: height + bottom + 40, duration: 180, useNativeDriver: true }).start(() => onClose());
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 5 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => y.stopAnimation((v) => (start.current = v)),
        onPanResponderMove: (_, g) => y.setValue(Math.max(0, start.current + g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 80 || g.vy > 0.5) close();
          else Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 3 }).start();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [y, height, bottom],
  );

  return (
    <>
      <Pressable accessibilityLabel="Close details" onPress={close} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <Animated.View style={{ position: 'absolute', left: 12, right: 12, bottom, height, borderRadius: radius.lg, backgroundColor: role.surface, ...shadowStyle('lg'), transform: [{ translateY: y }] }}>
        <View {...pan.panHandlers} style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 52, height: 6, borderRadius: radius.pill, backgroundColor: role.border }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={close} hitSlop={8} style={{ position: 'absolute', right: 8, top: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color={role.muted} size={24} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          {children}
        </ScrollView>
      </Animated.View>
    </>
  );
}
