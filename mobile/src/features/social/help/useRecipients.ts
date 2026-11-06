// Who the help message goes to: my friends and the groups I am in, chosen with checkmarks and a search. The last
// choice is remembered per account (u.<id>.help.recipients), so next time it is one tap, also without a connection.
// The first time nothing is chosen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localStore, userKey } from '@/lib/localStore';
import { socialApi } from '../api';
import { createLatestGate, friendlyError, sortByName } from '../logic';
import type { Conversation, Friend } from '../types';
import {
  MAX_RECIPIENTS, allFriendsChosen, buildPickerRows, friendRecipient, packRecipients, parseSavedRecipients, reconcileRecipients,
  setFriendsChosen, toggleRecipient, type Recipient,
} from './logic';

const NAME = 'help.recipients';
export const LIMIT_TEXT = `You can choose up to ${MAX_RECIPIENTS} chats at a time.`;

export function useRecipients(visible: boolean, uid: string | null) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosenState] = useState<Recipient[]>([]);
  const [query, setQuery] = useState('');
  const [limited, setLimited] = useState(false);
  const chosenRef = useRef<Recipient[]>([]);
  const gate = useRef(createLatestGate()).current;

  const setChosen = useCallback((list: Recipient[]) => {
    chosenRef.current = list;
    setChosenState(list);
  }, []);

  const load = useCallback(async () => {
    if (!uid) return;
    const current = gate.next();
    setLoading(true);
    const [f, c] = await Promise.allSettled([socialApi.listFriends(), socialApi.listConversations(null)]);
    if (!current()) return;
    const friendList = f.status === 'fulfilled' ? sortByName(f.value) : null;
    const convList = c.status === 'fulfilled' ? c.value : null;
    // A list that did not load keeps what we had (this session) or falls back to the remembered choice.
    if (friendList) setFriends(friendList);
    if (convList) setConvs(convList);
    setChosen(reconcileRecipients(chosenRef.current, friendList, convList));
    const failure = f.status === 'rejected' ? f.reason : c.status === 'rejected' ? c.reason : null;
    setError(failure ? friendlyError(failure, 'Could not load your friends and chats.') : null);
    setLoading(false);
  }, [uid, gate, setChosen]);

  useEffect(() => {
    if (!visible || !uid) return;
    let live = true;
    setQuery('');
    setLimited(false);
    void (async () => {
      const saved = parseSavedRecipients(await localStore.getJSON(userKey(uid, NAME)));
      if (!live) return;
      setChosen(saved);
      await load();
    })();
    return () => { live = false; gate.invalidate(); };
  }, [visible, uid, load, gate, setChosen]);

  const friendRecipients = useMemo(() => (friends ?? []).map((f) => friendRecipient(f, convs)), [friends, convs]);
  const rows = useMemo(() => buildPickerRows({ friends, convs, chosen, query }), [friends, convs, chosen, query]);

  const toggle = useCallback((r: Recipient) => {
    const res = toggleRecipient(chosenRef.current, r);
    setChosen(res.list);
    setLimited(res.limited);
  }, [setChosen]);

  const chooseAllFriends = useCallback((on: boolean) => {
    const res = setFriendsChosen(chosenRef.current, friendRecipients, on);
    setChosen(res.list);
    setLimited(res.limited);
  }, [friendRecipients, setChosen]);

  /** Remember this choice for next time, with the chat ids learned while sending. */
  const remember = useCallback(async (learned: Record<string, string> = {}) => {
    if (!uid) return;
    const list = chosenRef.current.map((r) => (r.kind === 'friend' && learned[r.id] ? { ...r, chatId: learned[r.id] } : r));
    setChosen(list);
    await localStore.setJSON(userKey(uid, NAME), packRecipients(list));
  }, [uid, setChosen]);

  return {
    friends, convs, loading, error, retry: load,
    chosen, rows, query, setQuery, limited, toggle, chooseAllFriends, remember,
    allFriends: allFriendsChosen(chosen, friendRecipients), friendCount: friends?.length ?? rows.friends.length,
    anyPeople: (friends?.length ?? 0) > 0 || (convs ?? []).some((c) => c.kind === 'group') || chosen.length > 0,
  };
}
