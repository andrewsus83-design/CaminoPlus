// Scenarios of share links (mobile/src/lib/shareLinks.ts, components/ShareLinkSheet.tsx, app/shared-links.tsx). scenarios.mjs adds them to its own
// list, so they run in light and in dark with everything else. What a person sees and does:
//
//   share a plan   Me > Plan > Share plan link: a question that says what the link shows, what it does not, and that anyone with the link can see it
//                  until you stop sharing it; "Also show where I sleep" is off until ticked; Make link sends exactly the plan of the journey and that option,
//                  and the phone's share sheet gets the link on the website's /s page with the token after '#'. Cancel makes nothing.
//   shared links   Settings > Privacy and safety > Shared links: each link with its state and how often it was opened; Stop sharing asks first, and only Yes
//                  stops it (revoke_share_link with that id); a stopped link has no button
import assert from 'node:assert/strict';
import { JOURNEY, SHARE_LINKS, SHARE_TOKEN } from './fixtures.mjs';
import { eventually, pathOf } from './harness.mjs';

const seen = (page, t) => page.getByText(t, { exact: true }).filter({ visible: true }).first();
const button = (page, name) => page.getByRole('button', { name, exact: true });

/** The calls the app makes to one database function, with their bodies. */
async function watchRpc(page, fn) {
  const bodies = [];
  page.on('request', (r) => { if (r.url().endsWith(`/rest/v1/rpc/${fn}`) && r.method() === 'POST') bodies.push(r.postDataJSON()); });
  return bodies;
}

export const SHARE_SCENARIOS = [
  {
    name: 'Share plan link: Me > Plan asks first (what the link shows and hides, anyone with the link sees it until you stop), Cancel makes nothing, Make link sends this plan and the stays choice, and the share sheet gets /s#token',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      // The browser's share sheet: record what the app hands it (the web export uses navigator.share).
      await page.addInitScript(() => {
        window.__shared = [];
        Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared.push(d); } });
      });
      const made = await watchRpc(page, 'create_share_link');
      await go('/me');
      step('open Plan and tap Share plan link');
      await seen(page, 'Plan').click();
      await button(page, 'Share plan link').click();
      for (const words of ['Share your plan by link', 'The link shows', 'The route and the start date',
        'Not shown: the notes of each day, bookings, health, GPS tracks and stamps.',
        'Anyone who has the link can see it, until you stop sharing it in Settings, Privacy and safety, Shared links.']) {
        await seen(page, words).waitFor();
      }
      const stays = page.getByRole('checkbox', { name: 'Also show where I sleep each night' });
      assert.equal(await stays.getAttribute('aria-checked'), 'false', 'where you sleep is not shown unless you choose it');
      step('Cancel: nothing is made');
      await button(page, 'Cancel').click();
      await eventually(() => seen(page, 'Share your plan by link').count(), (n) => n === 0, { what: 'the sheet after Cancel' });
      assert.equal(made.length, 0, 'no link was made');
      step('again, tick the stays, Make link');
      await button(page, 'Share plan link').click();
      await stays.click();
      assert.equal(await stays.getAttribute('aria-checked'), 'true');
      await button(page, 'Make link').click();
      await eventually(() => made.length, (n) => n === 1, { what: 'the calls to create_share_link' });
      assert.deepEqual(made[0], { p_kind: 'plan', p_journey_id: JOURNEY.id, p_options: { stays: true }, p_label: JOURNEY.route.name }, 'the route name labels the link');
      const shared = await eventually(() => page.evaluate(() => window.__shared), (s) => Array.isArray(s) && s.length === 1, { what: 'what went to the share sheet' });
      assert.equal(shared[0].text ?? shared[0].message, `My Camino plan on CaminoPlus: https://caminoplus-web.vercel.app/s#${SHARE_TOKEN}`);
      await eventually(() => seen(page, 'Share your plan by link').count(), (n) => n === 0, { what: 'the sheet once the link is shared' });
    },
  },
  {
    name: 'Share plan link with no share sheet on the device (a computer): the link stays on the sheet with Copy link and Done, never closed silently',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
        window.__copied = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied.push(t); } } });
      });
      await go('/me');
      await seen(page, 'Plan').click();
      step('Make link');
      await button(page, 'Share plan link').click();
      await seen(page, 'Your name').waitFor();
      await button(page, 'Make link').click();
      const link = `My Camino plan on CaminoPlus: https://caminoplus-web.vercel.app/s#${SHARE_TOKEN}`;
      await seen(page, 'Your link is ready. Copy it and send it to the people you choose.').waitFor();
      await seen(page, link).waitFor();
      step('Copy link');
      await button(page, 'Copy link').click();
      await seen(page, 'Copied.').waitFor();
      assert.deepEqual(await page.evaluate(() => window.__copied), [link]);
      step('Done closes it');
      await button(page, 'Done').click();
      await eventually(() => seen(page, 'Share your plan by link').count(), (n) => n === 0, { what: 'the sheet after Done' });
    },
  },
  {
    name: 'Settings > Shared links: every link with its state and its opens; Stop sharing asks first and stops only that link; a stopped link has no button',
    persona: 'in',
    async run(ctx) {
      const { page, step, go } = ctx;
      const stopped = await watchRpc(page, 'revoke_share_link');
      await go('/settings');
      step('Privacy and safety > Shared links');
      await button(page, 'Shared links').click();
      await eventually(() => pathOf(page), (p) => p === '/shared-links', { what: 'the address' });
      await seen(page, 'My plan').waitFor();
      await seen(page, 'The bells at dawn').waitFor();
      await page.getByText(/^Shared · .* · Opened 3 times$/).filter({ visible: true }).first().waitFor();
      await page.getByText(/^Stopped · .* · Not opened yet$/).filter({ visible: true }).first().waitFor();
      assert.equal(await page.getByRole('button', { name: /^Stop sharing / }).count(), 1, 'only the link that is still shared has the button');
      step('Stop sharing, then No: nothing stops');
      await button(page, 'Stop sharing My plan').click();
      await seen(page, 'Stop sharing?').waitFor();
      await button(page, 'Cancel').click();
      assert.equal(stopped.length, 0);
      step('Stop sharing, then Stop sharing: that link stops');
      await button(page, 'Stop sharing My plan').click();
      await seen(page, 'Stop sharing?').waitFor();
      await page.getByRole('button', { name: 'Stop sharing', exact: true }).last().click();
      await eventually(() => stopped.length, (n) => n === 1, { what: 'the calls to revoke_share_link' });
      assert.deepEqual(stopped[0], { p_id: SHARE_LINKS[0].id });
    },
  },
];
