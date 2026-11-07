import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { IconButton } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { confirmDelete } from '@/features/diary/confirm';
import { dateLine, pageTitle, problemMessage, thousands } from '@/features/diary/present';
import { BODY_MAX, TITLE_MAX, type DiaryEntry } from '@/features/diary/store';
import { NEW_PAGE, useDiaryPage, usePageSaver } from '@/features/diary/useDiary';
import { c, radius, role, textStyle } from '@/theme';

// Browsers draw their own outline inside a text field; the border of the page (gold while writing) shows the focus instead.
// Web only: native rejects the value.
const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as object | null;

// One diary page. [id] is a saved page's id, or "new" for a blank page. The text is written as it is typed
// (src/features/diary/autosave.ts) and again whenever the person leaves, so there is no Save button.
export default function DiaryPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const page = useDiaryPage(id);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/library'));

  if (page.state === 'missing') return <NotHere goBack={goBack} />;
  if (page.state === 'loading') return <Screen tabBar={false}><IconButton name="back" label="Back" onPress={goBack} /></Screen>;
  return <PageEditor key={page.entry?.id ?? NEW_PAGE} uid={page.uid} initial={page.entry} goBack={goBack} />;
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

function PageEditor({ uid, initial, goBack }: { uid: string; initial: DiaryEntry | null; goBack: () => void }) {
  const insets = useSafeAreaInsets();
  const bodyRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [focused, setFocused] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [date] = useState(() => dateLine(initial?.createdAt ?? new Date().toISOString()));
  const { saver, view } = usePageSaver(uid, initial);
  const warned = useRef(false);

  // Back writes first and leaves when everything typed is on the phone. If it cannot be written the message is already on
  // screen (and the words are still in the field): the first Back stays, a second one leaves anyway.
  const leave = async () => {
    const res = await saver.flush();
    if (res.ok || warned.current) return goBack();
    warned.current = true;
  };
  const askDelete = () => confirmDelete(pageTitle({ title, body }), async () => {
    setDeleteFailed(false);
    if (await saver.discard()) goBack();
    else setDeleteFailed(true);
  });

  const problem = view.problem ?? (body.length >= BODY_MAX ? 'body-too-long' : null);
  const caption = view.status === 'saving' ? 'Saving…' : view.status === 'failed' ? 'Not saved' : 'Saved on this phone';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: role.bg }}>
      <Screen tabBar={false} scroll={false}>
        <View style={{ flex: 1, gap: 12, paddingBottom: Math.max(insets.bottom, 12) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <IconButton name="back" label="Back" onPress={() => void leave()} />
            {view.stored && <IconButton name="trash" label="Delete this page" onPress={askDelete} />}
          </View>
          <AppText variant="small" muted>{date}</AppText>

          <View style={{ flex: 1, backgroundColor: role.surface, borderRadius: radius.lg, borderWidth: 2, borderColor: focused ? c.gold : role.border, overflow: 'hidden' }}>
            <TextInput
              value={title}
              onChangeText={(t) => { setTitle(t); saver.edit({ title: t }); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={() => bodyRef.current?.focus()}
              returnKeyType="next"
              submitBehavior="submit"
              maxLength={TITLE_MAX}
              placeholder="Title (optional)"
              placeholderTextColor={role.placeholder}
              accessibilityLabel="Page title"
              style={[textStyle('h4'), { color: role.text, minHeight: 64, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 }, noOutline]}
            />
            <View style={{ height: 1, marginHorizontal: 18, backgroundColor: role.border }} />
            <TextInput
              ref={bodyRef}
              value={body}
              onChangeText={(t) => { setBody(t); saver.edit({ body: t }); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoFocus={!initial}
              multiline
              maxLength={BODY_MAX}
              placeholder="Write about your day"
              placeholderTextColor={role.placeholder}
              accessibilityLabel="Page text"
              style={[textStyle('body'), { flex: 1, color: role.text, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18, textAlignVertical: 'top' }, noOutline]}
            />
          </View>

          {!!problem && <FormMessage tone={problem === 'body-too-long' ? 'info' : 'error'}>{problemMessage(problem)}</FormMessage>}
          {deleteFailed && <FormMessage>That page could not be deleted. Please try again.</FormMessage>}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}>
            <AppText variant="caption" color={view.status === 'failed' ? role.danger : role.muted}>{caption}</AppText>
            {body.length >= BODY_MAX - 1000 && <AppText variant="caption" muted>{thousands(body.length)} / {thousands(BODY_MAX)}</AppText>}
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
