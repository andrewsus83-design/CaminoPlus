import { ReactNode, useRef } from 'react';
import { Animated, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Badge, Highlight } from './ui';
import { OwnerState } from './store';
import { c, layout, radius, role, shadowStyle } from '@/theme';

// Press feedback shared by every card: scale to 98%, 120 ms.
function PressCard({ onPress, children, style, label }: { onPress: () => void; children: ReactNode; style: object; label: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.timing(scale, { toValue: v, duration: 120, useNativeDriver: true }).start();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={() => to(0.98)} onPressOut={() => to(1)}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

function Ring({ done, total = 5 }: { done: number; total?: number }) {
  // simple segmented ring stand-in: gold arc segments around the count
  return (
    <View style={{ width: 52, height: 52, borderRadius: radius.pill, borderWidth: 5, borderColor: c.goldSoft, borderTopColor: c.gold, borderRightColor: done / total > 0.25 ? c.gold : c.goldSoft, borderBottomColor: done / total > 0.5 ? c.gold : c.goldSoft, borderLeftColor: done / total > 0.75 ? c.gold : c.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
      <AppText variant="mono" color={c.goldInk} style={{ fontSize: 12 }}>{done}/{total}</AppText>
    </View>
  );
}

const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: role.surface, ...shadowStyle('sm') };

// The "List your business" card. It changes with the owner's progress.
export function BusinessCard({ state, name, stepsDone, onPress }: { state: OwnerState; name: string; stepsDone: number; onPress: () => void }) {
  if (state === 'draft') return (
    <PressCard label="Continue registration" onPress={onPress} style={{ ...row, backgroundColor: c.goldWash, borderWidth: 1.5, borderColor: c.goldSoft }}>
      <Ring done={stepsDone} />
      <View style={{ flex: 1 }}>
        <AppText variant="label">Finish {name || 'your listing'}</AppText>
        <AppText variant="caption" muted>Next: step {Math.min(stepsDone + 1, 5)} of 5 · draft saved</AppText>
      </View>
      <Icon name="chevron" color={role.muted} size={20} />
    </PressCard>
  );
  if (state === 'in_review') return (
    <PressCard label="Waiting for listings to open" onPress={onPress} style={row}>
      <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.goldWash, alignItems: 'center', justifyContent: 'center' }}><Icon name="shell" color={c.goldInk} size={22} /></View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">{name || 'Your place'}</AppText>
        <AppText variant="caption" muted>Details sent · we write when listings open</AppText>
      </View>
      <Badge label="Waiting" tone="gold" />
    </PressCard>
  );
  if (state === 'changes_requested') return (
    <PressCard label="Changes needed" onPress={onPress} style={{ ...row, borderWidth: 1.5, borderColor: c.red100 }}>
      <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.red100, alignItems: 'center', justifyContent: 'center' }}><Icon name="pen" color={c.red700} size={22} /></View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">Changes needed</AppText>
        <AppText variant="caption" muted>Fix and send again · note from our team</AppText>
      </View>
      <Badge label="Fix" tone="red" />
    </PressCard>
  );
  if (state === 'live') return (
    <PressCard label="Open business dashboard" onPress={onPress} style={row}>
      <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.goldSoft }} />
      <View style={{ flex: 1 }}>
        <AppText variant="label">{name || 'Albergue Casa Ana'}</AppText>
        <AppText variant="caption" color={c.success}>Live · 1.8k views this month</AppText>
      </View>
      <Badge label="Verified" tone="blue" icon="shield" />
    </PressCard>
  );
  // invite
  return (
    <PressCard label="List your business" onPress={onPress} style={{ overflow: 'hidden', borderRadius: radius.xl, backgroundColor: c.blue, padding: 22, ...shadowStyle('md') }}>
      <View style={{ position: 'absolute', right: -30, bottom: -36, opacity: 0.85 }}><Icon name="shell" color={c.gold} size={150} /></View>
      <AppText variant="mono" color={c.goldBright} style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>For business owners</AppText>
      <AppText variant="h3" color={c.parchment} style={{ marginTop: 8, maxWidth: 240 }}>Run an albergue, café or shop on the Way?</AppText>
      <AppText variant="small" color={c.parchment} style={{ opacity: 0.85, marginTop: 6, maxWidth: 230 }}>List it free. Pilgrims see you on the map tonight.</AppText>
      <View style={{ flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 8, marginTop: 16, height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: c.gold }}>
        <Icon name="briefcase" color={c.blue} size={18} />
        <AppText variant="label" color={c.blue}>List your business</AppText>
      </View>
    </PressCard>
  );
}

// Small dismissible card for the Stays feed.
export function BusinessFeedCard({ onPress, onDismiss }: { onPress: () => void; onDismiss: () => void }) {
  return (
    <PressCard label="List your business" onPress={onPress} style={{ ...row, backgroundColor: c.goldWash }}>
      <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.white, alignItems: 'center', justifyContent: 'center' }}><Icon name="briefcase" color={c.goldInk} size={22} /></View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">Own a place on the Camino?</AppText>
        <AppText variant="caption" muted>List it free in 10 minutes</AppText>
      </View>
      <Pressable accessibilityLabel="Dismiss" hitSlop={10} onPress={onDismiss}><Icon name="close" color={role.muted} size={20} /></Pressable>
    </PressCard>
  );
}

// Bottom sheet shown when the invite card is tapped (before the full-screen steps).
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(12,35,64,0.45)' }} />
      <View style={{ backgroundColor: role.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: layout.screenMargin, paddingTop: 24, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <View style={{ width: 44, height: 5, borderRadius: radius.pill, backgroundColor: c.sand400, alignSelf: 'center', marginBottom: 6 }} />
        {children}
      </View>
    </Modal>
  );
}

export function IntroSheet({ visible, onClose, onStart, onClaim }: { visible: boolean; onClose: () => void; onStart: () => void; onClaim: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="h3">List your business</AppText>
      <AppText variant="small" muted>Free · 5 short steps · about 10 minutes</AppText>
      <Highlight icon="shield" title="Verified owner badge" text="Stand out in Stays and on the map" />
      <Highlight icon="stays" title="Beds free or full in one tap" text="Pilgrims see it live" />
      <Highlight icon="chat" title="Reply to reviews" text="And see views and saves" />
      <Pill variant="gold" label="Get started" onPress={onStart} />
      <Pill variant="ghost" label="My place is already in the app" onPress={onClaim} />
      <Pressable onPress={onClose} style={{ alignItems: 'center', padding: 8 }}><AppText variant="label" muted>Not now</AppText></Pressable>
    </Sheet>
  );
}
