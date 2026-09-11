// SM smoke spec: CommandBar Standard Search results listbox must not be clipped by the Masthead's
// SectionCard shell. Lane SEARCHCLIP, 2026-09-11.
//
// PRODUCTION DEFECT (coordinator measurement, wave 67, commit 73e8c8b1) [CONFIRMED]: Search mode
// worked end to end — typing "ppwr" produced 8 rows in the role=listbox (EU PPWR 2025/40 first)
// and the submit button read "Search" — but the reader saw none of it. The listbox
// (CommandBar.tsx) was `position: absolute; top: calc(100% + 6px)` inside the Masthead
// (Masthead.tsx line 91), and Masthead is a SectionCard whose shell sets `overflow: hidden`
// (SectionCard.tsx, documented there as what keeps the top SectionRule inside the card's own
// radius). Measured on production: masthead bottom edge 189px, listbox top 173px, height 360px —
// 16px of the dropdown's top border visible as a sliver, 344px clipped; elementFromPoint at the
// listbox centre resolved to the rail card underneath, not the listbox.
//
// THE FIX (this lane): the listbox is portaled to document.body via createPortal and repositioned
// from the bar's own `getBoundingClientRect()` (`position: fixed`, re-measured on scroll/resize) —
// see CommandBar.tsx's own header comment on the `barRect`/`portalTarget` state. SectionCard's
// `overflow: hidden` is untouched (a shared part 84 callers depend on, ratified by F42 and the
// design audit); no masthead-only override was added.
//
// WHY MASTHEAD, NOT COMMANDBAR ALONE. The defect is a CROSS-COMPONENT clipping interaction — it
// only reproduces when CommandBar is mounted inside the real SectionCard-shelled Masthead, exactly
// the composition every real page uses (DashboardMasthead → Masthead → CommandBar). Mounting
// CommandBar bare would prove nothing about the clip.
//
// THIS SPEC FAILS ON THE PRE-FIX TREE: with CommandBar's dropdown still `position: absolute` inside
// the card, the listbox's bounding box extends past the masthead's own bottom edge into territory
// `overflow: hidden` clips, so its rendered box (what elementFromPoint/getBoundingClientRect see)
// is squashed to the sliver still inside the card — the centre-point check and the
// fully-inside-viewport check both fail exactly as this file's checks below require. Verified by
// hand against the pre-fix source (see this lane's REPORT for the run transcript).

import { bundleEntry, newSmokePage, mountBundle } from "./harness.mjs";

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Masthead } from '@/components/ui/Masthead';

let root = null;
window.__mount = () => {
  const el = document.getElementById('smoke-root');
  if (!root) root = createRoot(el);
  root.render(
    React.createElement(Masthead, {
      title: "Jason's brief",
      dateLabel: 'Monday, September 7 2026',
      volNumber: 37,
      commandBar: { itemCount: 1433, scope: 'dashboard' },
    }),
  );
};
`;

const PPWR_ROW = {
  id: "ppwr-2025-40",
  title: "EU PPWR 2025/40",
  item_type: "regulation",
  domain: 1,
  priority: "immediate",
  jurisdictions: ["EU"],
  transport_modes: ["ocean"],
  topic: "packaging",
};

function searchResults() {
  const rows = [PPWR_ROW];
  for (let i = 1; i < 8; i++) {
    rows.push({
      id: `ppwr-row-${i}`,
      title: `PPWR-related item ${i}`,
      item_type: "regulation",
      domain: 1,
      priority: "watch",
      jurisdictions: ["EU"],
      transport_modes: ["road"],
      topic: "packaging",
    });
  }
  return rows;
}

function commandBarApi() {
  return [
    {
      urlGlob: "**/api/workspace/bootstrap**",
      handler: (route) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify({}) }),
    },
    {
      urlGlob: "**/api/search**",
      handler: (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ results: searchResults() }),
        }),
    },
  ];
}

export async function runSmoke(browser) {
  const failures = [];
  let checks = 0;
  const bundleJs = await bundleEntry(ENTRY);

  const page = await newSmokePage(browser, { apiRoutes: commandBarApi() });
  await page.setViewportSize({ width: 1440, height: 900 });
  await mountBundle(page, bundleJs, "__mount", null);
  await page.waitForTimeout(200);

  // Type "ppwr" the way a reader does — focus, then type, so React's onChange path (and the
  // debounce inside CommandBar) fires exactly as it does in the browser.
  await page.click(".cl-command-bar input");
  await page.type(".cl-command-bar input", "ppwr", { delay: 20 });

  // SEARCH_DEBOUNCE_MS is 250; wait comfortably past it plus one round trip.
  await page.waitForTimeout(600);

  checks++;
  const listboxExists = await page.$('[role="listbox"]');
  if (!listboxExists) {
    failures.push("command-bar-search-portal: no [role=listbox] rendered after typing 'ppwr' (search never returned).");
    await page.close();
    return { checks, failures };
  }

  // ── the listbox's own box is fully inside the viewport ─────────────────────────────────────
  const box = await page.evaluate(() => {
    const el = document.querySelector('[role="listbox"]');
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
  const viewport = { width: 1440, height: 900 };
  checks++;
  const insideViewport =
    box.top >= 0 && box.left >= 0 && box.right <= viewport.width && box.bottom <= viewport.height;
  if (!insideViewport) {
    failures.push(
      `command-bar-search-portal: listbox box ${JSON.stringify(box)} is not fully inside the ${viewport.width}x${viewport.height} viewport (SectionCard's overflow:hidden is clipping it).`,
    );
  }

  // ── elementFromPoint at the listbox centre resolves INSIDE the listbox, not the card underneath
  const centreHit = await page.evaluate(() => {
    const el = document.querySelector('[role="listbox"]');
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      insideListbox: !!(hit && el.contains(hit)),
      hitSelector: hit ? hit.className || hit.tagName : null,
    };
  });
  checks++;
  if (!centreHit.insideListbox) {
    failures.push(
      `command-bar-search-portal: document.elementFromPoint at the listbox centre hit ${JSON.stringify(centreHit.hitSelector)}, not the listbox — the reader cannot see or click search results (this is the exact production symptom: "there's no way to search").`,
    );
  }

  // ── listbox top sits within 12px of the command bar's own bottom edge ──────────────────────
  const gap = await page.evaluate(() => {
    const bar = document.querySelector(".cl-command-bar");
    const list = document.querySelector('[role="listbox"]');
    const barRect = bar.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    return listRect.top - barRect.bottom;
  });
  checks++;
  if (!(gap >= 0 && gap <= 12)) {
    failures.push(`command-bar-search-portal: listbox top is ${gap}px from the command bar's bottom edge, expected 0-12px.`);
  }

  // ── EU PPWR 2025/40 is the first row (search worked end to end, only rendering was broken) ──
  const firstRowText = await page.evaluate(() => {
    const list = document.querySelector('[role="listbox"]');
    const first = list.querySelector("a, [role], div");
    return list.textContent || "";
  });
  checks++;
  if (!firstRowText.includes("EU PPWR 2025/40")) {
    failures.push(`command-bar-search-portal: listbox text did not include "EU PPWR 2025/40" (text: ${JSON.stringify(firstRowText.slice(0, 200))}).`);
  }

  await page.close();
  return { checks, failures };
}
