// The help sheet: Call 112 first and biggest, then the position, then who should hear about it. "Ring the bell"
// shows exactly what will be sent and to whom before anything leaves the phone. Calm on purpose: red is only
// for the 112 button and the bell. All state and decisions live in useHelp / ./logic.
import { ComponentRef, ReactNode, memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { c, fonts, layout, radius, role, shadowStyle } from '@/theme';
import { SelectMark } from '../components/people';
import { Btn, PilgrimAvatar, SearchField } from '../components/primitives';
import { Notice } from '../components/states';
import { clockTime } from '../logic';
import { PhoneIcon } from './icons';
import {
  EMERGENCY_NOTE, FIX_OLD_MS, OFFLINE_NOTE, URGENT_NOTE, accuracyText, ageText, cleanPlace, failureText, fixAgeMs, namesText, waitSeconds,
  type DeliveryRow, type HelpPosition, type PickerRow, type Recipient,
} from './logic';
import { useHelp } from './useHelp';
import { LIMIT_TEXT } from './useRecipients';

type Help = ReturnType<typeof useHelp>;
export type HelpSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The phone's position as the map knows it (shown at once; the sheet still asks for a fresh one). `at` = when it was measured. */
  position?: HelpPosition | null;
  /** Where on the route, e.g. "about 2.1 km after Zubiri, stage 3". Goes into the message when given. */
  placeText?: string | null;
};

const SCRIM = 'rgba(20,54,93,0.45)';
const PAD = 20;

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return open;
}

/** Android reads live regions by itself; iOS needs the announcement. */
function useAnnounce(text: string) {
  useEffect(() => {
    if (text && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}

/* ------------------------------------------------------------ pieces */

function Call112({ onPress, compact }: { onPress: () => void; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel="Call 112" accessibilityHint="The emergency number. Opens your phone to place the call." onPress={onPress}
      style={({ pressed }) => ({ minHeight: compact ? 64 : 88, borderRadius: radius.lg, backgroundColor: pressed ? c.red700 : c.red, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 12, ...shadowStyle('md') })}
    >
      <View style={{ width: compact ? 40 : 56, height: compact ? 40 : 56, borderRadius: radius.pill, backgroundColor: 'rgba(255,253,248,0.2)', alignItems: 'center', justifyContent: 'center' }}>
        <PhoneIcon color={c.white} size={compact ? 24 : 32} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label" color={c.white} style={{ fontSize: compact ? 22 : 30, lineHeight: compact ? 28 : 36, fontFamily: fonts.bodyBold }}>Call 112</AppText>
        {!compact && <AppText variant="caption" color={c.white} style={{ letterSpacing: 0, fontSize: 15, lineHeight: 20 }}>Works in Spain, France and Portugal, from any phone</AppText>}
      </View>
    </Pressable>
  );
}

/** The big buttons of the sheet: like Btn, but a long label wraps instead of being cut off (small phones, large fonts). */
function ActionBtn({ label, onPress, variant = 'primary', icon, disabled, loading, hint }: { label: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'soft'; icon?: IconName; disabled?: boolean; loading?: boolean; hint?: string }) {
  const palette = { primary: { bg: role.action, fg: role.onAction, border: role.action }, ghost: { bg: role.surface, fg: role.text, border: role.border }, soft: { bg: c.blue50, fg: c.blue, border: c.blue50 } }[variant];
  const off = !!(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled: off, busy: !!loading }} disabled={off} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 56, paddingHorizontal: 22, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: palette.bg, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: off && !loading ? 0.55 : pressed ? 0.85 : 1 })}
    >
      {loading
        ? <ActivityIndicator color={palette.fg} />
        : <>{!!icon && <Icon name={icon} color={palette.fg} size={20} />}<AppText variant="label" color={palette.fg} style={{ flexShrink: 1, textAlign: 'center' }}>{label}</AppText></>}
    </Pressable>
  );
}

// Getters, so the colours follow the light/dark theme.
const card = { get backgroundColor() { return role.surface; }, borderRadius: radius.md, borderWidth: 1, get borderColor() { return role.border; } };

function PositionCard({ h, placeText }: { h: Help; placeText?: string | null }) {
  const p = h.position;
  const place = cleanPlace(placeText);
  if (!p.fix && p.status === 'none') {
    return (
      <View accessibilityRole="alert" style={[card, { padding: 16, gap: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.red100, alignItems: 'center', justifyContent: 'center' }}><Icon name="info" color={c.red700} size={24} strokeWidth={1.9} /></View>
          <AppText variant="label" style={{ flex: 1, fontSize: 19, lineHeight: 25 }}>We could not find your position</AppText>
        </View>
        <AppText variant="small" muted>{failureText(p.failure ?? 'unavailable')}</AppText>
        <AppText variant="small">You can still call 112.</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Btn label="Try again" icon="refresh" size="sm" onPress={() => void p.locate()} />
          {(p.failure === 'blocked' || p.failure === 'denied') && <Btn label="Open settings" size="sm" variant="ghost" onPress={h.openSettings} />}
        </View>
      </View>
    );
  }
  if (!p.fix) {
    return (
      <View accessibilityLiveRegion="polite" style={[card, { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <ActivityIndicator color={role.action} />
        <View style={{ flex: 1 }}>
          <AppText variant="label">Finding your position…</AppText>
          <AppText variant="caption" muted style={{ letterSpacing: 0 }}>This can take up to 10 seconds. You can call 112 now.</AppText>
        </View>
      </View>
    );
  }
  const fix = p.fix;
  const age = fixAgeMs(fix, h.now);
  const old = age > FIX_OLD_MS;
  const locating = p.status === 'locating';
  const acc = accuracyText(fix.accuracyM);
  const coords = `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`;
  const title = old ? 'Last known position' : 'Your position';
  const spoken = [`${title}: ${coords}`, acc ? `Accurate to ${acc}` : 'Accuracy unknown', ageText(age), place, locating ? 'Checking for a more exact position' : null].filter(Boolean).join('. ');
  return (
    <View style={[card, { padding: 16, gap: 8 }, old && { borderColor: c.goldSoft, backgroundColor: c.goldWash }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="pin" color={old ? c.goldInk : c.blue} size={22} strokeWidth={2} />
        <AppText variant="label" style={{ flex: 1 }}>{title}</AppText>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Update my position" accessibilityState={{ busy: locating, disabled: locating }} disabled={locating} onPress={() => void p.locate()} hitSlop={4}
          style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, opacity: locating ? 0.6 : pressed ? 0.7 : 1 })}
        >
          {locating ? <ActivityIndicator size="small" color={role.action} /> : <Icon name="refresh" color={role.action} size={20} strokeWidth={2} />}
          <AppText variant="label" color={role.action} style={{ fontSize: 16 }}>{locating ? 'Updating' : 'Update'}</AppText>
        </Pressable>
      </View>
      <View accessible accessibilityLabel={spoken} accessibilityLiveRegion="polite" style={{ gap: 4 }}>
        <AppText variant="mono" style={{ fontSize: 20, lineHeight: 28, fontFamily: fonts.mono }}>{coords}</AppText>
        <AppText variant="small" muted>{acc ? `Accurate to ${acc}` : 'Accuracy unknown'} · {ageText(age)}</AppText>
        {locating && <AppText variant="caption" muted style={{ letterSpacing: 0 }}>Checking for a more exact position…</AppText>}
        {old && !locating && (
          <AppText variant="small" color={c.goldInk}>
            {p.source === 'fresh' ? `This position is ${ageText(age).replace(' ago', '')} old. Tap Update to get a new one.` : 'Your phone could not get a fresh position, so this is the last one it knew. Tap Update to try again.'}
          </AppText>
        )}
        {!!place && (
          <AppText variant="small" style={{ marginTop: 2 }}>
            <AppText variant="label" style={{ fontSize: 17, lineHeight: 25 }}>Place: </AppText>
            {place}
          </AppText>
        )}
      </View>
    </View>
  );
}

const RecipientRow = memo(function RecipientRow({ row, onToggle }: { row: PickerRow; onToggle: (r: Recipient) => void }) {
  const r = row.recipient;
  const group = r.kind === 'group';
  return (
    <Pressable
      accessibilityRole="checkbox" accessibilityState={{ checked: row.chosen }} accessibilityLabel={group ? `${r.name}, group${row.detail ? `, ${row.detail}` : ''}` : r.name}
      accessibilityHint={row.chosen ? 'Tap to take out of the list' : 'Tap to add to the list'} onPress={() => onToggle(r)}
      style={({ pressed }) => ({ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: pressed ? c.sand200 : row.chosen ? c.goldWash : 'transparent' })}
    >
      <PilgrimAvatar name={r.name} uri={row.avatarUrl} seed={r.id} size={44} group={group} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="label" numberOfLines={1} style={{ fontSize: 18, lineHeight: 24 }}>{r.name}</AppText>
        {!!(row.detail || row.username) && <AppText variant="caption" muted numberOfLines={1} style={{ letterSpacing: 0 }}>{row.detail ?? `@${row.username}`}</AppText>}
      </View>
      <SelectMark on={row.chosen} />
    </Pressable>
  );
});

const Group = ({ title, rows, onToggle }: { title: string; rows: PickerRow[]; onToggle: (r: Recipient) => void }) => (rows.length === 0 ? null : (
  <View style={{ gap: 6 }}>
    <AppText variant="mono" muted style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 }} accessibilityRole="header">{title}</AppText>
    <View style={[card, { overflow: 'hidden' }]}>
      {rows.map((row, i) => (
        <View key={row.recipient.kind + row.recipient.id} style={i === 0 ? undefined : { borderTopWidth: 1, borderTopColor: role.border }}>
          <RecipientRow row={row} onToggle={onToggle} />
        </View>
      ))}
    </View>
  </View>
));

function Recipients({ h }: { h: Help }) {
  const { people } = h;
  const { rows } = people;
  const noPeople = !people.loading && !people.error && people.friends?.length === 0 && !(people.convs ?? []).some((g) => g.kind === 'group');
  const waiting = people.loading && people.rows.friends.length === 0 && people.rows.groups.length === 0;
  const shown = rows.friends.length + rows.groups.length;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <AppText variant="label" accessibilityRole="header" style={{ fontSize: 21, lineHeight: 28 }}>Who should get it?</AppText>
        <AppText variant="mono" muted accessibilityLiveRegion="polite" style={{ fontSize: 14 }}>{people.chosen.length === 0 ? 'None chosen' : `${people.chosen.length} chosen`}</AppText>
      </View>
      <AppText variant="small" muted>{URGENT_NOTE}</AppText>

      {waiting && (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading your friends" style={[card, { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <ActivityIndicator color={role.action} />
          <AppText variant="small" muted>Loading your friends and groups…</AppText>
        </View>
      )}
      {!!people.error && (
        <View accessibilityRole="alert" style={[card, { padding: 14, gap: 8, borderColor: c.red100 }]}>
          <AppText variant="small">{rows.remembered && shown > 0 ? `${people.error} These are the people you chose last time.` : people.error}</AppText>
          <View style={{ flexDirection: 'row' }}><Btn label="Try again" icon="refresh" size="sm" variant="ghost" onPress={() => void people.retry()} /></View>
        </View>
      )}
      {noPeople && (
        <View style={[card, { padding: 16, gap: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.goldWash, alignItems: 'center', justifyContent: 'center' }}><Icon name="group" color={c.goldInk} size={24} /></View>
            <AppText variant="label" style={{ flex: 1, fontSize: 19, lineHeight: 25 }}>No friends here yet</AppText>
          </View>
          <AppText variant="small" muted>When a friend accepts your request, they show up here. Until then, use “Share by WhatsApp or SMS” below to send your position to anyone.</AppText>
        </View>
      )}
      {!noPeople && !waiting && (people.friendCount > 0 || shown > 0 || people.query.length > 0) && (
        <>
          {people.friendCount > 0 && (
            <View style={{ flexDirection: 'row' }}>
              <Btn
                label={people.allFriends ? 'Unselect all friends' : 'Select all friends'} icon={people.allFriends ? 'close' : 'check-double'} size="sm" variant="soft"
                onPress={() => people.chooseAllFriends(!people.allFriends)} hint={people.allFriends ? 'Takes every friend out of the list' : 'Adds every friend to the list'}
              />
            </View>
          )}
          <SearchField value={people.query} onChangeText={people.setQuery} placeholder="Search friends and groups" label="Search friends and groups" />
          {!!people.limited && <AppText variant="small" color={c.goldInk} accessibilityLiveRegion="polite">{LIMIT_TEXT}</AppText>}
          {shown === 0 && people.query.length > 0
            ? <AppText variant="small" muted style={{ textAlign: 'center' }}>{`No friend or group matches “${people.query.trim()}”.`}</AppText>
            : <><Group title="Friends" rows={rows.friends} onToggle={people.toggle} /><Group title="Groups" rows={rows.groups} onToggle={people.toggle} /></>}
        </>
      )}
    </View>
  );
}

function RingButton({ disabled, subtitle, spoken, onPress }: { disabled: boolean; subtitle: string; spoken: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint="Shows what will be sent and to whom. Nothing is sent yet."
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ minHeight: 64, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 2, borderColor: c.red, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}
    >
      <Icon name="bell" color={c.red} size={28} strokeWidth={2.1} />
      <View style={{ flexShrink: 1 }}>
        <AppText variant="label" style={{ fontSize: 20, lineHeight: 25 }}>Ring the bell</AppText>
        {!!subtitle && <AppText variant="caption" muted numberOfLines={2} accessibilityLiveRegion="polite" style={{ letterSpacing: 0, fontSize: 14, lineHeight: 18 }}>{subtitle}</AppText>}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------ confirmation */

function Confirm({ h }: { h: Help }) {
  const p = h.pending;
  if (!p) return null;
  const old = fixAgeMs(p.fix, h.now) > FIX_OLD_MS;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <AppText variant="h4" accessibilityRole="header">Send this message?</AppText>
        <AppText variant="small" muted>This is exactly what your friends will see in the chat.</AppText>
      </View>
      <View accessibilityLabel={`The message: ${p.text.replace(/\n/g, '. ')}`} accessible style={{ backgroundColor: role.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.red, padding: 14 }}>
        <AppText variant="mono" selectable style={{ fontSize: 15, lineHeight: 23 }}>{p.text}</AppText>
      </View>
      <View style={{ gap: 6 }}>
        <AppText variant="mono" muted style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12 }} accessibilityRole="header">To</AppText>
        <View style={[card, { overflow: 'hidden' }]}>
          {p.recipients.map((r, i) => (
            <View key={r.kind + r.id} accessible accessibilityLabel={r.kind === 'group' ? `${r.name}, group. Everyone in it will see your position.` : r.name} style={[{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: role.border }]}>
              <PilgrimAvatar name={r.name} seed={r.id} size={40} group={r.kind === 'group'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="label" numberOfLines={1}>{r.name}</AppText>
                <AppText variant="caption" muted style={{ letterSpacing: 0 }}>{r.kind === 'group' ? 'Group chat. Everyone in it sees your position.' : 'Friend'}</AppText>
              </View>
            </View>
          ))}
        </View>
      </View>
      <AppText variant="small" muted>{URGENT_NOTE}</AppText>
      {p.skipped.length > 0 && <AppText variant="small" color={c.goldInk}>{`Not again yet, they got a help message less than a minute ago: ${namesText(p.skipped, 3)}.`}</AppText>}
      {old && <AppText variant="small" color={c.goldInk}>{`This position is from ${ageText(fixAgeMs(p.fix, h.now))}. Go back and tap Update if you can.`}</AppText>}
      {!h.online && <AppText variant="small" color={c.goldInk}>You are offline. The message waits in your phone and is sent when your signal returns.</AppText>}
    </View>
  );
}

/* ------------------------------------------------------------ after ringing */

const STATE_STYLE = {
  sent: { icon: 'check', color: c.success },
  sending: { icon: 'clock', color: role.muted },
  waiting: { icon: 'wifi-off', color: c.goldInk },
  failed: { icon: 'info', color: c.red700 },
  unknown: { icon: 'info', color: role.muted },
} as const;

const DeliveryItem = memo(function DeliveryItem({ row, onRetry }: { row: DeliveryRow; onRetry: (sendId: string) => void }) {
  const d = row.delivery;
  const r = row.recipient;
  const look = STATE_STYLE[d?.state ?? 'unknown'];
  const label = d ? `${row.send?.kind === 'ok' ? 'I am OK now: ' : ''}${d.label}` : 'Not sent';
  return (
    <View style={{ minHeight: 64, paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
      <View accessible accessibilityLabel={`${r.name}. ${label}.${d?.detail ? ` ${d.detail}` : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PilgrimAvatar name={r.name} seed={r.id} size={40} group={r.kind === 'group'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="label" numberOfLines={1}>{r.name}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {d?.state === 'sending' ? <ActivityIndicator size="small" color={look.color} /> : <Icon name={look.icon} color={look.color} size={16} strokeWidth={2.4} />}
            <AppText variant="caption" color={look.color} style={{ letterSpacing: 0, fontFamily: fonts.bodyBold, flexShrink: 1 }}>{label}</AppText>
          </View>
          {!!d?.detail && <AppText variant="caption" muted style={{ letterSpacing: 0, fontSize: 14, lineHeight: 19 }}>{d.detail}</AppText>}
        </View>
      </View>
      {!!(d?.retry && row.send) && (
        <View style={{ paddingLeft: 52, flexDirection: 'row' }}>
          <Btn label="Try again" icon="refresh" size="sm" variant="ghost" onPress={() => onRetry(row.send!.id)} accessibilityLabel={`Try again for ${r.name}`} />
        </View>
      )}
    </View>
  );
});

function Sent({ h }: { h: Help }) {
  const a = h.alert;
  if (!a) return null;
  const lastHelp = a.sends.filter((s) => s.kind === 'help').reduce((m, s) => Math.max(m, s.at), a.startedAt);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <AppText variant="h4" accessibilityRole="header">{h.closed ? 'You said you are OK' : `Bell rung at ${clockTime(a.startedAt)}`}</AppText>
        {h.closed
          ? <AppText variant="small" muted>{`At ${clockTime(a.okAt ?? lastHelp)}. The people you told got “I am OK now”.`}</AppText>
          : lastHelp - a.startedAt > 5000 && <AppText variant="small" muted>{`Your position was sent again at ${clockTime(lastHelp)}.`}</AppText>}
      </View>
      <AppText variant="label" accessibilityLiveRegion="polite" style={{ fontSize: 18, lineHeight: 24 }}>{h.summary}</AppText>
      <View style={[card, { overflow: 'hidden' }]}>
        {h.rows.map((row, i) => (
          <View key={row.recipient.kind + row.recipient.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: role.border } : undefined}>
            <DeliveryItem row={row} onRetry={(id) => void h.retry(id)} />
          </View>
        ))}
      </View>
      <AppText variant="small" muted>{URGENT_NOTE}</AppText>
      <View style={{ gap: 10 }}>
        <ActionBtn label="Share by WhatsApp or SMS" icon="share" variant="ghost" onPress={() => void h.share()} hint="Opens your share sheet with your position and a map link" />
        {!h.closed && <ActionBtn label="Choose different people" icon="group" variant="soft" onPress={() => h.setView('compose')} />}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ the sheet */

export function HelpSheet({ visible, onClose, position, placeText }: HelpSheetProps) {
  const h = useHelp({ visible, position, placeText });
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const typing = useKeyboardOpen();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  // Buttons stay in view at the bottom, unless the screen is small or the text is large: then they end the page instead.
  const sticky = height >= 620 && fontScale <= 1.3;
  useAnnounce(h.view === 'sent' ? h.summary : h.view === 'confirm' ? 'Send this message? Check the message and who gets it, then tap Send.' : '');
  useEffect(() => { scroller.current?.scrollTo({ y: 0, animated: false }); }, [h.view, visible]); // each view starts at the top: 112 first
  const busy = h.busy != null;
  const names = namesText(h.people.chosen);

  let buttons: ReactNode = null;
  if (h.view === 'compose') {
    buttons = (
      <>
        <RingButton
          disabled={!!h.blocker} subtitle={h.blocker ?? names} onPress={h.askToRing}
          spoken={h.blocker ? `Ring the bell. ${h.blocker}` : `Ring the bell, to ${names}`}
        />
        <ActionBtn label="Share by WhatsApp or SMS" icon="share" variant="ghost" disabled={!h.position.fix} onPress={() => void h.share()} hint="Opens your share sheet with your position and a map link" />
      </>
    );
  } else if (h.view === 'confirm') {
    buttons = (
      <>
        <ActionBtn label="Send" icon="send" loading={h.busy === 'ring'} onPress={() => void h.confirmRing()} hint="Sends the message above to the chats listed" />
        <ActionBtn label="Cancel" variant="ghost" disabled={busy} onPress={h.cancelRing} hint="Nothing is sent" />
      </>
    );
  } else if (h.closed) {
    buttons = (
      <>
        <ActionBtn label="Close" onPress={onClose} />
        <ActionBtn label="Send a new help message" variant="ghost" onPress={() => h.setView('compose')} />
      </>
    );
  } else {
    buttons = (
      <>
        {h.resendBlocked && <AppText variant="caption" muted accessibilityLiveRegion="polite" style={{ textAlign: 'center', letterSpacing: 0 }}>{`You can send your position again in ${waitSeconds(h.resendWaitMs)} s.`}</AppText>}
        <ActionBtn label="I am OK now" icon="check" loading={h.busy === 'ok'} disabled={busy} onPress={() => void h.sayOk()} hint="Tells the same chats: I am OK now" />
        <ActionBtn
          label="Send my position again" icon="refresh" variant="ghost" loading={h.busy === 'resend'} disabled={busy || h.resendBlocked} onPress={() => void h.resend()}
          hint={h.resendBlocked ? 'Each chat gets at most one help message a minute' : 'Finds your position again and sends it to the same chats'}
        />
      </>
    );
  }
  const footer = (
    <View style={[{ gap: 10 }, sticky ? { paddingHorizontal: PAD, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) + 6, borderTopWidth: 1, borderTopColor: role.border, backgroundColor: role.bg } : { marginTop: 4 }]}>
      {!!h.feedback && (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: c.goldWash, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 }}>
          <AppText variant="small" color={c.goldInk} style={{ textAlign: 'center' }}>{h.feedback}</AppText>
        </View>
      )}
      {buttons}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: SCRIM }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close help" onPress={onClose} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior="padding">
          <View accessibilityViewIsModal style={{ maxHeight: height - insets.top - layout.screenTop, backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, overflow: 'hidden', ...shadowStyle('xl') }}>
            <View style={{ paddingTop: 10, paddingHorizontal: PAD }}>
              <View style={{ alignSelf: 'center', width: 48, height: 5, borderRadius: radius.pill, backgroundColor: role.border }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <AppText variant="h4" accessibilityRole="header">Need help?</AppText>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={4} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.sand200 : 'transparent' })}>
                  <Icon name="close" color={role.text} size={24} strokeWidth={2} />
                </Pressable>
              </View>
            </View>
            <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: PAD, paddingTop: 4, paddingBottom: sticky ? 20 : Math.max(insets.bottom, 12) + 20, gap: 16 }}>
              <Call112 compact={h.view === 'confirm'} onPress={() => void h.call112()} />
              <AppText variant="small">{EMERGENCY_NOTE}</AppText>
              {!h.online && <View style={{ borderRadius: radius.md, overflow: 'hidden' }}><Notice icon="wifi-off" text={OFFLINE_NOTE} /></View>}
              {h.view === 'compose' && <><PositionCard h={h} placeText={placeText} /><Recipients h={h} /></>}
              {h.view === 'confirm' && <Confirm h={h} />}
              {h.view === 'sent' && <Sent h={h} />}
              {!sticky && footer}
            </ScrollView>
            {sticky && !typing && footer}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
