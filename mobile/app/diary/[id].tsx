import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { IconButton } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { confirmDelete } from '@/features/diary/confirm';
import { device } from '@/features/diary/device';
import { FormatBar, type FormatAction } from '@/features/diary/FormatBar';
import { MediaGrid, MediaStrip, MediaViewer } from '@/features/diary/MediaTiles';
import { MEDIA_PER_PAGE_MAX, mediaOf } from '@/features/diary/media';
import { PageFooter } from '@/features/diary/PageFooter';
import { noteStartFor } from '@/features/library/noteStart';
import { PlaceChip, PlaceEditRow, PlacePanel } from '@/features/diary/PlaceParts';
import { normalizePlace, withName, type DiaryPlace } from '@/features/diary/place';
import { FEATURES_NEED_NEW_APP, MEDIA_NEEDS_NEW_APP, MEDIA_ON_WEB, SAVE_DRAFT, attachMessage, dateLine, dateWithDraft, metaLine, pageFooter, pageTitle, placeProblemMessage, problemMessage, thousands } from '@/features/diary/present';
import { RichText } from '@/features/diary/RichText';
import { continueList, formatsAt, toggleBlock, toggleInline, type Edit, type Sel } from '@/features/diary/richtext';
import { BODY_MAX, TITLE_MAX, type DiaryEntry } from '@/features/diary/store';
import { usePlaceFlow } from '@/features/diary/usePlace';
import { NEW_PAGE, useDiaryPage, usePageSaver } from '@/features/diary/useDiary';
import { c, radius, role, textStyle } from '@/theme';

// Browsers draw their own outline inside a text field; the border of the page (gold while writing) shows the focus instead.
// Web only: native rejects the value.
const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as object | null;

// One diary page. [id] is a saved page's id, or "new" for a blank page. The text is written as it is typed
// (src/features/diary/autosave.ts) and again whenever the person leaves, so nothing has to be saved by hand: Save draft and Publish only say what the page is.
//
// The page can be formatted (a bar at the bottom of the text box: bold, italic, heading, bullets, quote, and the photo and the pin; the text
// keeps the marks, richtext.ts), can hold photos and videos from the phone's library (copied into the app, shown as tiles, a tap shows one
// full screen) and the place the pilgrim is at. A page that has something in it opens READ, drawn the way it will be remembered; "Edit" opens
// it for writing. Everything is written by the same saver, so a photo added while a save of the text is pending cannot race it.
//
// A page begun here is a DRAFT (it shows in Notes with a "Draft" tag) until it is published. At the bottom there is one row: Read (Edit
// while reading), a third of the width, and Publish, two thirds (a published page has "Done" there, which only goes back). At the top right,
// while a draft is written, "Save draft" keeps it as a draft and goes back. Publishing makes it a note of the feed; nothing is sent anywhere.
export default function DiaryPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; quote?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const quote = Array.isArray(params.quote) ? params.quote[0] : params.quote;
  // A new note can start from a passage of a book or a verse of the Bible (/diary/new?quote=<the key>, the Note action of the readers): the passage as a quotation, and the caret under it.
  const start = useMemo(() => (id === NEW_PAGE && quote ? noteStartFor(quote) : null), [id, quote]);
  const page = useDiaryPage(id);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  if (page.state === 'missing') return <NotHere goBack={goBack} />;
  if (page.state === 'loading') return <Screen tabBar={false}><IconButton name="back" label="Back" onPress={goBack} /></Screen>;
  // Keyed by the person and the page: the saver is made once, for one person, so another account can never reuse an editor.
  return <PageEditor key={`${page.uid}:${page.entry?.id ?? NEW_PAGE}`} uid={page.uid} initial={page.entry} start={start} goBack={goBack} />;
}

/** A page that is not in this diary: deleted, or a link from another account. Friendly, and a way out. */
function NotHere({ goBack }: { goBack: () => void }) {
  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={goBack} />
      <View style={{ gap: 8 }}>
        <AppText variant="h2" accessibilityRole="header">This page is not here</AppText>
        <AppText variant="lead" muted>It may have been deleted. Your other pages are still in your diary.</AppText>
      </View>
      <Pill large label="Back" onPress={goBack} />
    </Screen>
  );
}

type Note = { tone: 'info' | 'error'; text: string };

/** True while the keyboard is up: the page then gives the room to the text. */
function useKeyboardVisible(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return shown;
}

const hasContent = (e: Pick<DiaryEntry, 'title' | 'body' | 'media' | 'place'>) => !!e.title.trim() || !!e.body.trim() || mediaOf(e).length > 0 || normalizePlace(e.place) !== null;

function PageEditor({ uid, initial, start, goBack }: { uid: string; initial: DiaryEntry | null; start: string | null; goBack: () => void }) {
  const insets = useSafeAreaInsets();
  const bodyRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? start ?? '');
  const [focused, setFocused] = useState(false);
  const [titleFocus, setTitleFocus] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [date] = useState(() => dateLine(initial?.createdAt ?? new Date().toISOString()));
  const { saver, view } = usePageSaver(uid, initial);
  const [leaving, setLeaving] = useState(false);
  const [working, setWorking] = useState<'publish' | 'draft' | null>(null);
  const left = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // A page that has something in it opens READ; a new or empty page opens for writing.
  const [reading, setReading] = useState(() => !!initial && hasContent(initial));
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState<'idle' | 'picking' | 'copying'>('idle');
  const [viewing, setViewing] = useState<number | null>(null);
  const [nameFocus, setNameFocus] = useState(false);
  const keyboard = useKeyboardVisible();
  const say = useCallback((n: Note | null) => { if (alive.current) setNote(n); }, []);
  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(null), 12_000);
    return () => clearTimeout(t);
  }, [note]);

  // Where the caret and the selection are, for the formatting bar. A change made by the bar (or the Return key in a list) puts the
  // caret where it belongs one frame after the new text, and only for a moment: a selection that is always forced fights the typing.
  const [sel, setSel] = useState<Sel>({ start: (initial?.body ?? start ?? '').length, end: (initial?.body ?? start ?? '').length });
  const [forced, setForced] = useState<Sel | null>(() => (!initial && start ? { start: start.length, end: start.length } : null));
  useEffect(() => {
    if (!forced) return undefined;
    const t = setTimeout(() => setForced(null), 500);
    return () => clearTimeout(t);
  }, [forced]);
  const formats = formatsAt(body, sel);

  // Every way of leaving this screen (the Back button, the system's back, the swipe from the edge, the browser's back) is held
  // here while what was typed is not safely on the phone (a write is pending, or the last one failed): it is written first,
  // and then the way out is taken. If it cannot be written the first try stays (the reason is on screen and the words are
  // still in the field) and the next one leaves. When everything is saved nothing is held and the way out is immediate.
  const disablePrevention = usePreventRemove(view.status !== 'saved' && !leaving, ({ repeat }) => {
    void saver.tryLeave().then((answer) => {
      if (answer !== 'leave' || left.current) return;
      left.current = true;
      setLeaving(true);
      repeat();
    });
  });
  const attached = metaLine({ media: view.media, place: view.place ?? undefined });
  const askDelete = () => confirmDelete(pageTitle({ title, body }), async () => {
    setDeleteFailed(false);
    if (await saver.discard()) { setLeaving(true); disablePrevention(); goBack(); }
    else setDeleteFailed(true);
  }, attached !== '');

  // Publish and Save draft: written now, with everything typed, and then back. If it cannot be written the page stays, with the reason on screen
  // (and the page is what it was: a draft that failed to publish is still shown as a draft).
  const finish = async (kind: 'publish' | 'draft') => {
    if (working !== null) return;
    say(null);
    Keyboard.dismiss();
    setWorking(kind);
    try {
      const res = await (kind === 'publish' ? saver.publish() : saver.saveDraft());
      if (res.ok && alive.current) { setLeaving(true); disablePrevention(); goBack(); }
    } finally {
      if (alive.current) setWorking(null);
    }
  };

  const apply = (e: Edit) => {
    setBody(e.text);
    saver.edit({ body: e.text });
    setSel(e.selection);
    requestAnimationFrame(() => { if (alive.current) setForced(e.selection); });
  };
  const typed = (t: string) => {
    // Return in a bullet starts the next bullet; on an empty bullet it ends the list
    const more = continueList(body, t, sel.start === sel.end ? sel.start : undefined, BODY_MAX);
    if (more) { apply(more); return; }
    setBody(t);
    saver.edit({ body: t });
  };
  const format = (action: FormatAction) => {
    say(null);
    let edit: Edit | null = null;
    try {
      edit = action === 'bold' || action === 'italic' ? toggleInline(body, sel, action, BODY_MAX) : toggleBlock(body, sel, action === 'heading' ? 'heading' : action === 'bullet' ? 'bullet' : 'quote', BODY_MAX);
    } catch {
      edit = null; // the page is never touched by a mark that could not be made
    }
    if (edit) { apply(edit); bodyRef.current?.focus(); } else if (body.length >= BODY_MAX - 4) say({ tone: 'info', text: problemMessage('body-too-long') });
  };

  // A note that starts from a passage has its quotation on the screen before anything is typed. It is kept with the first thing that is saved (a word, which carries the
  // whole text, or a photo, which needs the quotation put in first), and a page that was only opened is not saved at all.
  const seeded = useRef(false);
  const seed = () => { if (start && !initial && !seeded.current) { seeded.current = true; saver.edit({ body }); } };

  const addMedia = async () => {
    if (busy !== 'idle') return;
    say(null);
    Keyboard.dismiss();
    if (view.media.length >= MEDIA_PER_PAGE_MAX) { say(attachMessage({ added: 0, refused: [{ reason: 'page-full' }], failed: null })); return; }
    setBusy('picking');
    try {
      const picked = await device.pickMedia(MEDIA_PER_PAGE_MAX - view.media.length);
      if (picked.status === 'unavailable') say({ tone: 'info', text: MEDIA_NEEDS_NEW_APP });
      else if (picked.status === 'error') say({ tone: 'error', text: 'The photo library could not be opened. Please try again.' });
      else if (picked.status === 'picked') {
        if (alive.current) setBusy('copying');
        seed();
        say(attachMessage(await saver.attach(picked.assets)));
      }
    } finally {
      if (alive.current) setBusy('idle');
    }
  };

  const placeFlow = usePlaceFlow((p) => { saver.setPlace(p); say(null); });
  const addPlace = () => { say(null); Keyboard.dismiss(); void placeFlow.start(); };
  const openMaps = async (p: DiaryPlace) => { if (!(await device.openMaps(p))) say({ tone: 'info', text: 'No maps app on this phone could open the place.' }); };
  const openSettings = async () => { if (!(await device.openSettings())) say({ tone: 'info', text: "Open your phone's Settings, then CaminoPlus, and allow location." }); };

  const toggleMode = () => { say(null); Keyboard.dismiss(); setReading((r) => !r); };
  const wasReading = useRef(reading);
  useEffect(() => {
    if (wasReading.current && !reading) requestAnimationFrame(() => bodyRef.current?.focus());
    wasReading.current = reading;
  }, [reading]);

  const problem = view.problem ?? (body.length >= BODY_MAX ? 'body-too-long' : null);
  const caption = view.status === 'saving' ? 'Saving…' : view.status === 'failed' ? 'Not saved' : 'Saved on this phone';
  const canMedia = device.canPickMedia();
  const canPlace = device.canFindPlace();
  const hasAny = !!title.trim() || !!body.trim() || view.media.length > 0 || view.place !== null;
  // What this device cannot do, said once and honestly: the web preview has none of it, an older app lacks one or both.
  const lines = !canMedia && !canPlace ? [Platform.OS === 'web' ? MEDIA_ON_WEB : FEATURES_NEED_NEW_APP] : [!canMedia ? MEDIA_NEEDS_NEW_APP : '', !canPlace ? placeProblemMessage('unsupported') : ''].filter(Boolean);

  // What the buttons are: Publish for a draft (still a draft while it is being published), Done for a published page.
  const footer = pageFooter({ draft: view.draft || working === 'publish', reading, hasContent: hasAny });
  const onPrimary = () => { if (footer.primary === 'Publish') void finish('publish'); else { say(null); Keyboard.dismiss(); goBack(); } };

  const topBar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton name="back" label="Back" onPress={goBack} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {footer.saveDraft && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={SAVE_DRAFT}
            accessibilityHint="Keeps this note as a draft in your Notes and goes back"
            accessibilityState={{ disabled: working !== null, busy: working === 'draft' }}
            disabled={working !== null}
            onPress={() => void finish('draft')}
            style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: role.border, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center', opacity: working !== null ? 0.5 : pressed ? 0.8 : 1 })}
          >
            <AppText variant="label">{SAVE_DRAFT}</AppText>
          </Pressable>
        )}
        {view.stored && <IconButton name="trash" label="Delete this page" onPress={askDelete} />}
      </View>
    </View>
  );

  const dateRow = <AppText variant="small" muted>{dateWithDraft(date, view.draft)}</AppText>;
  const footerRow = <PageFooter footer={footer} busy={working === 'publish'} onToggle={toggleMode} onPrimary={onPrimary} bottom={keyboard ? 0 : insets.bottom} />;

  const messages = (
    <>
      {!!problem && <FormMessage tone={problem === 'body-too-long' ? 'info' : 'error'}>{problemMessage(problem)}</FormMessage>}
      {note !== null && <FormMessage tone={note.tone}>{note.text}</FormMessage>}
      {deleteFailed && <FormMessage>That page could not be deleted. Please try again.</FormMessage>}
    </>
  );
  const captionRow = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}>
      <AppText variant="caption" color={view.status === 'failed' ? role.danger : role.muted}>{caption}</AppText>
      {!reading && body.length >= BODY_MAX - 1000 && <AppText variant="caption" muted>{thousands(body.length)} / {thousands(BODY_MAX)}</AppText>}
    </View>
  );
  const viewer = viewing !== null && (
    <MediaViewer uid={uid} items={view.media} start={viewing} onClose={() => setViewing(null)} onRemove={reading ? undefined : (mid) => saver.removeMedia(mid)} />
  );

  if (reading) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: role.bg }}>
        <Screen tabBar={false}>
          {topBar}
          {dateRow}
          {!!title.trim() && <AppText variant="h3" accessibilityRole="header">{title.trim()}</AppText>}
          {/* A tap on the words opens the page for writing. The Edit button above is the way in for a screen reader: this wrapper is not a
              labelled button of its own, so it cannot hide the words from one. */}
          <Pressable accessible={false} onPress={toggleMode}>
            {body.trim() ? <RichText text={body} /> : <AppText muted>No words on this page yet. Tap to write.</AppText>}
          </Pressable>
          <MediaGrid uid={uid} items={view.media} onOpen={setViewing} />
          {view.place !== null && <PlaceChip place={view.place} onOpen={() => void openMaps(view.place as DiaryPlace)} />}
          {messages}
          {captionRow}
        </Screen>
        {footerRow}
        {viewer}
      </KeyboardAvoidingView>
    );
  }

  // While the keyboard is up the attachments fold into one line (the text keeps the room); a tap on it puts the keyboard away.
  const compact = keyboard && !nameFocus;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: role.bg }}>
      <Screen tabBar={false} scroll={false}>
        <View style={{ flex: 1, gap: 12, paddingBottom: 8 }}>
          {topBar}
          {dateRow}

          <View style={{ flex: 1, minHeight: keyboard ? 96 : 140, backgroundColor: role.surface, borderRadius: radius.lg, borderWidth: 2, borderColor: focused ? c.gold : role.border, overflow: 'hidden' }}>
            <TextInput
              value={title}
              onChangeText={(t) => { setTitle(t); saver.edit({ title: t }); }}
              onFocus={() => { setFocused(true); setTitleFocus(true); }}
              onBlur={() => { setFocused(false); setTitleFocus(false); }}
              onSubmitEditing={() => bodyRef.current?.focus()}
              returnKeyType="next"
              submitBehavior="submit"
              maxLength={TITLE_MAX}
              placeholder="Title (optional)"
              placeholderTextColor={role.muted}
              accessibilityLabel="Page title"
              style={[textStyle('h4'), { color: role.text, minHeight: 64, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 }, noOutline]}
            />
            <View style={{ height: 1, marginHorizontal: 18, backgroundColor: role.border }} />
            <TextInput
              ref={bodyRef}
              value={body}
              onChangeText={typed}
              selection={forced ?? undefined}
              onSelectionChange={(e) => {
                const s = e.nativeEvent.selection;
                setSel(s);
                if (forced && s.start === forced.start && s.end === forced.end) setForced(null);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoFocus={!initial}
              multiline
              maxLength={BODY_MAX}
              placeholder="Write about your day"
              placeholderTextColor={role.muted}
              accessibilityLabel="Page text"
              style={[textStyle('body'), { flex: 1, color: role.text, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18, textAlignVertical: 'top' }, noOutline]}
            />
            {/* The marks and the photo and the pin are inside the text box, at the bottom of it, not on a bar of their own above the keyboard. */}
            <FormatBar formats={formats} formatsOff={titleFocus} onFormat={format} onMedia={canMedia ? () => void addMedia() : undefined} onPlace={canPlace ? addPlace : undefined} mediaBusy={busy !== 'idle'} hasPlace={view.place !== null} />
          </View>

          {compact && attached !== '' && (
            <Pressable accessibilityRole="button" accessibilityLabel={`On this page: ${attached}. Shows them`} onPress={() => Keyboard.dismiss()} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="image" color={role.muted} size={20} />
              <AppText variant="small" muted numberOfLines={1} style={{ flex: 1 }}>{attached}</AppText>
            </Pressable>
          )}
          {!compact && (
            // Under the text: the files, the place, the steps of adding one. When the screen is short this part shrinks and scrolls,
            // so the text keeps its room and the messages and the caption below it are never pushed off the screen.
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <MediaStrip uid={uid} items={view.media} adding={busy === 'copying'} onOpen={setViewing} onRemove={(mid) => saver.removeMedia(mid)} />
              {view.place !== null && (
                <PlaceEditRow key={`${view.place.lat},${view.place.lon},${view.place.at}`} place={view.place} onOpen={() => void openMaps(view.place as DiaryPlace)} onRemove={() => saver.setPlace(null)} onFocusChange={setNameFocus} onName={(name) => saver.setPlace(withName(view.place as DiaryPlace, name), { soon: true })} />
              )}
              <PlacePanel flow={placeFlow.flow} onContinue={() => void placeFlow.confirm()} onClose={placeFlow.close} onSettings={() => void openSettings()} />
              {!hasAny && (canMedia || canPlace) && <AppText variant="small" muted>Tap the picture or the pin below to add photos, videos and where you are.</AppText>}
              {lines.map((l) => <AppText key={l} variant="small" muted>{l}</AppText>)}
            </ScrollView>
          )}
          {messages}
          {captionRow}
        </View>
      </Screen>
      {footerRow}
      {viewer}
    </KeyboardAvoidingView>
  );
}
