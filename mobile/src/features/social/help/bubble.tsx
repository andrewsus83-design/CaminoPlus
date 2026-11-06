// How a chat bubble shows links and help requests. Used by components/chat.tsx.
//  - http(s) links in any message are tappable (nothing else is ever opened)
//  - a help request is a clearly different bubble: Cross Red border and tint (set by the bubble), the label
//    "Help request", the position, and an "Open map" button
import { Fragment } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { c, fonts, radius, role } from '@/theme';
import { isHelpMessage, isSafeUrl, linkify, parseHelpMessage, urlsIn } from './logic';

/** Opens an http(s) link. Anything else is refused. */
export async function openUrl(url: string): Promise<boolean> {
  if (!isSafeUrl(url)) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** The link a screen reader user can open from a bubble: the map of a help request, else the first link of the message. */
export function linkTarget(body: string | null | undefined): string | null {
  if (!body) return null;
  return isHelpMessage(body) ? parseHelpMessage(body).mapUrl : urlsIn(body)[0] ?? null;
}

/** What a screen reader says for a help request (no web addresses read out letter by letter). */
export function helpSpoken(body: string): string {
  const p = parseHelpMessage(body);
  return ['Help request', p.place ? `Place: ${p.place}` : null, p.position ? `Position: ${p.position}` : null, p.rest || null].filter(Boolean).join('. ');
}

/** Message text with tappable http(s) links. */
export function LinkedText({ text, color, linkColor, fontSize = 18, lineHeight = 26 }: { text: string; color: string; linkColor: string; fontSize?: number; lineHeight?: number }) {
  return (
    <AppText variant="body" color={color} style={{ fontSize, lineHeight }}>
      {linkify(text).map((p, i) => (p.url
        ? <AppText key={i} variant="body" accessibilityRole="link" onPress={() => void openUrl(p.url!)} color={linkColor} style={{ fontSize, lineHeight, textDecorationLine: 'underline' }}>{p.text}</AppText>
        : <Fragment key={i}>{p.text}</Fragment>))}
    </AppText>
  );
}

const Line = ({ label, value }: { label: string; value: string }) => (
  <AppText variant="body" color={role.text} style={{ fontSize: 17, lineHeight: 24 }}>
    <AppText variant="label" color={role.text} style={{ fontSize: 17, lineHeight: 24, fontFamily: fonts.bodyBold }}>{label} </AppText>
    {value}
  </AppText>
);

/** Inside the bubble of a help request. */
export function HelpBody({ body }: { body: string }) {
  const p = parseHelpMessage(body);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="bell" color={c.red700} size={22} strokeWidth={2.2} />
        <AppText variant="label" color={c.red700} style={{ fontSize: 18, lineHeight: 24 }}>Help request</AppText>
      </View>
      {!!p.place && <Line label="Place:" value={p.place} />}
      {!!p.position && <Line label="Position:" value={p.position} />}
      {!!p.rest && <LinkedText text={p.rest} color={role.text} linkColor={c.blue700} fontSize={17} lineHeight={24} />}
      {!!p.mapUrl && (
        <Pressable
          accessibilityRole="button" accessibilityLabel="Open map" accessibilityHint="Opens this position in your maps app or browser" onPress={() => void openUrl(p.mapUrl!)}
          style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 48, marginTop: 4, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: role.action, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}
        >
          <Icon name="pin" color={role.onAction} size={20} strokeWidth={2} />
          <AppText variant="label" color={role.onAction}>Open map</AppText>
        </Pressable>
      )}
    </View>
  );
}
