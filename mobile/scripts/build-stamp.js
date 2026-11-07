// Which code is this build made from? app.config.js puts the answer into the app (Settings > This build shows it, so
// nobody has to guess what code a phone runs), and plain-node tests check it: npm run test:config.
const { execFileSync } = require('node:child_process');

const SHA = /^[0-9a-f]{7,40}$/i;

function git(args, run) {
  try {
    return String(run('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 })).trim();
  } catch {
    return '';
  }
}

/**
 * The commit this bundle is made from, in this order of trust:
 *   1. the checkout we are in (git); it also tells whether there are uncommitted changes;
 *   2. EAS Build: the workers get the code without a .git folder but pass the commit in EAS_BUILD_GIT_COMMIT_HASH;
 *   3. GitHub Actions: GITHUB_SHA;
 *   4. unknown. A commit is never invented.
 */
function buildStamp(env = process.env, run = execFileSync, now = new Date()) {
  const builtAt = now.toISOString();
  const sha = git(['rev-parse', 'HEAD'], run);
  if (SHA.test(sha)) {
    return { sha, shortSha: sha.slice(0, 7), dirty: git(['status', '--porcelain'], run) !== '', committedAt: git(['log', '-1', '--format=%cI'], run), builtAt, source: 'git' };
  }
  const eas = env.EAS_BUILD_GIT_COMMIT_HASH || '';
  const fromEnv = SHA.test(eas) ? eas : SHA.test(env.GITHUB_SHA || '') ? env.GITHUB_SHA : '';
  if (fromEnv) {
    return { sha: fromEnv, shortSha: fromEnv.slice(0, 7), dirty: false, committedAt: '', builtAt, source: fromEnv === eas ? 'eas-build' : 'ci' };
  }
  return { sha: '', shortSha: '', dirty: false, committedAt: '', builtAt, source: 'unknown' };
}

module.exports = { buildStamp };
