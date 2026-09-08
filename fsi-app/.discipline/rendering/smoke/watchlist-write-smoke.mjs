// SM smoke spec: the WATCH WRITE, end to end, against a route stub that ENFORCES AUTH and KEEPS
// STATE. Lane BRIEFDATA, 2026-09-08, train 61.
//
// WHY THIS SPEC EXISTS. The operator reported "/watchlist also not populated". Measured live the
// same day (project kwrsbpiseruzbfwjpvsp): `org_watchlist` holds ZERO rows across zero orgs and
// `user_watchlist` holds exactly ONE row. The surface is not failing to draw what exists — almost
// nothing has ever been successfully watched. The [CONFIRMED] reason the writes did not land:
// before train 61's lane TAGS-401, WatchButton built its own header as
// `Bearer ${session?.access_token || ""}` (git 859bbe5b, this file's lane read it), which sends a
// well-formed-looking `Authorization: Bearer ` carrying NO identity whenever the browser session
// has not resolved yet. `requireAuth`'s `startsWith("Bearer ")` check passes, `getClaims()` then
// fails, and the write 401s. The button reverted its optimistic star, so the failure was visible
// as a tooltip and nothing else, and the row was never written.
//
// WHY IT IS A SPEC AND NOT A FIXTURE MOUNT, verbatim the reasoning workspace-tags-smoke.mjs gives
// for itself: every other api fixture in this engine (EMPTY_API in audit/mounts.mjs) answers
// `**/api/**` with a canned body and never inspects the request, so under it a button that sends
// no identity renders exactly like one that sends the right identity. A write path proven only by
// a fixture that fulfils every request is not proven. The handler below is a replica of
// requireAuth's contract PLUS a real row store, so the assertions are "did the row land", not
// "did the star change colour".
//
// WHAT IS MOUNTED: the REAL src/components/ui/WatchButton.tsx in its default (personal + team)
// variant, which is the control the watchlist surface and the detail pages mount. It goes through
// src/lib/api/authed-fetch.ts and src/lib/watchlist/membership.ts — the two modules that carry the
// header decision.
//
// THE NEGATIVE LEG. A second page mounts the same button against the SAME store with the session
// stub returning NO token. Nothing may be written, and the button must not be left claiming the
// item is watched. That leg is what makes the positive one mean something: it fails if the store
// starts accepting unauthenticated writes, and it fails if the button lies about the outcome.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const NO_SESSION_STUB = join(HERE, 'stub-supabase-browser-no-session.mjs');

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WatchButton } from '@/components/ui/WatchButton';

function WatchSmokeRoot(props) {
  return React.createElement('div', { 'data-guard-container': 'watch', 'data-audit': 'watch' },
    React.createElement(WatchButton, { itemType: props.itemType, itemId: props.itemId }),
  );
}

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(WatchSmokeRoot, props));
};
`;

const ITEM_TYPE = 'reg';
// The one row that really exists in `user_watchlist` today, item_type 'reg', item_id 'g2'
// (EU PPWR 2025/40, legacy_id g2, verified and unarchived) — the fixture uses the real identifiers
// rather than invented ones so the shape the route is handed here is the shape it is handed live.
const ITEM_ID = 'g2';

/**
 * requireAuth's contract plus a row store: `/api/watchlist` as the route really behaves.
 * POST inserts, DELETE removes, GET (list mode) reports membership — and every one of them is
 * refused without a bearer carrying an actual token, exactly as `requireAuth` refuses it.
 * `rows` IS the assertion surface: a write that 401s leaves it empty, which is the production
 * state this spec exists to make impossible to ship again.
 */
function watchlistApi(seen, rows) {
  const authed = (route) => {
    const header = route.request().headers()['authorization'];
    seen.push({
      url: route.request().url(),
      method: route.request().method(),
      authorization: header ?? null,
      body: route.request().postData() ?? null,
    });
    const token = header && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || token === 'undefined' || token === 'null') {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Authentication required' }),
      });
      return false;
    }
    return true;
  };

  return [
    {
      urlGlob: '**/api/watchlist**',
      handler: (route) => {
        if (!authed(route)) return;
        const req = route.request();
        const url = new URL(req.url());
        if (req.method() === 'POST') {
          let body = {};
          try {
            body = JSON.parse(req.postData() || '{}');
          } catch {
            route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid JSON body' }) });
            return;
          }
          const scope = body.scope === 'team' ? 'team' : 'personal';
          if (!body.itemType || !body.itemId) {
            route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'itemType and itemId are required' }) });
            return;
          }
          rows.push({ scope, itemType: body.itemType, itemId: body.itemId });
          route.fulfill({ contentType: 'application/json', body: JSON.stringify({ watched: true, scope }) });
          return;
        }
        if (req.method() === 'DELETE') {
          const scope = url.searchParams.get('scope') || 'personal';
          const itemId = url.searchParams.get('item_id');
          const i = rows.findIndex((r) => r.itemId === itemId && r.scope === scope);
          if (i >= 0) rows.splice(i, 1);
          route.fulfill({ contentType: 'application/json', body: JSON.stringify({ watched: false, scope }) });
          return;
        }
        // GET, list mode: what the surface would read back for this user.
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            watchedIds: rows.filter((r) => r.scope === 'personal').map((r) => r.itemId),
            teamWatchedIds: rows.filter((r) => r.scope === 'team').map((r) => r.itemId),
            teamAvailable: true,
          }),
        });
      },
    },
  ];
}

const buttonText = (page) => page.textContent('[data-audit="watch"]').then((t) => (t || '').replace(/\s+/g, ' ').trim());

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;

  // ── LEG 1: a signed-in viewer. The write must LAND. ──────────────────────────────────────────
  const bundleJs = await bundleEntry(ENTRY);
  const seen = [];
  const rows = [];
  const page = await newSmokePage(browser, { apiRoutes: watchlistApi(seen, rows) });
  await mountBundle(page, bundleJs, '__mount', { itemType: ITEM_TYPE, itemId: ITEM_ID });
  // The mount read goes through the shared per-item_type membership cache (src/lib/watchlist/
  // membership.ts), which resolves a session first; 400ms was not always enough for that chain on a
  // cold bundle, so wait for the request itself and fall through to the assertion on timeout.
  await page.waitForFunction(() => true).catch(() => {});
  for (let i = 0; i < 20 && seen.length === 0; i += 1) await page.waitForTimeout(100);

  checks++;
  failures.push(...assertGuardClean('watchlist-write', await measureGuard(page)));

  checks++;
  if (seen.length === 0) {
    failures.push(
      'watchlist-write: the button issued NO membership read on mount. This is what a SILENTLY SWALLOWED ' +
        'client-side throw looks like from outside — the first time this spec ran it was exactly that: ' +
        "src/lib/watchlist/membership.ts called `options.fetchImpl(url)`, a method call that hands the real " +
        "`fetch` a `this` of `options`, which Chrome refuses (\"Illegal invocation\"), and the function's own " +
        'catch resolved an empty map. Every WatchButton on a detail page then rendered "Watch" for an item ' +
        'the reader was already watching.',
    );
  }
  const unauthenticated = seen.filter((r) => !r.authorization || !r.authorization.startsWith('Bearer '));
  checks++;
  if (unauthenticated.length) {
    failures.push(
      `watchlist-write: ${unauthenticated.length} of ${seen.length} request(s) carried no Authorization: Bearer header ` +
        `(requireAuth reads that header and nothing else): ` +
        unauthenticated.map((r) => `${r.method} ${r.url}`).join(', '),
    );
  }
  checks++;
  if (seen.some((r) => r.authorization === 'Bearer ' || r.authorization === 'Bearer undefined')) {
    failures.push(
      'watchlist-write: a request carried a bearer with no token ("Bearer " / "Bearer undefined"). ' +
        'That is the exact pre-train-61 header shape that 401d every watch write and left both watchlist tables empty.',
    );
  }

  checks++;
  const restText = await buttonText(page);
  if (!/Watch/.test(restText)) {
    failures.push(`watchlist-write: the watch control did not render (text: ${JSON.stringify(restText)}).`);
  }

  // The write itself.
  const before = seen.length;
  const button = await page.$('[data-audit="watch"] button');
  checks++;
  if (!button) {
    failures.push('watchlist-write: no clickable watch control.');
  } else {
    await button.click();
    await page.waitForTimeout(400);
    const post = seen.slice(before).find((r) => r.method === 'POST');
    checks++;
    if (!post) {
      failures.push('watchlist-write: clicking Watch issued no POST /api/watchlist.');
    } else {
      checks++;
      if (!post.authorization || !post.authorization.startsWith('Bearer ') || post.authorization.slice(7).trim().length === 0) {
        failures.push('watchlist-write: the POST carried no usable bearer, so watching 401s in production and writes nothing.');
      }
      let body = {};
      try {
        body = JSON.parse(post.body || '{}');
      } catch {
        /* asserted below */
      }
      checks++;
      if (body.itemType !== ITEM_TYPE || body.itemId !== ITEM_ID) {
        failures.push(
          `watchlist-write: the POST body named ${JSON.stringify({ itemType: body.itemType, itemId: body.itemId })}, expected the item under the button.`,
        );
      }
    }

    // THE ASSERTION THAT MATTERS: a row exists in the store, not merely a happy-looking button.
    checks++;
    if (rows.length !== 1 || rows[0].itemId !== ITEM_ID || rows[0].scope !== 'personal') {
      failures.push(
        `watchlist-write: after clicking Watch the store holds ${JSON.stringify(rows)}; expected exactly one personal row for ${ITEM_ID}. ` +
          'An empty store here IS the production state: a watchlist with nothing in it beside a Watch control that looks like it worked.',
      );
    }

    checks++;
    const afterText = await buttonText(page);
    // "Watching" at rest, "Unwatch" while the pointer is still on the control it was just clicked
    // with — audit item 3.5's rule (a watched item never reads bare "Watch"), both halves accepted.
    if (!/Watching|Unwatch/.test(afterText) || /(^|[^n])Watch($|[^i])/.test(afterText.replace('Unwatch', ''))) {
      failures.push(`watchlist-write: the control does not report the watch it just wrote (text: ${JSON.stringify(afterText)}).`);
    }

    // ...and it comes back off, so the row the surface reads is the row the user chose.
    const beforeDelete = seen.length;
    await (await page.$('[data-audit="watch"] button')).click();
    await page.waitForTimeout(400);
    checks++;
    if (!seen.slice(beforeDelete).some((r) => r.method === 'DELETE')) {
      failures.push('watchlist-write: unwatching issued no DELETE /api/watchlist.');
    }
    checks++;
    if (rows.length !== 0) {
      failures.push(`watchlist-write: after unwatching the store still holds ${JSON.stringify(rows)}.`);
    }
  }
  await page.close();

  // ── LEG 2: no session. Nothing may be written, and the button may not claim otherwise. ───────
  const noSessionBundle = await bundleEntry(ENTRY, { alias: { '@/lib/supabase-browser': NO_SESSION_STUB } });
  const seen2 = [];
  const rows2 = [];
  const page2 = await newSmokePage(browser, { apiRoutes: watchlistApi(seen2, rows2) });
  await mountBundle(page2, noSessionBundle, '__mount', { itemType: ITEM_TYPE, itemId: ITEM_ID });
  await page2.waitForTimeout(300);
  const button2 = await page2.$('[data-audit="watch"] button');
  if (button2) {
    await button2.click();
    await page2.waitForTimeout(400);
  }
  checks++;
  if (rows2.length !== 0) {
    failures.push(`watchlist-write (no session): an unauthenticated click wrote ${JSON.stringify(rows2)}; it must write nothing.`);
  }
  checks++;
  if (seen2.some((r) => r.authorization === 'Bearer ' || r.authorization === 'Bearer undefined')) {
    failures.push(
      'watchlist-write (no session): the button sent a bearer with no token instead of making no request. ' +
        'src/lib/api/authed-fetch.ts exists precisely so a missing session is NO REQUEST, never a 401-shaped one.',
    );
  }
  checks++;
  const text2 = await buttonText(page2);
  if (/Watching/.test(text2)) {
    failures.push(
      `watchlist-write (no session): the control reads ${JSON.stringify(text2)} after a write that never landed. ` +
        'A watchlist that stays empty beside a control that says "Watching" is the reported defect.',
    );
  }
  await page2.close();

  return { checks, failures };
}
