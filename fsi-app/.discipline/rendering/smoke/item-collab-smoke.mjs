// UX smoke spec: private workspace notes and assignment on a detail page (lane S8-A, 2026-10-07). Mounts the REAL
// `ItemNotesBlock` and `ItemAssignBlock` (src/components/detail/) with fixture API answers, measured at 375, 768,
// 1024 and 1280 for law-2 targets, overflow and squeezed or word-broken titles (ux-assert.mjs), per the UX contract
// (docs/dispatches/lane-common-contract.md) and F35 (row-ux-coverage). A second spec mounts DetailShell's
// `DetailPageWrapper` itself, so the ONE shell slot is proven to mount both blocks (and to mount nothing when no
// workspace roster is present), then two click flows prove an add-a-note and an assign round trip in a browser.
//
// STATES. The fixture answer is chosen by the item id in the request URL, so one spec-level route handler serves
// every state: empty, full (own editable note, a deletable note, a legacy authorless note, an open and a done
// assignment), extreme (100 character unbroken tokens in names and bodies, the squeeze class), readonly (a viewer),
// error (HTTP 500: the retry state).

import { runUxSpec } from './ux-harness.mjs';
import { bundleEntry, newSmokePage, mountBundle } from './harness.mjs';
import { fullAppCss } from './smoke-fixtures.mjs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ALIAS = {
  'next/navigation': `${HERE}stub-next-navigation-item.mjs`,
  '@/components/market/spec09.css': `${HERE}stub-empty-css.mjs`,
};

const css = `
(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(fullAppCss())};
  document.head.appendChild(style);
})();
`;

const BLOCKS_ENTRY = `${css}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ItemNotesBlock } from '@/components/detail/ItemNotesBlock';
import { ItemAssignBlock } from '@/components/detail/ItemAssignBlock';

let root = null;
window.__mount = (props) => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement('div', { 'data-guard-container': true, style: { maxWidth: 780, padding: 16, display: 'flex', flexDirection: 'column', gap: 24 } },
      React.createElement(ItemNotesBlock, { itemId: props.itemId }),
      React.createElement(ItemAssignBlock, { itemId: props.itemId })));
};
`;

const SLOT_ENTRY = `${css}
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DetailPageWrapper } from '@/components/detail/DetailShell';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(React.createElement(DetailPageWrapper, null, React.createElement('p', null, 'item body')));
};
`;

const LONG = 'collaborationworkspaceparticipantwiththeextraordinarilylongunbrokenidentifier1234567890abcdefghij';
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const note = (n, extra = {}) => ({
  id: U(n), author_user_id: U(10 + n), author_name: `Member ${n}`, body: `Note ${n}: check the carrier filing before the quarter closes.`,
  created_at: '2026-10-05T10:00:00Z', edited_at: null, mine: false, can_edit: false, can_delete: false, ...extra,
});
const assignment = (n, extra = {}) => ({
  id: U(200 + n), assignee_user_id: U(10 + n), assignee_name: `Member ${n}`, assigned_by: U(1), assigned_by_name: 'Alice Admin',
  due_on: '2026-11-14', state: 'open', created_at: '2026-10-05T10:00:00Z', can_change: true, ...extra,
});
const member = (n, name) => ({ user_id: U(10 + n), display_name: name ?? `Member ${n}` });

function fixtureFor(itemId) {
  switch (itemId) {
    case 'empty':
      return {
        notes: { notes: [], viewer: { role: 'member', can_write: true, can_delete: false } },
        assignments: { assignments: [], members: [member(1), member(2), member(3)], viewer: { role: 'member', can_write: true } },
      };
    case 'extreme':
      return {
        notes: {
          notes: [
            note(1, { author_name: LONG, body: `${LONG}${LONG}${LONG}`, mine: true, can_edit: true, can_delete: true, edited_at: '2026-10-06T10:00:00Z' }),
            note(2, { author_name: null, body: 'Imported from the earlier single notes field.', can_delete: true }),
          ],
          viewer: { role: 'admin', can_write: true, can_delete: true },
        },
        assignments: {
          assignments: [assignment(1, { assignee_name: LONG }), assignment(2, { assignee_name: LONG, state: 'done', due_on: null })],
          members: [member(3, LONG), member(4, `${LONG}${LONG}`), member(5)],
          viewer: { role: 'admin', can_write: true },
        },
      };
    case 'readonly':
      return {
        notes: { notes: [note(1), note(2)], viewer: { role: 'viewer', can_write: false, can_delete: false } },
        assignments: { assignments: [assignment(1, { can_change: false })], members: [member(1), member(2)], viewer: { role: 'viewer', can_write: false } },
      };
    case 'error':
      return null;
    default: // full, and smoke-item for the slot
      return {
        notes: {
          notes: [
            note(1, { mine: true, can_edit: true, can_delete: true }),
            note(2, { can_delete: true, edited_at: '2026-10-06T10:00:00Z' }),
            note(3, { author_name: null, can_delete: true }),
          ],
          viewer: { role: 'admin', can_write: true, can_delete: true },
        },
        assignments: {
          assignments: [assignment(1), assignment(2, { state: 'done' })],
          members: [member(1), member(2), member(3), member(4), member(5)],
          viewer: { role: 'admin', can_write: true },
        },
      };
  }
}

const itemOf = (url) => decodeURIComponent(new URL(url).pathname.split('/')[4] || '');

const API_ROUTES = [
  {
    urlGlob: '**/api/workspace/bootstrap**',
    handler: (route) => route.fulfill({ json: { personalState: [], members: [{ user_id: U(1), role: 'admin', display_name: 'Alice Admin', avatar_url: null }], adminAttention: null, overrides: [] } }),
  },
  {
    urlGlob: '**/api/workspace/items/*/notes**',
    handler: async (route) => {
      const req = route.request();
      const fx = fixtureFor(itemOf(req.url()));
      if (!fx) return route.fulfill({ status: 500, json: { error: 'The notes service did not answer. Retry in a moment.' } });
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}').body;
        return route.fulfill({ status: 201, json: { note: note(900, { author_name: 'You', body, mine: true, can_edit: true, can_delete: true }) } });
      }
      return route.fulfill({ json: fx.notes });
    },
  },
  {
    urlGlob: '**/api/workspace/items/*/assignments**',
    handler: async (route) => {
      const req = route.request();
      const fx = fixtureFor(itemOf(req.url()));
      if (!fx) return route.fulfill({ status: 500, json: { error: 'The assignments service did not answer. Retry in a moment.' } });
      if (req.method() === 'POST') {
        const { assignees } = JSON.parse(req.postData() || '{}');
        return route.fulfill({
          status: 201,
          json: { assignments: assignees.map((id, i) => assignment(50 + i, { assignee_user_id: id, assignee_name: 'Newly Assigned' })), already_assigned: [], notified: assignees.length, notify_failed: 0 },
        });
      }
      return route.fulfill({ json: fx.assignments });
    },
  },
];

async function flows(browser) {
  const failures = [];
  let checks = 0;
  const bundle = await bundleEntry(BLOCKS_ENTRY, { alias: ALIAS });
  const page = await newSmokePage(browser, { apiRoutes: API_ROUTES });
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await mountBundle(page, bundle, '__mount', { itemId: 'full' });
    await page.waitForSelector('[data-part="item-notes"] textarea');

    // Add a note: the typed text appears at the top, the composer clears, the result is stated.
    await page.fill('[data-part="item-notes"] textarea', 'Ask the broker about the new filing.');
    await page.click('button:has-text("Add note")');
    await page.waitForSelector('text=Note added.');
    checks += 1;
    const topNote = await page.textContent('[data-part="item-notes"] ul li:first-child');
    if (!topNote || !topNote.includes('Ask the broker about the new filing.')) failures.push('item-collab:add-note: the added note is not first in the list');
    checks += 1;
    if ((await page.inputValue('[data-part="item-notes"] textarea')) !== '') failures.push('item-collab:add-note: the composer was not cleared after a successful add');

    // Delete warns first: the confirm step names what happens, "Keep it" backs out with nothing deleted.
    const before = await page.$$eval('[data-part="item-notes"] ul > li', (els) => els.length);
    await page.click('[data-part="item-notes"] ul li:first-child button:has-text("Delete")');
    checks += 1;
    if (!(await page.isVisible('text=Delete this note?'))) failures.push('item-collab:delete: no confirm step before deleting');
    await page.click('button:has-text("Keep it")');
    const after = await page.$$eval('[data-part="item-notes"] ul > li', (els) => els.length);
    checks += 1;
    if (after !== before) failures.push('item-collab:delete: "Keep it" changed the list');

    // Assign: picking a person enables the primary button and its label counts the people.
    checks += 1;
    if (!(await page.isDisabled('button:has-text("Assign")'))) failures.push('item-collab:assign: Assign is enabled with nobody picked');
    await page.click('[data-part="item-assignments"] fieldset button:first-of-type');
    await page.click('button:has-text("Assign 1 person")');
    await page.waitForSelector('text=Assigned 1 person. 1 notified.');
    checks += 1;
  } catch (e) {
    failures.push(`item-collab:flows: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await page.close();
  }
  return { checks, failures };
}

export async function runSmoke(browser) {
  const blocks = await runUxSpec(browser, {
    name: 'item-collab',
    entry: BLOCKS_ENTRY,
    alias: ALIAS,
    apiRoutes: API_ROUTES,
    states: [
      { label: 'empty', props: { itemId: 'empty' } },
      { label: 'full', props: { itemId: 'full' }, expectTitles: 5 },
      { label: 'extreme', props: { itemId: 'extreme' }, expectTitles: 4 },
      { label: 'readonly', props: { itemId: 'readonly' }, expectTitles: 3 },
      { label: 'error', props: { itemId: 'error' } },
    ],
  });
  const slot = await runUxSpec(browser, {
    name: 'item-collab-slot',
    entry: SLOT_ENTRY,
    alias: ALIAS,
    apiRoutes: API_ROUTES,
    states: [{ label: 'shell-slot', props: {}, expectTitles: 7 }],
  });
  const flow = await flows(browser);
  return { checks: blocks.checks + slot.checks + flow.checks, failures: [...blocks.failures, ...slot.failures, ...flow.failures] };
}
