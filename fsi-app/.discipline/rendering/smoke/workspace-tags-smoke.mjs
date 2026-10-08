// SM smoke spec: workspace tags, end to end, against a route stub that ENFORCES AUTH.
// Lane TAGS-401, 2026-09-08, train 61. Production defect: GET /api/workspace/tags returned 401 for
// every signed-in user from the day the feature landed (23 in three hours on a signed-in session,
// click-through audit 2026-09-08), because src/lib/tags/client.ts sent `credentials: "include"` and
// requireAuth reads the Authorization header and nothing else.
//
// WHY THIS SPEC EXISTS RATHER THAN ANOTHER FIXTURE MOUNT. Every existing api fixture in this engine
// answers `**/api/**` with a canned body and never looks at the request (see EMPTY_API in
// audit/mounts.mjs). Under that fixture a component that sends no credentials at all renders
// exactly like one that sends the right ones, which is precisely why a dead feature passed every
// gate. The handler below is a REPLICA OF requireAuth's contract: no `Authorization: Bearer <jwt>`
// on the request, 401 and the honest error body, same as production. So the assertions here are not
// "does a tag render" but "does the client prove its identity" — the pills cannot appear unless the
// header is on the wire. Removing the header from src/lib/tags/client.ts turns every check below
// red, which was verified by hand while writing this file (see the lane REPORT).
//
// WHAT IS MOUNTED. The REAL src/components/ui/DetailTagRow.tsx (which mounts the real TagPopover,
// forced open, the same way the detail-shell audit mount does since the runner never clicks a
// trigger) and a three-line harness root that calls the REAL useWorkspaceTagsFacet hook and renders
// its `tags` and `tagsForItem` output — the list rail's facet group and ListRow's tag line read
// exactly those two, so this covers the rail without dragging a whole ledger's data contract in.
// Both go through src/lib/tags/client.ts and useWorkspaceTagsFacet.ts, the two files that carried
// the defect.
//
// THE APPLY LEG. Clicking an unapplied option in the popover fires
// applyWorkspaceTag -> PUT /api/workspace/tags/<id>/items. The stub records that request's headers
// and rejects it without a bearer, so "apply still fails after the read is fixed" (the second defect
// the dispatch asked about) cannot hide: the applied pill only appears if the PUT was authenticated
// AND the route accepted it.

import { bundleEntry, newSmokePage, mountBundle, measureGuard, assertGuardClean } from './harness.mjs';

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DetailTagRow } from '@/components/ui/DetailTagRow';
import { useWorkspaceTagsFacet } from '@/lib/tags/useWorkspaceTagsFacet';
import { ListRow } from '@/components/ui/ListRow';

// The rail facet's two reads, rendered plainly. ListSurfaceRailCards' "Workspace tags" group maps
// over exactly \`tags\` (name + itemCount) and ListRow's \`tags\` prop is exactly \`tagsForItem(id)\`.
function RailFacetProbe({ itemUuid }) {
  const facet = useWorkspaceTagsFacet();
  return React.createElement('div', { 'data-audit': 'railfacet' },
    React.createElement('ul', null, facet.tags.map((t) =>
      React.createElement('li', { key: t.id, 'data-facet-tag': t.name }, t.name + ' ' + t.itemCount))),
    React.createElement('ul', null, facet.tagsForItem(itemUuid).map((t) =>
      React.createElement('li', { key: t.id, 'data-row-tag': t.name }, t.name))),
    // The REAL list row, fed by the same hook the five ledgers use (lane s8b-tag-attribution, 2026-10-07):
    // its workspace-tag chips must carry the same "applied by <name> on <date>" title as the detail chips.
    React.createElement('div', { 'data-audit': 'listrow' },
      React.createElement(ListRow, {
        href: '#',
        band: 'action',
        jurisdiction: 'EU',
        title: 'Packaging and packaging waste regulation',
        meta: 'Regulation · Ocean · emissions',
        tier: 1,
        tags: facet.tagsForItem(itemUuid),
      })),
  );
}

function TagsSmokeRoot(props) {
  return React.createElement('div', { 'data-guard-container': 'tags' },
    React.createElement('div', { 'data-audit': 'tagrow' },
      React.createElement(DetailTagRow, { itemId: props.itemId, open: true, onOpenChange: () => {} })),
    React.createElement(RailFacetProbe, { itemUuid: props.itemUuid }),
  );
}

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(TagsSmokeRoot, props));
};
`;

const ITEM_ID = 'r7';
const ITEM_UUID = '00000000-0000-4000-8000-000000000007';
const APPLIED = { id: 'tag-applied', orgId: 'org-1', name: 'Board pack', itemCount: 3, createdAt: '2026-09-01T00:00:00Z' };
const UNAPPLIED = { id: 'tag-unapplied', orgId: 'org-1', name: 'Q4 review', itemCount: 1, createdAt: '2026-09-02T00:00:00Z' };
// Lane s8b-tag-attribution (2026-10-07, migration 313 created_by/created_at): a workspace tag shows who applied it and when. The
// third tag carries a deliberately long author name so the 375 pass proves the attribution line truncates
// inside the 280px panel instead of widening it.
const LONG_AUTHOR = 'Alexandria Bartholomew Montgomery-Featherstonehaugh the Third';
const LONG = { id: 'tag-long', orgId: 'org-1', name: 'Customs hold', itemCount: 2, createdAt: '2026-09-03T00:00:00Z' };
const APPLICATIONS = {
  [APPLIED.id]: { appliedBy: 'user-ada', appliedByName: 'Ada Lovelace', appliedAt: '2026-09-03T10:00:00Z' },
  [LONG.id]: { appliedBy: 'user-long', appliedByName: LONG_AUTHOR, appliedAt: '2026-09-04T10:00:00Z' },
};
const NEW_APPLICATION = { appliedBy: 'user-grace', appliedByName: 'Grace Hopper', appliedAt: '2026-09-05T10:00:00Z' };
const ADA_TEXT = 'applied by Ada Lovelace on 3 Sep 2026';
const GRACE_TEXT = 'applied by Grace Hopper on 5 Sep 2026';
const LONG_TEXT = `applied by ${LONG_AUTHOR} on 4 Sep 2026`;

/** requireAuth's contract, replicated: identity comes from the Authorization header or the request
 *  is refused. `seen` records every request so the spec can assert the header was actually sent,
 *  not merely that something rendered. */
// ROUTE ORDER: Playwright tries the most recently registered route first, and '**/api/workspace/tags**'
// also matches the items path, so the specific items route is registered LAST. In the first version of
// this spec the order was reversed, the list handler answered every PUT, and no server state ever changed.
function tagsApi(seen) {
  const state = { applied: new Set([APPLIED.id, LONG.id]), applications: { ...APPLICATIONS } };

  const authed = (route) => {
    const header = route.request().headers()['authorization'];
    seen.push({ url: route.request().url(), method: route.request().method(), authorization: header ?? null });
    if (!header || !header.startsWith('Bearer ') || header.slice(7).length === 0) {
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Authentication required' }) });
      return false;
    }
    return true;
  };

  return [
    {
      urlGlob: '**/api/workspace/tags**',
      handler: (route) => {
        if (!authed(route)) return;
        const tags = [APPLIED, UNAPPLIED, LONG];
        const appliedTagIds = [...state.applied];
        const itemTags = { [ITEM_UUID]: appliedTagIds };
        const applications = appliedTagIds.map((tagId) => ({ tagId, ...state.applications[tagId] }));
        const itemTagApplications = { [ITEM_UUID]: applications };
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tags, appliedTagIds, applications, itemTags, itemTagApplications }) });
      },
    },
    {
      urlGlob: '**/api/workspace/tags/*/items',
      handler: (route) => {
        if (!authed(route)) return;
        const tagId = new URL(route.request().url()).pathname.split('/').at(-2);
        if (route.request().method() === 'PUT') {
          state.applied.add(tagId);
          state.applications[tagId] ??= NEW_APPLICATION;
        }
        if (route.request().method() === 'DELETE') state.applied.delete(tagId);
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) });
      },
    },
  ];
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);
  const seen = [];

  const page = await newSmokePage(browser, { apiRoutes: tagsApi(seen) });
  await mountBundle(page, bundleJs, '__mount', { itemId: ITEM_ID, itemUuid: ITEM_UUID });
  await page.waitForTimeout(400);

  checks++;
  failures.push(...assertGuardClean('workspace-tags', await measureGuard(page)));

  // ── the defect itself: was the header on the wire at all? ────────────────────────────────────
  checks++;
  if (seen.length === 0) {
    failures.push('workspace-tags: the client issued NO request to /api/workspace/tags on mount.');
  }
  const unauthenticated = seen.filter((r) => !r.authorization || !r.authorization.startsWith('Bearer '));
  checks++;
  if (unauthenticated.length) {
    failures.push(
      `workspace-tags: ${unauthenticated.length} of ${seen.length} request(s) carried no Authorization: Bearer header ` +
        `(requireAuth reads that header and nothing else, so each is a 401 in production): ` +
        unauthenticated.map((r) => `${r.method} ${r.url}`).join(', '),
    );
  }
  checks++;
  if (seen.some((r) => r.authorization === 'Bearer ' || r.authorization === 'Bearer undefined')) {
    failures.push('workspace-tags: a request carried a bearer with no token ("Bearer " / "Bearer undefined"), which 401s.');
  }

  // ── the detail tag row renders the applied pill (the audit saw the label with nothing before it)
  const rowText = (await page.textContent('[data-audit="tagrow"]')) || '';
  checks++;
  if (!rowText.includes(APPLIED.name)) {
    failures.push(`workspace-tags: the detail tag row rendered no applied tag (text: ${JSON.stringify(rowText.slice(0, 120))}).`);
  }
  checks++;
  if (!rowText.includes('workspace tags')) {
    failures.push('workspace-tags: the detail tag row label did not render.');
  }

  // ── the popover panel lists both tags ───────────────────────────────────────────────────────
  const options = await page.$$eval('[data-audit="tagrow"] [role="option"]', (els) => els.map((e) => e.textContent || ''));
  checks++;
  if (options.length < 2) {
    failures.push(`workspace-tags: the + Tag popover listed ${options.length} option(s), expected both workspace tags.`);
  }

  // ── ATTRIBUTION (migration 313 created_by/created_at): the chip's title and the tag list say who applied it and when ──
  const chipTitles = await page.$$eval('[data-audit="tagrow"] [data-part="chip-workspace-tag"][title]', (els) =>
    els.map((e) => ({ text: (e.textContent || '').trim(), title: e.getAttribute('title') })));
  checks++;
  if (!chipTitles.some((c) => c.text.startsWith(APPLIED.name) && c.title === ADA_TEXT)) {
    failures.push(`workspace-tags: the applied chip carries no "${ADA_TEXT}" title (titled chips: ${JSON.stringify(chipTitles)}).`);
  }
  const listLines = await page.$$eval('[data-audit="tagrow"] [data-part="tag-attribution"]', (els) => els.map((e) => e.textContent || ''));
  checks++;
  if (!listLines.includes(ADA_TEXT) || !listLines.includes(LONG_TEXT)) {
    failures.push(`workspace-tags: the tag list rendered attribution lines ${JSON.stringify(listLines)}, expected "${ADA_TEXT}" and the long-author line.`);
  }
  checks++;
  if (listLines.length !== 2) {
    failures.push(`workspace-tags: ${listLines.length} attribution lines rendered for 2 applied tags (an unapplied tag must carry none).`);
  }

  // List rows (the five ledgers and the watchlist) carry the same title on their tag chips.
  const rowChips = await page.$$eval('[data-audit="listrow"] [data-part="chip-workspace-tag"]', (els) =>
    els.map((e) => ({ text: (e.textContent || '').trim(), title: e.getAttribute('title') })));
  checks++;
  if (rowChips.length === 0) {
    failures.push('workspace-tags: the list row rendered no workspace-tag chips.');
  } else if (rowChips.some((c) => !c.title)) {
    failures.push(`workspace-tags: a list-row tag chip has no attribution title (${JSON.stringify(rowChips)}).`);
  } else if (!rowChips.some((c) => c.text.startsWith(APPLIED.name) && c.title === ADA_TEXT) ||
             !rowChips.some((c) => c.text.startsWith(LONG.name) && c.title === LONG_TEXT)) {
    failures.push(`workspace-tags: list-row tag chip titles are ${JSON.stringify(rowChips)}, expected "${ADA_TEXT}" and "${LONG_TEXT}".`);
  }

  // 375 pass: the long author name must truncate inside the 280px panel, never widen it or the page.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(250);
  checks++;
  failures.push(...assertGuardClean('workspace-tags@375', await measureGuard(page)));
  const fit = await page.evaluate(() => {
    const panel = document.querySelector('[data-audit="tagrow"] [role="listbox"]');
    const lines = [...document.querySelectorAll('[data-audit="tagrow"] [data-part="tag-attribution"]')];
    if (!panel) return { panel: null };
    const p = panel.getBoundingClientRect();
    return {
      panelRight: p.right,
      panelWidth: p.width,
      viewport: window.innerWidth,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      escaping: lines.filter((l) => l.getBoundingClientRect().right > p.right + 0.5).length,
      lines: lines.length,
    };
  });
  checks++;
  if (!fit.panel && fit.panelRight === undefined) {
    failures.push('workspace-tags@375: the tag list panel did not render.');
  } else {
    if (fit.panelRight > fit.viewport) failures.push(`workspace-tags@375: the tag list panel reaches x=${fit.panelRight}, past the ${fit.viewport}px viewport.`);
    if (fit.pageOverflow) failures.push('workspace-tags@375: the page scrolls horizontally with the attribution lines rendered.');
    if (fit.escaping) failures.push(`workspace-tags@375: ${fit.escaping} attribution line(s) extend past the tag list panel (the long author name must truncate).`);
    if (fit.panelWidth > 284) failures.push(`workspace-tags@375: the tag list panel widened to ${fit.panelWidth}px (design width 280 plus a 1px border each side).`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(150);

  // ── the rail facet group and the row tag line ───────────────────────────────────────────────
  const facetNames = await page.$$eval('[data-facet-tag]', (els) => els.map((e) => e.getAttribute('data-facet-tag')));
  checks++;
  if (!facetNames.includes(APPLIED.name) || !facetNames.includes(UNAPPLIED.name)) {
    failures.push(`workspace-tags: the list rail's Workspace tags facet rendered [${facetNames}], expected both tags with counts.`);
  }
  const rowTagNames = await page.$$eval('[data-row-tag]', (els) => els.map((e) => e.getAttribute('data-row-tag')));
  checks++;
  if (!rowTagNames.includes(APPLIED.name)) {
    failures.push(`workspace-tags: tagsForItem() returned [${rowTagNames}] for the item, expected its applied tag.`);
  }

  // ── APPLY: click the unapplied option and prove the write went through authenticated ────────
  const before = seen.length;
  const option = await page.$(`[data-audit="tagrow"] [role="option"]:has-text("${UNAPPLIED.name}")`);
  checks++;
  if (!option) {
    failures.push('workspace-tags: the unapplied tag has no clickable option row in the popover.');
  } else {
    await option.click();
    await page.waitForTimeout(400);
    const put = seen.slice(before).find((r) => r.method === 'PUT');
    checks++;
    if (!put) {
      failures.push('workspace-tags: clicking a tag issued no PUT to /api/workspace/tags/<id>/items.');
    } else if (!put.authorization || !put.authorization.startsWith('Bearer ')) {
      failures.push('workspace-tags: the apply PUT carried no Authorization header, so applying a tag 401s in production.');
    }
    const graceLines = await page.$$eval('[data-audit="tagrow"] [data-part="tag-attribution"]', (els) => els.map((e) => e.textContent || ''));
    checks++;
    if (!graceLines.includes(GRACE_TEXT)) {
      failures.push(`workspace-tags: after applying a tag the list shows ${JSON.stringify(graceLines)}, expected "${GRACE_TEXT}" read back from the server.`);
    }
    const after = (await page.textContent('[data-audit="tagrow"]')) || '';
    checks++;
    if (!after.includes(UNAPPLIED.name)) {
      failures.push(
        `workspace-tags: applying a tag did not add its pill to the detail row (text: ${JSON.stringify(after.slice(0, 160))}). ` +
          'The write was accepted, so this is a client-state defect, not an auth one.',
      );
    }
  }

  await page.close();
  return { checks, failures };
}
