// What a phone is running, in words: the app version, the commit and time its code was made from, and which over-the-air
// update (if any) is on top of what was installed. Pure, so plain node tests it (npm run test:lib). The phone's own
// values are read in useBuildInfo.ts. Where the stamp comes from: scripts/build-stamp.js and app.config.js.

export type BuildStamp = { sha: string; shortSha: string; dirty: boolean; committedAt: string; builtAt: string; source: string };

export type BuildInput = {
  version: string;
  stamp: Partial<BuildStamp> | null | undefined;
  updatesEnabled: boolean;
  /** true while the phone runs the code that came inside the installed app, false once an update was downloaded */
  embedded: boolean;
  updateId: string | null;
  channel: string | null;
  platform: string;
};

export type BuildText = { title: string; code: string; update: string; copy: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "7 Nov 2026, 14:05 UTC" from an ISO time, or '' when it is not a time. Always UTC, so every phone says the same. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

export function describeBuild(i: BuildInput): BuildText {
  const s = i.stamp ?? {};
  const sha = s.shortSha || (s.sha ? s.sha.slice(0, 7) : '');
  const committed = formatWhen(s.committedAt);
  const built = formatWhen(s.builtAt);
  const when = committed ? ` · committed ${committed}` : built ? ` · built ${built}` : '';
  const title = `CaminoPlus ${i.version}`;
  const code = sha ? `Build ${sha}${s.dirty ? ' + local changes' : ''}${when}` : 'Build: commit unknown';
  const channel = i.channel ? ` · channel ${i.channel}` : '';
  const update = !i.updatesEnabled
    ? 'Updates: off in this build'
    : i.embedded || !i.updateId
      ? `Update: none yet, this is the installed version${channel}`
      : `Update ${i.updateId.slice(0, 8)}${channel}`;
  return { title, code, update, copy: [title, code, update, `Platform: ${i.platform}`].join('\n') };
}
