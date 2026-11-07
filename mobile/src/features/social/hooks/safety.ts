// Report and block, for a person or for a piece of content, with the same sheets and the same words
// everywhere. A screen that already has useDialogs() hands it in, so there is still one dialog host:
//
//   const dialogs = useDialogs();
//   const safety = useSafety(dialogs);
//   ...
//   await safety.report({ type: 'post', targetId: post.id, title: 'Report this post' }); // the feed, the journey viewer
//   await safety.reportPerson({ id: author.id, name: author.name });
//   if (await safety.block({ id: author.id, name: author.name })) hideTheirThings();
//
// reportContent() is the same report without any screen, for a menu that has its own sheet.
import { useCallback, useMemo } from 'react';
import { socialApi } from '../api';
import type { useDialogs } from '../components/dialogs';
import { REPORT_PROMPT, REPORT_REASONS, REPORT_THANKS, blockMessage, friendlyError } from '../logic';
import type { ReportReason, ReportTarget } from '../types';

type Dialogs = Pick<ReturnType<typeof useDialogs>, 'confirm' | 'menu' | 'toast'>;

/** A person as the safety sheets need them: who to act on and the name to say. */
export type Who = { id: string; name: string };

/** Send one report. Resolves to an error text, or null when it went through (a second report of the same thing
 *  counts as sent). Works for a message, a person ('profile'), a post and a comment. */
export const reportContent = (type: ReportTarget, targetId: string, reason: ReportReason, details?: string): Promise<string | null> =>
  socialApi.report({ type, targetId, reason, details }).then(() => null, (e) => friendlyError(e, 'Could not send your report.'));

export function useSafety({ confirm, menu, toast }: Dialogs) {
  /** Ask what is wrong (the reasons of the chat), send the report and say thank you. true when it was sent. */
  const report = useCallback(async (o: { type: ReportTarget; targetId: string; title: string; message?: string }): Promise<boolean> => {
    const reason = await menu({ title: o.title, message: o.message ?? REPORT_PROMPT, options: REPORT_REASONS.map((r) => ({ key: r.key, label: r.label })) });
    if (!reason) return false;
    const err = await reportContent(o.type, o.targetId, reason as ReportReason);
    toast(err ?? REPORT_THANKS);
    return !err;
  }, [menu, toast]);

  const reportPerson = useCallback((who: Who) => report({ type: 'profile', targetId: who.id, title: `Report ${who.name}` }), [report]);

  /** Say what blocking does, block, and say it is done. true when the pilgrim is blocked now. */
  const block = useCallback(async (who: Who): Promise<boolean> => {
    const ok = await confirm({ title: `Block ${who.name}?`, message: blockMessage(who.name), confirmLabel: 'Block', destructive: true, icon: 'block' });
    if (!ok) return false;
    try {
      await socialApi.block(who.id);
      toast(`${who.name} is blocked.`);
      return true;
    } catch (e) {
      toast(friendlyError(e, 'Could not block this pilgrim.'));
      return false;
    }
  }, [confirm, toast]);

  return useMemo(() => ({ report, reportPerson, block }), [report, reportPerson, block]);
}
