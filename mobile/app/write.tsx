import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { FormMessage } from '@/components/auth/Field';
import { c, fonts, radius, role } from '@/theme';
import { useAuth } from '@/lib/auth';
import { createJournalPost } from '@/lib/api';

// Instagram-story style composer: step 1 is the full-screen canvas (colour, text style,
// location sticker); step 2 is the share screen (caption, audience, Share).
// Photos need the image picker native module and arrive with the next dev build.
const BACKGROUNDS = [
  { bg: c.blue, fg: c.parchment },
  { bg: c.gold, fg: c.blue },
  { bg: c.parchment, fg: c.blue },
  { bg: c.red, fg: c.parchment },
  { bg: '#2F5D50', fg: c.parchment },
  { bg: '#E9C987', fg: '#4A3A12' },
] as const;
const STYLES = ['Classic', 'Bold', 'Handwritten'] as const;
type TextStyleName = (typeof STYLES)[number];
const styleFont = (s: TextStyleName) => (s === 'Classic' ? fonts.title : s === 'Bold' ? fonts.bodyBold : fonts.accent);

export default function Write() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, journey, refresh } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [text, setText] = useState('');
  const [caption, setCaption] = useState('');
  const [bgIdx, setBgIdx] = useState(0);
  const [style, setStyle] = useState<TextStyleName>('Classic');
  const [place, setPlace] = useState('');
  const [editPlace, setEditPlace] = useState(false);
  const [audience, setAudience] = useState<'followers' | 'public'>('followers');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bg = BACKGROUNDS[bgIdx];
  const size = useMemo(() => (style === 'Handwritten' ? 44 : 32) - (text.length > 140 ? 8 : text.length > 70 ? 4 : 0), [style, text.length]);

  const share = async () => {
    if (!session || !text.trim()) return setError('Write a few words about today first.');
    setBusy(true); setError(null);
    try {
      const body = [text.trim(), caption.trim()].filter(Boolean).join('\n\n');
      await createJournalPost({ userId: session.user.id, body, journeyId: journey?.id ?? null, routeId: journey?.route_id ?? null, placeName: place.trim() || null, visibility: audience });
      await refresh();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const canvasText = (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
      {step === 1 ? (
        <TextInput
          multiline autoFocus maxLength={600} value={text} onChangeText={setText}
          placeholder="Tap to write about today" placeholderTextColor={bg.fg + '88'}
          style={{ fontFamily: styleFont(style), fontSize: size, lineHeight: size * 1.3, color: bg.fg, textAlign: 'center', textAlignVertical: 'center' }}
        />
      ) : (
        <AppText style={{ fontFamily: styleFont(style), fontSize: size * 0.62, lineHeight: size * 0.8, color: bg.fg, textAlign: 'center' }} numberOfLines={8}>{text}</AppText>
      )}
      {!!place.trim() && (
        <View style={{ alignSelf: 'center', marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: radius.pill, backgroundColor: 'rgba(255,253,248,0.92)' }}>
          <Icon name="pin" color={c.blue} size={18} />
          <AppText variant="label" color={c.blue}>{place.trim()}</AppText>
        </View>
      )}
    </View>
  );

  if (step === 2) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: role.bg }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 24, paddingBottom: 160, gap: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setStep(1)} hitSlop={12}><Icon name="back" color={role.text} size={30} /></Pressable>
            <AppText variant="h4">New journey post</AppText>
            <View style={{ width: 30 }} />
          </View>
          <View style={{ height: 300, borderRadius: radius.lg, backgroundColor: bg.bg, overflow: 'hidden', alignSelf: 'center', width: 190 + 40 }}>{canvasText}</View>
          <TextInput multiline maxLength={400} value={caption} onChangeText={setCaption} placeholder="Add a caption…" placeholderTextColor={role.muted} style={{ fontFamily: fonts.body, fontSize: 19, lineHeight: 28, color: role.text, minHeight: 80, textAlignVertical: 'top' }} />
          <View style={{ gap: 10 }}>
            <AppText variant="label">Who can see this</AppText>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['followers', 'public'] as const).map((a) => (
                <Pressable key={a} onPress={() => setAudience(a)} style={{ flex: 1, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: audience === a ? role.action : role.surface, borderWidth: 1, borderColor: audience === a ? role.action : role.border }}>
                  <AppText variant="label" color={audience === a ? role.onAction : role.text}>{a === 'followers' ? 'Followers' : 'Everyone'}</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
        <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 16, gap: 8 }}>
          {!!error && <FormMessage>{error}</FormMessage>}
          <Pill large label="Share" onPress={share} loading={busy} disabled={!text.trim()} />
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: bg.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={12} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={bg.fg} size={30} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Add location" onPress={() => setEditPlace((v) => !v)} style={{ height: 48, paddingHorizontal: 16, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,253,248,0.9)' }}>
            <Icon name="pin" color={c.blue} size={20} />
            <AppText variant="label" color={c.blue}>Location</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Change text style" onPress={() => setStyle(STYLES[(STYLES.indexOf(style) + 1) % STYLES.length])} style={{ height: 48, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,248,0.9)' }}>
            <AppText variant="label" color={c.blue} style={{ fontFamily: styleFont(style) }}>Aa</AppText>
          </Pressable>
        </View>
      </View>
      {editPlace && (
        <View style={{ marginHorizontal: 16, marginTop: 8, height: 56, borderRadius: radius.pill, backgroundColor: 'rgba(255,253,248,0.95)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 8 }}>
          <Icon name="pin" color={c.blue} size={20} />
          <TextInput autoFocus value={place} onChangeText={setPlace} maxLength={60} placeholder="Where are you? (e.g. Burgos)" placeholderTextColor={role.muted} returnKeyType="done" onSubmitEditing={() => setEditPlace(false)} style={{ flex: 1, fontFamily: fonts.body, fontSize: 18, color: role.text }} />
        </View>
      )}
      {canvasText}
      <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 12, gap: 14 }}>
        {!!error && <FormMessage>{error}</FormMessage>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
          {BACKGROUNDS.map((b, i) => (
            <Pressable key={b.bg} accessibilityRole="button" accessibilityLabel={`Background ${i + 1}`} onPress={() => setBgIdx(i)} style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: b.bg, borderWidth: 3, borderColor: bgIdx === i ? c.white : 'rgba(255,253,248,0.35)' }} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="mono" color={bg.fg} style={{ opacity: 0.7 }}>{text.length} / 600</AppText>
          <View style={{ width: 180 }}>
            <Pill large variant="gold" label="Next" disabled={!text.trim()} onPress={() => setStep(2)} />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
