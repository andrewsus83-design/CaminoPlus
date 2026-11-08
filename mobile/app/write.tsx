import { useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { FormMessage } from '@/components/auth/Field';
import { c, fixed, fonts, radius, role, layout } from '@/theme';
import { useAuth } from '@/lib/auth';
import { PickedMedia, PreparedMedia, createJournalPost, uploadPostMedia } from '@/lib/api';
import { useMyStorage } from '@/lib/billing';
import { MAX_VIDEO_SECONDS, MediaCancelled, MediaRejected, MediaTier, canResizePhotos, pickerQuality, pickerVideoPreset, prepareImage, prepareVideo, quotaCheck, tierFor } from '@/lib/media';
import { MediaPreparing } from '@/components/MediaPreparing';
import { NativeName, hasNativeModule } from '@/lib/optionalNative';

// Story composer, TikTok / Reels / Shorts style: a post is a row of slides. Each slide is a
// colour card or a photo / video with text on top and an optional location sticker.
// Step 1 builds the slides; step 2 is the share screen (caption, audience, Share).
// Choosing photos and videos needs the image-picker native module (current dev build or later).
// The background of a text slide belongs to the post, not to the mode the viewer is in: always the light palette.
const BACKGROUNDS = [
  { bg: fixed.blue, fg: fixed.parchment },
  { bg: fixed.gold, fg: fixed.blue },
  { bg: fixed.parchment, fg: fixed.blue },
  { bg: fixed.red, fg: fixed.parchment },
  { bg: '#2F5D50', fg: fixed.parchment },
  { bg: '#E9C987', fg: '#4A3A12' },
] as const;
const STYLES = ['Classic', 'Bold', 'Handwritten'] as const;
type TextStyleName = (typeof STYLES)[number];
const styleFont = (s: TextStyleName) => (s === 'Classic' ? fonts.title : s === 'Bold' ? fonts.bodyBold : fonts.accent);
const MAX_SLIDES = 10;

type Slide = { id: string; media?: PreparedMedia; text: string; bgIdx: number; style: TextStyleName; place: string };
const newSlide = (over: Partial<Slide> = {}): Slide => ({ id: `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`, text: '', bgIdx: 0, style: 'Classic', place: '', ...over });

// expo-video is native too: use it when the build has it, otherwise show a play tile.
let VideoModule: typeof import('expo-video') | null = null;
try {
  if (!hasNativeModule(NativeName.video)) throw new Error('missing');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  VideoModule = require('expo-video');
  if (!VideoModule?.useVideoPlayer) VideoModule = null;
} catch {
  VideoModule = null;
}

function LiveVideo({ uri }: { uri: string }) {
  const { useVideoPlayer, VideoView } = VideoModule!;
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} nativeControls={false} contentFit="cover" style={{ width: '100%', height: '100%' }} />;
}

/** Slide background: photo, video or plain colour. */
function Backdrop({ slide }: { slide: Slide }) {
  const bg = BACKGROUNDS[slide.bgIdx];
  if (slide.media?.type === 'image') return <Image source={{ uri: slide.media.uri }} resizeMode="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} />;
  if (slide.media?.type === 'video') {
    return (
      <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        {VideoModule ? <LiveVideo uri={slide.media.uri} /> : <Icon name="steps" color="#FFFFFF" size={48} />}
      </View>
    );
  }
  return <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: bg.bg }} />;
}

async function pickMedia(tier: MediaTier): Promise<PickedMedia[] | null> {
  let Picker: typeof import('expo-image-picker');
  try {
    if (!hasNativeModule(NativeName.imagePicker)) throw new Error('missing');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Picker = require('expo-image-picker');
    if (!Picker.launchImageLibraryAsync) throw new Error('missing');
  } catch {
    Alert.alert('Next build', 'Choosing photos and videos needs the next app build. Text slides work now.');
    return null;
  }
  // No permission question first: the system photo picker needs none (on Android 11 and 12 asking would request storage access).
  // On iPhone the picker itself exports a clip at the plan's size (720p Free, 1080p Plus); see src/lib/media/picker.ts.
  const res = await Picker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: MAX_SLIDES,
    quality: pickerQuality(tier, 'post', canResizePhotos()), videoMaxDuration: MAX_VIDEO_SECONDS,
    videoExportPreset: pickerVideoPreset(Picker.VideoExportPreset as unknown as Record<string, unknown>, tier, Platform.OS),
  });
  if (res.canceled) return null;
  return res.assets.map((a) => ({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image', mimeType: a.mimeType, width: a.width, height: a.height, durationMs: a.duration, fileSize: a.fileSize }));
}

export default function Write() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, journey, refresh } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [slides, setSlides] = useState<Slide[]>([newSlide()]);
  const [idx, setIdx] = useState(0);
  const [caption, setCaption] = useState('');
  const [editPlace, setEditPlace] = useState(false);
  const [audience, setAudience] = useState<'followers' | 'public'>('followers');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Photos and clips are made ready (smaller, location data removed) right after they are picked: src/lib/media.
  const storage = useMyStorage();
  const tier = tierFor(storage.data);
  const [preparing, setPreparing] = useState<{ label: string; fraction: number | null } | null>(null);
  const cancelRef = useRef<AbortController | null>(null);

  const slide = slides[idx];
  const bg = BACKGROUNDS[slide.bgIdx];
  const onMedia = !!slide.media;
  const fg = onMedia ? '#FFFFFF' : bg.fg;
  const size = useMemo(() => (slide.style === 'Handwritten' ? 44 : 32) - (slide.text.length > 140 ? 8 : slide.text.length > 70 ? 4 : 0), [slide.style, slide.text.length]);
  const patch = (p: Partial<Slide>) => setSlides((all) => all.map((s, i) => (i === idx ? { ...s, ...p } : s)));
  const hasContent = slides.some((s) => s.text.trim() || s.media);

  /** Make each picked file ready. Files that cannot go up are left out, with the reason; Cancel stops the rest. */
  const prepareAll = async (picked: PickedMedia[]): Promise<PreparedMedia[]> => {
    const ctrl = new AbortController();
    cancelRef.current = ctrl;
    const ready: PreparedMedia[] = [];
    const problems: string[] = [];
    try {
      for (const m of picked) {
        if (ctrl.signal.aborted) break;
        try {
          if (m.type === 'video') {
            setPreparing({ label: 'Preparing your video', fraction: 0 });
            const v = await prepareVideo(m.uri, tier, (f) => setPreparing({ label: 'Preparing your video', fraction: f }), ctrl.signal, { width: m.width, height: m.height, bytes: m.fileSize, durationMs: m.durationMs, mimeType: m.mimeType });
            ready.push({ prepared: true, type: 'video', uri: v.uri, mimeType: v.mimeType, width: v.width, height: v.height, durationMs: v.durationMs, bytes: v.bytes, thumbUri: null });
          } else {
            setPreparing({ label: picked.length > 1 ? 'Preparing your photos' : 'Preparing your photo', fraction: null });
            const ph = await prepareImage(m.uri, tier, { use: 'post', width: m.width, height: m.height, bytes: m.fileSize, mimeType: m.mimeType, thumb: true });
            ready.push({ prepared: true, type: 'image', uri: ph.uri, mimeType: ph.mimeType, width: ph.width, height: ph.height, durationMs: null, bytes: ph.bytes, thumbUri: ph.thumb?.uri ?? null });
          }
        } catch (e) {
          if (e instanceof MediaCancelled) break;
          problems.push(e instanceof MediaRejected ? e.message : 'One photo or video could not be read. Try it again.');
        }
      }
    } finally {
      cancelRef.current = null;
      setPreparing(null);
    }
    if (problems.length) {
      const left = problems.length === 1 ? 'It was left out.' : `${problems.length} files were left out.`;
      Alert.alert('Not added', `${problems[0]} ${left}`);
    }
    return ready;
  };

  const addMedia = async () => {
    const raw = await pickMedia(tier);
    if (!raw || raw.length === 0) return;
    const picked = await prepareAll(raw.slice(0, MAX_SLIDES));
    if (picked.length === 0) return;
    setSlides((all) => {
      const empty = !all[idx].text.trim() && !all[idx].media;
      const base = empty ? all.filter((_, i) => i !== idx) : all;
      const at = empty ? idx : all.length;
      const added = picked.slice(0, MAX_SLIDES - base.length).map((m) => newSlide({ media: m }));
      return [...base.slice(0, at), ...added, ...base.slice(at)];
    });
    setIdx((i) => Math.min(i, MAX_SLIDES - 1));
  };
  const addSlide = () => {
    if (slides.length >= MAX_SLIDES) return Alert.alert('Slide limit', `A post can have up to ${MAX_SLIDES} slides.`);
    setSlides((all) => [...all, newSlide({ bgIdx: (all.length) % BACKGROUNDS.length })]);
    setIdx(slides.length);
  };
  const removeSlide = () => {
    if (slides.length === 1) return setSlides([newSlide()]);
    setSlides((all) => all.filter((_, i) => i !== idx));
    setIdx((i) => Math.max(0, i - 1));
  };

  const share = async () => {
    if (!session || !hasContent) return setError('Add a few words or a photo about today first.');
    const needed = slides.reduce((sum, s) => sum + (s.media?.bytes ?? 0), 0);
    if (needed > 0) {
      const room = quotaCheck(needed, storage.data);
      if (!room.ok) return setError(`${room.message} You can also remove the photos and videos and share the words.`);
    }
    setBusy(true); setError(null);
    try {
      const texts = slides.map((s) => s.text.trim()).filter(Boolean);
      const body = [...texts, caption.trim()].filter(Boolean).join('\n\n');
      const place = slides.map((s) => s.place.trim()).find(Boolean) ?? null;
      const post = await createJournalPost({ userId: session.user.id, body, journeyId: journey?.id ?? null, routeId: journey?.route_id ?? null, placeName: place, visibility: audience });
      const media = slides.flatMap((s) => (s.media ? [s.media] : []));
      const failed = media.length ? await uploadPostMedia(session.user.id, post.id, media) : 0;
      await refresh();
      if (failed > 0) Alert.alert('Posted without some media', `${failed} of ${media.length} photos or videos could not be uploaded. Check your cloud storage in Settings.`);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const slideBody = (s: Slide, editable: boolean, scale = 1) => {
    const b = BACKGROUNDS[s.bgIdx];
    const color = s.media ? '#FFFFFF' : b.fg;
    const sz = (s.style === 'Handwritten' ? 44 : 32) - (s.text.length > 140 ? 8 : s.text.length > 70 ? 4 : 0);
    return (
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 * scale }}>
        {editable ? (
          <TextInput
            multiline maxLength={600} value={s.text} onChangeText={(t) => patch({ text: t })}
            placeholder={s.media ? 'Add text' : 'Tap to write about today'} placeholderTextColor={color + '99'}
            style={{ fontFamily: styleFont(s.style), fontSize: sz, lineHeight: sz * 1.3, color, textAlign: 'center', textAlignVertical: 'center', textShadowColor: s.media ? 'rgba(0,0,0,0.5)' : 'transparent', textShadowRadius: 8 }}
          />
        ) : (
          <AppText style={{ fontFamily: styleFont(s.style), fontSize: sz * 0.5 * scale, lineHeight: sz * 0.65 * scale, color, textAlign: 'center' }} numberOfLines={6}>{s.text}</AppText>
        )}
        {!!s.place.trim() && (
          <View style={{ alignSelf: 'center', marginTop: 20 * scale, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 * scale, height: 40 * scale, borderRadius: radius.pill, backgroundColor: 'rgba(255,253,248,0.92)' }}>
            <Icon name="pin" color={fixed.blue} size={18 * scale} />
            {editable && <AppText variant="label" color={fixed.blue}>{s.place.trim()}</AppText>}
          </View>
        )}
      </View>
    );
  };

  if (step === 2) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: role.bg }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, paddingBottom: 160, gap: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <BackButton onPress={() => setStep(1)} hint="Back to your slides" />
            <AppText variant="h4">New journey post</AppText>
            <View style={{ width: 48 }} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} style={{ flexGrow: 0, marginHorizontal: -layout.screenMargin }}>
            <View style={{ width: layout.screenMargin }} />
            {slides.map((s) => (
              <View key={s.id} style={{ width: 132, height: 232, borderRadius: radius.lg, overflow: 'hidden' }}>
                <Backdrop slide={s} />
                {slideBody(s, false, 0.55)}
              </View>
            ))}
            <View style={{ width: layout.screenMargin }} />
          </ScrollView>
          <AppText variant="caption" muted>{slides.length} {slides.length === 1 ? 'slide' : 'slides'}</AppText>
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
        <View style={{ position: 'absolute', left: layout.screenMargin, right: layout.screenMargin, bottom: insets.bottom + 16, gap: 8 }}>
          {!!error && <FormMessage>{error}</FormMessage>}
          <Pill large label="Share" onPress={share} loading={busy} disabled={!hasContent} />
        </View>
      </KeyboardAvoidingView>
    );
  }

  const glass = { backgroundColor: 'rgba(255,253,248,0.9)' } as const;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: onMedia ? '#000' : bg.bg }}>
      <Backdrop slide={slide} />
      {onMedia && <View pointerEvents="none" style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.18)' }} />}
      <View style={{ paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={12} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={fg} size={30} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Add location" onPress={() => setEditPlace((v) => !v)} style={{ height: 48, paddingHorizontal: 16, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6, ...glass }}>
            <Icon name="pin" color={fixed.blue} size={20} />
            <AppText variant="label" color={fixed.blue}>Location</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Change text style" onPress={() => patch({ style: STYLES[(STYLES.indexOf(slide.style) + 1) % STYLES.length] })} style={{ height: 48, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', ...glass }}>
            <AppText variant="label" color={fixed.blue} style={{ fontFamily: styleFont(slide.style) }}>Aa</AppText>
          </Pressable>
        </View>
      </View>
      {editPlace && (
        <View style={{ marginHorizontal: layout.screenMargin, marginTop: 8, height: 56, borderRadius: radius.pill, backgroundColor: 'rgba(255,253,248,0.95)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 8 }}>
          <Icon name="pin" color={fixed.blue} size={20} />
          <TextInput autoFocus value={slide.place} onChangeText={(t) => patch({ place: t })} maxLength={60} placeholder="Where are you? (e.g. Burgos)" placeholderTextColor={fixed.stone600} returnKeyType="done" onSubmitEditing={() => setEditPlace(false)} style={{ flex: 1, fontFamily: fonts.body, fontSize: 18, color: fixed.ink }} />
        </View>
      )}
      {slideBody(slide, true)}
      <View style={{ paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 12, gap: 12 }}>
        {!!error && <FormMessage>{error}</FormMessage>}
        {/* Slide strip: tap to edit a slide, + to add a text slide, gallery button for photos and videos. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, alignItems: 'center', paddingVertical: 4 }}>
          {slides.map((s, i) => (
            <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Slide ${i + 1}`} onPress={() => setIdx(i)} style={{ width: 48, height: 72, borderRadius: 10, overflow: 'hidden', borderWidth: 3, borderColor: i === idx ? '#FFFFFF' : 'rgba(255,253,248,0.35)' }}>
              <Backdrop slide={s} />
              {s.media?.type === 'video' && <View style={{ position: 'absolute', right: 3, bottom: 3 }}><Icon name="steps" color="#FFFFFF" size={14} /></View>}
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Add slide" onPress={addSlide} style={{ width: 48, height: 72, borderRadius: 10, alignItems: 'center', justifyContent: 'center', ...glass }}>
            <AppText variant="h4" color={fixed.blue}>+</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Add photos or videos" onPress={addMedia} style={{ height: 72, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, ...glass }}>
            <Icon name="camera" color={fixed.blue} size={22} />
            <AppText variant="label" color={fixed.blue}>Photo / video</AppText>
          </Pressable>
          {(slides.length > 1 || hasContent) && (
            <Pressable accessibilityRole="button" accessibilityLabel="Delete this slide" onPress={removeSlide} style={{ width: 48, height: 72, borderRadius: 10, alignItems: 'center', justifyContent: 'center', ...glass }}>
              <Icon name="close" color={fixed.red} size={22} />
            </Pressable>
          )}
        </ScrollView>
        {!onMedia && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
            {BACKGROUNDS.map((b, i) => (
              <Pressable key={b.bg} accessibilityRole="button" accessibilityLabel={`Background ${i + 1}`} onPress={() => patch({ bgIdx: i })} style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: b.bg, borderWidth: 3, borderColor: slide.bgIdx === i ? fixed.white : 'rgba(255,253,248,0.35)' }} />
            ))}
          </ScrollView>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="mono" color={fg} style={{ opacity: 0.75 }}>Slide {idx + 1} of {slides.length} · {slide.text.length} / 600</AppText>
          <View style={{ width: 160 }}>
            <Pill large variant="gold" label="Next" disabled={!hasContent} onPress={() => setStep(2)} />
          </View>
        </View>
      </View>
      {preparing && <MediaPreparing label={preparing.label} fraction={preparing.fraction} onCancel={() => cancelRef.current?.abort()} />}
    </KeyboardAvoidingView>
  );
}
