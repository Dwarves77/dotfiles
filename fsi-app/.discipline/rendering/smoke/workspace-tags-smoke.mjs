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

// The rail facet's two reads, rendered plainly. ListSurfaceRailCards' "Workspace tags" group maps
// over exactly \`tags\` (name + itemCount) and ListRow's \`tags\` prop is exactly \`tagsForItem(id)\`.
function RailFacetProbe({ itemUuid }) {
  const facet = useWorkspaceTagsFacet();
  return React.createElement('div', { 'data-audit': 'railfacet' },
    React.createElement('ul', null, facet.tags.map((t) =>
      React.createElement('li', { key: t.id, 'data-facet-tag': t.name }, t.name + ' ' + t.itemCount))),
    React.createElement('ul', null, facet.tagsForItem(itemUuid).map((t) =>
      React.createElement('li', { key: t.id, 'data-row-tag': t.name }, t.name))),
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

/** requireAuth's contract, replicated: identity comes from the Authorization header or the request
 *  is refused. `seen` records every request so the spec can assert the header was actually sent,
 *  not merely that something rendered. */
function tagsApi(seen) {
  const state = { applied: new Set([APPLIED.id]) };

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
      urlGlob: '**/api/workspace/tags/*/items',
      handler: (route) => {
        if (!authed(route)) return;
        const tagId = new URL(route.request().url()).pathname.split('/').at(-2);
        if (route.request().method() === 'PUT') state.applied.add(tagId);
        if (route.request().method() === 'DELETE') state.applied.delete(tagId);
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) });
      },
    },
    {
      urlGlob: '**/api/workspace/tags**',
      handler: (route) => {
        if (!authed(route)) return;
        const tags = [APPLIED, UNAPPLIED];
        const appliedTagIds = [...state.applied];
        const itemTags = { [ITEM_UUID]: appliedTagIds };
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tags, appliedTagIds, itemTags }) });
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
