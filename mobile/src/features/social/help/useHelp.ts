// Everything the help sheet shows and does: the position, who gets the message, the confirmation, sending
// through the chat outbox, the per-chat status, "Send my position again", "I am OK now", sharing and the 112 call.
// The sheet is a thin view over this hook. Decisions live in ./logic (plain node tests).
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Linking, Share } from 'react-native';
import { copyText } from '@/lib/clipboard';
import { socialApi } from '../api';
import { newId } from '../logic';
import { getOutbox, retryItem, subscribeOutbox } from '../outbox';
import { useMeId, useOnlineStatus } from '../hooks/base';
import { getAlert, loadAlert, noteArrived, setAlert, subscribeAlert } from './alertStore';
import { deliver } from './deliver';
import {
  EMERGENCY_URL, HELP_OK, OK_MIN_GAP_MS, addOk, addRing, buildHelpMessage, deliveryRows, helpWaitMs, isAlertActive, lastHelpAt, lastOkAt,
  recipientKey, replaceSend, ringBlocker, splitByRateLimit, summarizeDeliveries, waitSeconds,
  type FixSource, type HelpFix, type HelpPosition, type Recipient,
} from './logic';
import { useTick, usePosition } from './usePosition';
import { useRecipients } from './useRecipients';

export type HelpView = 'compose' | 'confirm' | 'sent';
type Busy = 'ring' | 'resend' | 'ok' | null;

/** What the confirmation shows is frozen here: exactly this text goes to exactly these chats. */
export type Pending = { text: string; fix: HelpFix; source: FixSource | null; recipients: Recipient[]; skipped: { name: string; waitMs: number }[] };

type Options = { visible: boolean; position?: HelpPosition | null; placeText?: string | null };

/** `visible` = the sheet is open: only then the phone looks for a position and loads friends and chats.
 *  Without options the hook is passive (no GPS, no network): enough to know whether a bell is active. */
export function useHelp({ visible, position: supplied, placeText }: Options = { visible: false }) {
  const uid = useMeId();
  const online = useOnlineStatus();
  const outbox = useSyncExternalStore(subscribeOutbox, getOutbox, getOutbox);
  const alert = useSyncExternalStore(subscribeAlert, getAlert, getAlert);
  const now = useTick(visible);
  const position = usePosition(visible, supplied);
  const people = useRecipients(visible, uid);
  const [view, setView] = useState<HelpView>('compose');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [feedback, setFeedback] = useState<string | null>(null); // one inline line under the buttons
  const busyRef = useRef<Busy>(null);
  const asked = useRef(new Set<string>());

  useEffect(() => { void loadAlert(uid); }, [uid]);

  // Opening the sheet: a bell rung a little while ago (and not answered with "I am OK now") comes first.
  useEffect(() => {
    if (!visible) return;
    setPending(null);
    setFeedback(null);
    setView(isAlertActive(getAlert(), Date.now()) ? 'sent' : 'compose');
  }, [visible]);

  const run = useCallback(async (kind: Exclude<Busy, null>, job: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = kind;
    setBusy(kind);
    setFeedback(null);
    try {
      await job();
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, []);

  const textFor = useCallback((fix: HelpFix) => buildHelpMessage({ fix, place: placeText }), [placeText]);

  /* ------------------------------------------------ ring: confirmation first, then send */

  const waits = useMemo(() => splitByRateLimit(people.chosen, lastHelpAt(alert), now).waiting.map((w) => w.waitMs), [people.chosen, alert, now]);
  const allWaiting = people.chosen.length > 0 && waits.length === people.chosen.length;
  const blocker = ringBlocker({ chosen: people.chosen.length, hasFix: !!position.fix, locating: position.status === 'locating', waitMs: allWaiting ? Math.min(...waits) : 0 });

  const askToRing = useCallback(() => {
    const fix = position.fix;
    if (!fix || blocker) return;
    const t = Date.now();
    const { allowed, waiting } = splitByRateLimit(people.chosen, lastHelpAt(getAlert()), t);
    if (allowed.length === 0) return;
    setPending({ text: textFor(fix), fix, source: position.source, recipients: allowed, skipped: waiting.map((w) => ({ name: w.item.name, waitMs: w.waitMs })) });
    setFeedback(null);
    setView('confirm');
  }, [position.fix, position.source, blocker, people.chosen, textFor]);

  const cancelRing = useCallback(() => { setPending(null); setView('compose'); }, []);

  const confirmRing = useCallback(() => run('ring', async () => {
    if (!pending || !uid) return;
    const t = Date.now();
    // The confirmation may have been open for a while: look at the rate limit again at the moment of sending.
    const { allowed } = splitByRateLimit(pending.recipients, lastHelpAt(getAlert()), t);
    if (allowed.length === 0) { setPending(null); setView('compose'); setFeedback('Those chats just got a help message. Wait a minute before sending again.'); return; }
    const done = await deliver({ uid, recipients: allowed, body: pending.text, kind: 'help', now: t });
    const learned = allowed.map((r) => (r.kind === 'friend' && done.chats[r.id] ? { ...r, chatId: done.chats[r.id] } : r));
    setAlert(addRing(getAlert(), { now: t, id: newId(), recipients: learned, sends: done.sends }));
    await people.remember(done.chats);
    setPending(null);
    setView('sent');
  }), [run, pending, uid, people]);

  /* ------------------------------------------------ after ringing */

  const rows = useMemo(() => (alert ? deliveryRows(alert, outbox) : []), [alert, outbox]);
  const summary = summarizeDeliveries(rows);
  const closed = alert?.okAt != null;
  const active = isAlertActive(alert, now);
  const resendWaitMs = alert ? Math.max(0, ...splitByRateLimit(alert.recipients, lastHelpAt(alert), now).waiting.map((w) => w.waitMs)) : 0;
  const resendBlocked = !!alert && alert.recipients.length > 0 && splitByRateLimit(alert.recipients, lastHelpAt(alert), now).allowed.length === 0;

  /** A new fix, then the same message with the new position to the same chats (not more often than once a minute per chat). */
  const resend = useCallback(() => run('resend', async () => {
    const a = getAlert();
    if (!a || !uid) return;
    const fix = await position.locateFresh();
    if (!fix) { setFeedback('Your phone has no new position yet. Try again in a moment.'); return; }
    const t = Date.now();
    const { allowed, waiting } = splitByRateLimit(a.recipients, lastHelpAt(a), t);
    if (allowed.length === 0) { setFeedback(`You can send again in ${waitSeconds(Math.max(...waiting.map((w) => w.waitMs)))} s.`); return; }
    const done = await deliver({ uid, recipients: allowed, body: textFor(fix), kind: 'help', now: t });
    setAlert(addRing(getAlert(), { now: t, id: newId(), recipients: allowed.map((r) => (r.kind === 'friend' && done.chats[r.id] ? { ...r, chatId: done.chats[r.id] } : r)), sends: done.sends }));
  }), [run, uid, position, textFor]);

  /** "I am OK now" to everyone who was told. Never held back by the one-a-minute rule, only against a double tap. */
  const sayOk = useCallback(() => run('ok', async () => {
    const a = getAlert();
    if (!a || !uid) return;
    const t = Date.now();
    const told = new Set(a.sends.filter((s) => s.kind === 'help' && s.messageId).map((s) => s.recipientKey));
    const recent = lastOkAt(a);
    const targets = a.recipients.filter((r) => told.has(recipientKey(r)) && helpWaitMs(r.chatId ? recent[r.chatId] : undefined, t, OK_MIN_GAP_MS) === 0);
    const done = await deliver({ uid, recipients: targets, body: HELP_OK, kind: 'ok', now: t });
    const recipients = a.recipients.map((r) => (r.kind === 'friend' && done.chats[r.id] ? { ...r, chatId: done.chats[r.id] } : r));
    setAlert(addOk({ ...a, recipients }, { now: t, sends: done.sends }));
  }), [run, uid]);

  /** "Try again" on one row: the outbox item is sent again, or the chat is started again. */
  const retry = useCallback(async (sendId: string) => {
    const a = getAlert();
    const s = a?.sends.find((x) => x.id === sendId);
    if (!a || !s || !uid || a.okAt != null) return;
    if (s.messageId && getOutbox().some((i) => i.id === s.messageId && i.status === 'failed')) { retryItem(s.messageId); return; }
    const r = a.recipients.find((x) => recipientKey(x) === s.recipientKey);
    if (!r) return;
    const done = await deliver({ uid, recipients: [r], body: s.body, kind: s.kind, now: Date.now() });
    const again = done.sends[0];
    if (again) setAlert(replaceSend(getAlert() ?? a, s.id, again));
  }, [uid]);

  // Messages that left the outbox without the app seeing them arrive (after a restart): ask the server once.
  useEffect(() => {
    if (!visible || !online || !alert) return;
    const ids = rows.flatMap((r) => (r.delivery?.state === 'unknown' && r.send?.messageId && !asked.current.has(r.send.messageId) ? [r.send.messageId] : []));
    if (ids.length === 0) return;
    ids.forEach((id) => asked.current.add(id));
    socialApi.getMessages(ids).then((found) => noteArrived(found.map((m) => m.id))).catch(() => ids.forEach((id) => asked.current.delete(id)));
  }, [visible, online, alert, rows]);

  /* ------------------------------------------------ share and call */

  const share = useCallback(async () => {
    const fix = position.fix;
    const text = fix ? textFor(fix) : getAlert()?.sends.filter((s) => s.kind === 'help').pop()?.body;
    if (!text) return;
    setFeedback(null);
    try {
      await Share.share({ message: text });
    } catch {
      setFeedback((await copyText(text)) ? 'Sharing is not available here. The message was copied: paste it into an SMS or WhatsApp.' : 'Sharing is not available on this device.');
    }
  }, [position.fix, textFor]);

  const call112 = useCallback(async () => {
    setFeedback(null);
    try {
      await Linking.openURL(EMERGENCY_URL);
    } catch {
      setFeedback('This phone could not open the dialer. Dial 112 on its keypad.');
    }
  }, []);

  const openSettings = useCallback(() => { void Linking.openSettings().catch(() => setFeedback('Open your phone settings and allow location for CaminoPlus.')); }, []);

  return {
    uid, online, now, view, setView, position, people, feedback,
    busy, blocker, askToRing, cancelRing, confirmRing, pending, text: position.fix ? textFor(position.fix) : null,
    alert, rows, summary, closed, active, resend, resendWaitMs, resendBlocked, sayOk, retry,
    share, call112, openSettings,
  };
}
