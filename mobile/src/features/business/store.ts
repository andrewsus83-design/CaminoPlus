import { useSyncExternalStore } from 'react';
import { Draft, emptyDraft } from '@/data/business';

// Tiny in-memory store for the owner's registration. Later: SQLite draft
// synced to business_listings via the offline outbox.
export type OwnerState = 'none' | 'draft' | 'in_review' | 'changes_requested' | 'live';

type State = { state: OwnerState; draft: Draft; stepsDone: number; savedAt: number | null; feedCardHidden: boolean };

let s: State = { state: 'none', draft: emptyDraft, stepsDone: 0, savedAt: null, feedCardHidden: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const ownerStore = {
  get: () => s,
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  saveDraft(draft: Draft, stepsDone: number) {
    s = { ...s, draft, stepsDone: Math.max(s.stepsDone, stepsDone), savedAt: Date.now(), state: s.state === 'none' ? 'draft' : s.state };
    emit();
  },
  submit() { s = { ...s, state: 'in_review' }; emit(); },
  setState(state: OwnerState) { s = { ...s, state }; emit(); },
  hideFeedCard() { s = { ...s, feedCardHidden: true }; emit(); },
};

export function useOwner() {
  return useSyncExternalStore(ownerStore.subscribe, ownerStore.get, ownerStore.get);
}
