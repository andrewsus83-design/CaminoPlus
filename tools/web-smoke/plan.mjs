// What the sweep covers, as a list of checks. No browser here, so test/plan.test.mjs can look at the plan itself.
import { PERSONAS } from './routes.mjs';

export const SCHEMES = ['light', 'dark'];

/**
 * Screens that send the person somewhere else on purpose when they are opened. Every other route must still be on its own address once it has
 * settled: a screen that ends elsewhere was bounced by a guard (so the test never saw it) or by a bug. Each entry says why; to add a screen that
 * redirects by design, add it here with its reason.
 *   route     the route pattern (as printed by `npm run smoke -- --list`)
 *   personas  the account states in which it redirects (default: all)
 */
export const EXPECTED_REDIRECTS = [
  { route: '/', reason: 'the entry point: it sends each account state to its home (the Launch scenarios check where)' },
  { route: '/auth-callback', personas: ['new', 'in'], reason: 'someone who is already signed in and opens the link page without a usable link is sent on into the app (app/auth-callback.tsx: "carry on")' },
];

export function redirectAllowed(pattern, persona, list = EXPECTED_REDIRECTS) {
  return list.some((r) => r.route === pattern && (!r.personas || r.personas.includes(persona)));
}

/** "/stay/[id] (/stay/st1)" when the sample differs from the pattern, else "/me". */
export const routeName = (r) => (r.url === r.pattern ? r.pattern : `${r.pattern} (${r.url})`);

/**
 * Every route in every account state that can reach it, in light and dark, online and offline, with a full account (every list has rows).
 * Signed-in states are also swept with an EMPTY account (nothing but the account and the journey: no days, stamps, posts, friends, stays)
 * because a screen can break on a list with nothing in it. Scheme changes colours, not data, so the empty account is swept in light only.
 * Then the scenarios, in light and dark (a scenario may narrow that with `schemes`, and may ask for offline, an expired login, or no saved account).
 */
export function buildTasks({ routes, scenarios, only = null }) {
  const tasks = [];
  const add = (route, persona, scheme, offline, data) => tasks.push({
    type: 'route', route, persona, scheme, offline, data,
    label: `${routeName(route)}  [${scheme}, ${offline ? 'offline' : 'online'}, ${PERSONAS[persona].label}${data === 'empty' ? ', empty account' : ''}]`,
  });
  for (const route of routes) {
    for (const persona of route.personas) {
      for (const scheme of SCHEMES) for (const offline of [false, true]) add(route, persona, scheme, offline, 'full');
      if (persona !== 'out') for (const offline of [false, true]) add(route, persona, 'light', offline, 'empty');
    }
  }
  for (const scenario of scenarios) {
    for (const scheme of scenario.schemes ?? SCHEMES) {
      tasks.push({
        type: 'scenario', scenario, persona: scenario.persona, scheme, offline: !!scenario.offline, expiredLogin: !!scenario.expiredLogin, savedAccount: scenario.savedAccount,
        label: `scenario "${scenario.name}"  [${scheme}, ${scenario.offline ? 'offline' : 'online'}, ${PERSONAS[scenario.persona].label}]`,
      });
    }
  }
  const q = only && only.toLowerCase();
  return q ? tasks.filter((t) => t.label.toLowerCase().includes(q)) : tasks;
}
