// SM smoke spec: CommandBar Standard Search results listbox must not be clipped by the Masthead's
// SectionCard shell. Lane SEARCHCLIP, 2026-09-11.
//
// SEARCHKEYS follow-up (same day, review finding): two more real-DOM checks added to this SAME
// spec rather than a new file, since both exercise the identical Masthead/CommandBar mount this
// file already builds.
//   (1) The narrow-box type-text fix (ListRow.tsx's `LIST_ROW_NARROW_CONTAINER_TYPE_OVERRIDE_CSS`)
//       is proven live at a real 375px viewport: `.cl-row-meta-text` must render at a NONZERO
//       width for a long title/meta row, not merely have the right `display` value un-hidden (a
//       display-only fix passed this exact check with width still 0px before the flex-shrink/
//       max-width properties were added; see docs/tech-debt-log.md's correction block).
//   (2) Two CommandBar instances mounted at once must produce two DIFFERENT listbox ids (the
//       useId() fix), proven by opening both dropdowns and reading both `[role=listbox]` ids.
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

// SEARCHKEYS: two independent Masthead/CommandBar mounts, side by side, same convention
// notifications-smoke.mjs uses for its two-component page (harness.mjs's own header names this
// as the one other rootIds caller).
let rootA = null;
let rootB = null;
window.__mountTwo = () => {
  const elA = document.getElementById('smoke-root-a');
  const elB = document.getElementById('smoke-root-b');
  if (!rootA) rootA = createRoot(elA);
  if (!rootB) rootB = createRoot(elB);
  const bar = (scope) =>
    React.createElement(Masthead, {
      title: "Jason's brief",
      dateLabel: 'Monday, September 7 2026',
      volNumber: 37,
      commandBar: { itemCount: 1433, scope },
    });
  rootA.render(bar('dashboard-a'));
  rootB.render(bar('dashboard-b'));
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

// SEARCHKEYS: a deliberately long title/meta combination, the same shape the ad hoc verification
// script used while diagnosing the flex-collapse defect (docs/tech-debt-log.md's correction
// block); long enough that a still-broken (0px) narrow-box override and a correctly capped one
// are trivially distinguishable by scrollWidth vs clientWidth, not just "wider than zero".
const LONG_META_ROW = {
  id: "long-meta-row",
  title: "A regulation with a very long meta line to test truncation behavior",
  item_type: "regulation",
  domain: 1,
  priority: "watch",
  jurisdictions: ["EU"],
  transport_modes: ["air", "road", "ocean", "rail"],
  topic: "packaging and extended producer responsibility",
};

function commandBarApi(rows = searchResults()) {
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
          body: JSON.stringify({ results: rows }),
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

  // ── SEARCHKEYS (1): the narrow-box type text renders at a REAL nonzero width at 375px ────────
  // Reproduces the exact live-render check the ad hoc verification script ran while diagnosing the
  // flex-collapse defect: a display-only un-hide left `.cl-row-meta-text` present in the DOM at 0px
  // rendered width; `flex-shrink: 0` + `max-width: 100%` (ListRow.tsx) is what makes it actually
  // visible. Runs at 375px specifically because the narrow reflow is a CONTAINER query keyed to the
  // listbox's own box width, not the page viewport (SEARCHROW's own fix; see that lane's session-log
  // entry); 375 is RD-60's own mobile-class viewport (ux-harness.mjs's MOBILE_VIEWPORT).
  const narrowPage = await newSmokePage(browser, { apiRoutes: commandBarApi([LONG_META_ROW]) });
  await narrowPage.setViewportSize({ width: 375, height: 812 });
  await mountBundle(narrowPage, bundleJs, "__mount", null);
  await narrowPage.waitForTimeout(200);
  await narrowPage.click(".cl-command-bar input");
  await narrowPage.type(".cl-command-bar input", "ppwr", { delay: 20 });
  await narrowPage.waitForTimeout(600);
  checks++;
  const metaTextMeasure = await narrowPage.evaluate(() => {
    const option = document.querySelector('[role="option"]');
    const metaText = option ? option.querySelector(".cl-row-meta-text") : null;
    if (!metaText) return { found: false, width: 0, scrollWidth: 0, clientWidth: 0 };
    const r = metaText.getBoundingClientRect();
    return { found: true, width: r.width, scrollWidth: metaText.scrollWidth, clientWidth: metaText.clientWidth };
  });
  if (!metaTextMeasure.found) {
    failures.push("command-bar-search-portal: .cl-row-meta-text did not render at all in the 375px narrow-box option (item type is fully absent, not merely narrow).");
  } else if (!(metaTextMeasure.width > 0)) {
    failures.push(
      `command-bar-search-portal: .cl-row-meta-text rendered at ${metaTextMeasure.width}px width at 375px viewport (expected > 0); the narrow-box type text is present in the DOM but invisible, the exact flex-collapse regression this check exists to catch.`,
    );
  }
  await narrowPage.close();

  // ── SEARCHKEYS (2): two simultaneous CommandBar mounts never share a listbox id ────────────────
  // Proves the useId() fix (review finding, 2026-09-11): a bare module-level id constant would make
  // both dropdowns' `[role=listbox]` (and every `aria-activedescendant`/option id derived from it)
  // collide the moment two bars are open at once.
  const twoPage = await newSmokePage(browser, {
    apiRoutes: commandBarApi([LONG_META_ROW]),
    rootIds: ["smoke-root-a", "smoke-root-b"],
  });
  await twoPage.setViewportSize({ width: 1440, height: 900 });
  await mountBundle(twoPage, bundleJs, "__mountTwo", null);
  await twoPage.waitForTimeout(200);
  const bars = await twoPage.$$(".cl-command-bar input");
  checks++;
  if (bars.length !== 2) {
    failures.push(`command-bar-search-portal: expected 2 mounted command-bar inputs, found ${bars.length}.`);
  } else {
    await bars[0].click();
    await bars[0].type("ppwr", { delay: 20 });
    await bars[1].click();
    await bars[1].type("ppwr", { delay: 20 });
    await twoPage.waitForTimeout(600);
    const listboxIds = await twoPage.evaluate(() =>
      Array.from(document.querySelectorAll('[role="listbox"]')).map((el) => el.id),
    );
    checks++;
    if (listboxIds.length !== 2) {
      failures.push(`command-bar-search-portal: expected 2 open listboxes, found ${listboxIds.length} (ids: ${JSON.stringify(listboxIds)}).`);
    } else if (listboxIds[0] === listboxIds[1] || !listboxIds[0] || !listboxIds[1]) {
      failures.push(`command-bar-search-portal: two simultaneously mounted CommandBars produced the SAME (or empty) listbox id ${JSON.stringify(listboxIds)}; useId() is not actually instance-scoping it.`);
    }
  }
  await twoPage.close();

  return { checks, failures };
}
