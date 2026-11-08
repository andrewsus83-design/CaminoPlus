import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Post } from '@/lib/api';
import { refreshUnreadTotals, socialApi, useMeId } from '@/features/social';
import { createLatestGate, friendlyError } from '../social/logic';
import type { FriendStatus } from '../social/types';
import { fetchJourney, fetchPilgrim, fetchRelation } from './api';
import { type JourneysRead, type LoadError, type Pilgrim, type PilgrimView, isMinimal, isPilgrimId, pilgrimView, sameId, toLoadError } from './logic';

export type FriendActionKind = 'add' | 'cancel' | 'accept' | 'decline' | 'unfriend';

/**
 * The profile of one pilgrim and their journey: the card, where I stand with them, and the posts I may see. It reads three things from the database
 * (api.ts), builds the one state the screen is in (logic.ts, pilgrimView) and runs the friend actions. The newest answer wins: when the screen is
 * opened on another pilgrim, an answer for the earlier one is dropped. A reload that fails (after an action, or with no signal) leaves what is on the
 * screen where it is, and says so in `refreshError`, instead of replacing a profile with an error.
 */
export function usePilgrim(id: unknown) {
  const me = useMeId();
  const [profile, setProfile] = useState<Pilgrim | null | undefined>(undefined);
  const [relation, setRelation] = useState<FriendStatus | undefined>(undefined);
  const [journeys, setJourneys] = useState<JourneysRead<Post> | undefined>(undefined);
  const [error, setError] = useState<LoadError | null>(null);
  const [refreshError, setRefreshError] = useState<LoadError | null>(null);
  const [busy, setBusy] = useState(false);
  const gate = useRef(createLatestGate()).current;
  const loaded = useRef(false);

  const load = useCallback(async () => {
    if (!me || !isPilgrimId(id) || sameId(id, me)) return;
    const current = gate.next();
    try {
      const [p, r] = await Promise.all([fetchPilgrim(id), fetchRelation(me, id)]);
      if (!current()) return;
      loaded.current = true;
      setProfile(p);
      setRelation(r);
      setError(null);
      setRefreshError(null);
      if (!p || isMinimal(p, r)) { setJourneys(undefined); return; }
      setJourneys((j) => j ?? { status: 'loading' });
      try {
        const posts = await fetchJourney(p.id);
        if (current()) setJourneys({ status: 'ready', posts });
      } catch (e) {
        if (current()) setJourneys((j) => (j?.status === 'ready' ? j : { status: 'error', error: toLoadError(e, 'Could not load this journey.') }));
      }
    } catch (e) {
      if (!current()) return;
      const err = toLoadError(e, 'Could not load this profile.');
      if (loaded.current) setRefreshError(err); // something is on the screen already: keep it
      else setError(err);
    }
  }, [id, me, gate]);

  // A new pilgrim, or a new person signed in: start from nothing.
  useEffect(() => {
    gate.invalidate();
    loaded.current = false;
    setProfile(undefined);
    setRelation(undefined);
    setJourneys(undefined);
    setError(null);
    setRefreshError(null);
    void load();
  }, [load, gate]);

  const retry = useCallback(() => {
    setError(null);
    setRefreshError(null);
    void load();
  }, [load]);

  const view: PilgrimView<Post> = useMemo(() => pilgrimView<Post>({ id, me, profile, relation, error, journeys }), [id, me, profile, relation, error, journeys]);

  /** Run a friend action. Resolves to a sentence when it did not work, or null when it did (the card then reloads: what I may see can change with it). */
  const act = useCallback(async (kind: FriendActionKind): Promise<string | null> => {
    if (!isPilgrimId(id)) return null;
    setBusy(true);
    try {
      if (kind === 'add') await socialApi.sendFriendRequest(id);
      else if (kind === 'cancel') await socialApi.cancelFriendRequest(id);
      else if (kind === 'accept') await socialApi.respondFriendRequest(id, true);
      else if (kind === 'decline') await socialApi.respondFriendRequest(id, false);
      else await socialApi.removeFriend(id);
      void refreshUnreadTotals();
      await load();
      return null;
    } catch (e) {
      return friendlyError(e, 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [id, load]);

  return { view, me, busy, act, reload: load, retry, refreshError };
}
