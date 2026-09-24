// Fixture data builders for the SM smoke specs (Lane GATES-1, 2026-09-02). Pure data, no DOM/esbuild/
// Playwright — kept separate from harness.mjs so a future spec can reuse a builder without pulling in
// esbuild, and so this file's shapes are directly node-`--test`-able (see harness.test.mjs).
//
// Each builder returns the THREE states every smoke spec renders (empty / one-row / extreme-data),
// named to match the brief: "the component in its empty, one-row, extreme-data states."

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LONG = (n, word = "extremely-long-token") =>
  Array.from({ length: n }, (_, i) => `${word}-${i}`).join(" ");

// ── Full app CSS (globals.css + theme.css), read live from disk ────────────────────────────────
// Supersedes hand-copying a CSS subset (see ROW_SYSTEM_CSS below, kept for the two specs already
// built on it). Found the hard way building operations-rows-smoke.mjs: OperationsLedger's
// top-level layout depends on a PRE-EXISTING responsive class (`.cl-ops-grid`, `@media (max-width:
// 1200px)`, globals.css — not part of this lane's row-system addition) to collapse its
// content+rail grid on a phone; injecting only ROW_SYSTEM_CSS left `.cl-ops-grid`'s
// `grid-template-columns: 1fr 300px` un-collapsed at 375px, so the smoke page measured a FALSE
// horizontal-overflow / squeezed-title failure that does not reproduce in the real app (confirmed:
// re-running the same fixture with the real globals.css file gives a clean, non-overflowing
// layout — see this lane's REPORT for the before/after DOM trace). Reading the real files removes
// the drift risk entirely and is what regulations-rows-smoke.mjs and home-sections-smoke.mjs use.
// theme.css supplies the `--color-*` / `--reg-band-*` custom properties every component's inline
// `style` reads; it cannot affect layout WIDTH (colour/shadow tokens only) but is included for
// full production fidelity rather than asserting that boundary holds for every future style.
const HERE = fileURLToPath(new URL(".", import.meta.url));
const APP_DIR = join(HERE, "../../../src/app");

// ── RD-80 (lane G3, 2026-09-22): the application's own font files, one home ────────────────────
// Prior state [CONFIRMED, 2026-09-22 diagnosis]: fullAppCss() read globals.css + theme.css only;
// the fonts are `@fontsource/*` imports in layout.tsx, so no `@font-face` ever reached a mounted
// fixture, `document.fonts.size` was 0 on every guard page, and both declared font stacks
// (`--font-sans`, `--font-display`) resolved to whatever OS fallback the running machine happened
// to carry, a DIFFERENT fallback on Ubuntu CI than on Windows, so the same commit measured
// different text-dependent layout (clipping, wrapping, hit targets, card heights) on each platform.
// Fix: vendor the exact woff2 files the app ships (weights + latin subset only, per layout.tsx's
// @fontsource imports; each package's LICENSE sits beside its files) and declare @font-face rules
// against them here, in the ONE place every consumer of fullAppCss()/fullAppCssCompiled() reads,
// no smoke spec declares its own. `font-display: block` (never "swap" or "auto") so a measurement
// never runs against the fallback-during-load frame.
//
// data: URIs, not `file://`, per compose-composite.mjs's own header (same directory, pre-existing):
// "a `file://` subresource from an opaque origin is blocked by the browser", every page this
// harness opens is a `page.setContent()` document (an about:blank/opaque origin), which is exactly
// that case, [CONFIRMED, 2026-09-22]: a `file://` @font-face `src` in that context left every
// declared face permanently `unloaded` (`document.fonts.check()` false after `document.fonts.ready`
// resolved with nothing pending, since a face nobody has referenced never starts loading) and an
// explicit `document.fonts.load()` call threw `NetworkError`. Base64-inlining removes the
// cross-origin fetch entirely; the four vendored files total under 80 KB, trivial inlined.
const FONTS_DIR = join(HERE, "../fixtures/fonts");
const fontFileDataUri = (family, file) =>
  `data:font/woff2;base64,${readFileSync(join(FONTS_DIR, family, file)).toString("base64")}`;

let _fontFaceCssCache = null;
export function fontFaceCss() {
  if (_fontFaceCssCache) return _fontFaceCssCache;
  const jakarta = (weight) =>
    `@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:${weight};font-display:block;src:url('${fontFileDataUri("plus-jakarta-sans", `plus-jakarta-sans-latin-${weight}-normal.woff2`)}') format('woff2');}`;
  const anton = `@font-face{font-family:'Anton';font-style:normal;font-weight:400;font-display:block;src:url('${fontFileDataUri("anton", "anton-latin-400-normal.woff2")}') format('woff2');}`;
  _fontFaceCssCache = [jakarta(400), jakarta(500), jakarta(600), jakarta(700), jakarta(800), anton].join("\n");
  return _fontFaceCssCache;
}

// The weight/family pairs every measurement pass must confirm resolved via `document.fonts.check`
// before trusting a layout measurement taken against them (RD-80 build item 3). Kept here, beside
// the declarations, so the two can never drift apart.
export const REQUIRED_FONT_CHECKS = [
  "400 16px 'Plus Jakarta Sans'",
  "500 16px 'Plus Jakarta Sans'",
  "600 16px 'Plus Jakarta Sans'",
  "700 16px 'Plus Jakarta Sans'",
  "800 16px 'Plus Jakarta Sans'",
  "400 16px 'Anton'",
];

// The single "load the real faces onto this page and confirm they resolved" routine (RD-80 build
// item 3), shared by run-rendering-guard.mjs (where every fixture leg calls it after setContent) and
// by rd-80-real-fonts.npmtest.mjs (which calls the SAME function against a bare page, so the test
// proves the harness's real code path rather than a reimplementation of it). A face is lazy, it does
// not start loading until something on the page matches it, so this calls `document.fonts.load()`
// explicitly for every required spec before awaiting `document.fonts.ready`; without that, a fixture
// that never renders the exact family+weight text would read "ready" with nothing pending and every
// `check()` would report false even though the face is perfectly loadable. Returns the specs that
// failed to resolve (empty = every declared face loaded); never throws, so a caller can fold the
// result into its own failure list instead of crashing the whole run on the first miss.
//
// `document.fonts.check()` ALONE is not sufficient [CONFIRMED, 2026-09-22, this lane, by attack]: it
// reads VACUOUSLY TRUE when the FontFaceSet holds ZERO entries for that family at all, the exact
// "no @font-face reached this page" failure this function exists to catch would report as a clean
// pass on `check()` alone. So this also confirms a `loaded` FontFace actually EXISTS in
// `document.fonts` for the family+weight before trusting `check()`'s answer.
export async function assertFontsReady(page) {
  await page.addStyleTag({ content: fontFaceCss() });
  return verifyFontsLoaded(page);
}

// The same confirmation WITHOUT injecting anything (lane MASTHEAD-AUTH, 2026-09-24, RD-82): it
// asks whether the stylesheet the page ALREADY carries declared and loaded every required face.
// The layout guard and the auth page leg mount through `fullAppCssCompiled()`, which does carry
// `fontFaceCss()`, but neither ever checked that the faces resolved before measuring, so a change
// that dropped the declarations from that stylesheet would have measured every title in a fallback
// face and still passed. `assertFontsReady` injects first and so can never see that; this is the
// precondition that can, and its attack test (rd-82-title-words.npmtest.mjs) mounts a page whose
// CSS lacks the declarations and requires it to fail. `document.fonts.load()` here loads only what
// the page itself declared: with no @font-face for a family it resolves to nothing, the registered
// check below finds no loaded FontFace, and the spec is reported.
export async function verifyFontsLoaded(page) {
  return page.evaluate(async (checks) => {
    await Promise.all(checks.map((spec) => document.fonts.load(spec)));
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((f) => f.status === "loaded");
    return checks.filter((spec) => {
      const m = spec.match(/^(\d+)\s+\d+px\s+'([^']+)'$/);
      if (!m) return true;
      const [, weight, family] = m;
      const registered = loaded.some((f) => f.family.replace(/^['"]|['"]$/g, "") === family && f.weight === weight);
      return !registered || !document.fonts.check(spec);
    });
  }, REQUIRED_FONT_CHECKS);
}

export function fullAppCss() {
  const globals = readFileSync(join(APP_DIR, "globals.css"), "utf8");
  const theme = readFileSync(join(APP_DIR, "theme.css"), "utf8");
  return `${fontFaceCss()}\n${theme}\n${globals}`;
}

// ── Compiled app CSS, Tailwind utilities included (lane compose-other, 2026-09-08) ─────────────────
// `fullAppCss()` above reads globals.css raw — fine for every mount to date, none of which render a
// component styled with Tailwind UTILITY classes (`flex`, `shrink-0`, `md:flex`, …) rather than
// inline `style`/CSS custom properties. This lane's full-page composition mounts DO (AppShell's
// `Sidebar.tsx`/`TopBar.tsx` predate the inline-style convention the shared `components/ui/*` parts
// follow) — a raw-file read leaves globals.css's `@import "tailwindcss"` and `@theme inline { }`
// block un-expanded (a browser `<style>` tag can't resolve either), so the sidebar rendered with NO
// layout classes at all (flat, unstyled list) the first time this was tried; confirmed by diffing
// `compose-10-map-built.png` before/after. Compiling through the SAME `@tailwindcss/postcss` plugin
// the real Next build uses (postcss.config.mjs) — not a hand-rolled utility subset — produces the
// real generated CSS from the real `src/` tree's class usage, then this is CACHED for the process
// lifetime (each capture script call is its own process; ~1-2s compile cost paid once per capture,
// never in the CI test/gate path — no compose-* mount is in-loop with run-rendering-guard.mjs).
let _compiledCache = null;
export async function fullAppCssCompiled() {
  if (_compiledCache) return _compiledCache;
  const { default: postcss } = await import("postcss");
  const { default: tailwind } = await import("@tailwindcss/postcss");
  const globals = readFileSync(join(APP_DIR, "globals.css"), "utf8");
  const result = await postcss([tailwind({ base: join(APP_DIR, "../../") })]).process(globals, {
    from: join(APP_DIR, "globals.css"),
  });
  const theme = readFileSync(join(APP_DIR, "theme.css"), "utf8");
  _compiledCache = `${fontFaceCss()}\n${theme}\n${result.css}`;
  return _compiledCache;
}

// ── Row-system CSS (Lane MOBILE, 2026-09-03) ────────────────────────────────────────────────────
// `runUxSpec`'s harness (ux-harness.mjs / mountBundle) bundles and mounts ONLY the target component's
// own JS/TSX via esbuild + page.addScriptTag — it never loads the app's globals.css (that only
// happens through the real Next.js root layout). This lane's primary fix is a set of CSS classes
// (.cl-row / .cl-row__main / .cl-row__aside / .cl-row__figure / .cl-row__actions / .cl-row-grid* /
// .cl-section-head*) added to src/app/globals.css, so a mounted-component-only smoke test would
// measure the UNSTYLED, pre-fix layout and fail to verify the fix at all.
//
// ROW_SYSTEM_CSS is a disclosed, intentional verbatim duplicate of that globals.css block, injected
// by each row/section smoke spec via a <style> tag appended to document.head at ENTRY module-eval
// time (before window.__mount runs) — see market-rows-smoke.mjs et al. This is a workaround for a
// real gap in ux-harness.mjs (it has no general external-stylesheet loading mechanism), not a
// long-term substitute for one; a future lane should teach the harness to load globals.css directly
// so specs never need to hand-copy CSS. If this block and globals.css's row-system section ever
// diverge, globals.css is the source of truth — update this constant to match.
export const ROW_SYSTEM_CSS = `
.cl-row { min-width: 0; }
.cl-row__main { min-width: 0; }
.cl-row__main [data-guard-title] { overflow-wrap: anywhere; }
.cl-row__aside { flex-shrink: 0; min-width: 0; }
.cl-row__figure { min-width: 0; }
.cl-row__actions { display: flex; align-items: center; gap: 8px; min-width: 0; }

@media (max-width: 640px) {
  .cl-row {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 10px !important;
  }
  .cl-row__aside {
    width: 100% !important;
    flex-direction: row !important;
    flex-wrap: wrap !important;
    justify-content: space-between !important;
    align-items: center !important;
    gap: 8px 12px !important;
  }
  .cl-row__figure {
    text-align: left !important;
    max-width: 100% !important;
    flex: 1 1 auto !important;
  }
  .cl-row__figure > * {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    max-width: 100% !important;
  }
}

.cl-row-grid { display: grid; align-items: center; column-gap: 14px; row-gap: 4px; min-width: 0; }
.cl-row-grid__title { min-width: 0; }
.cl-row-grid__title [data-guard-title] { overflow-wrap: anywhere; }
.cl-row-grid__meta { display: flex; align-items: center; gap: 8px; min-width: 0; }

@media (max-width: 640px) {
  .cl-row-grid {
    grid-template-columns: auto 1fr !important;
  }
  .cl-row-grid__label { grid-column: 1; grid-row: 1; }
  .cl-row-grid__title { grid-column: 2; grid-row: 1; }
  .cl-row-grid__meta {
    grid-column: 1 / -1 !important;
    grid-row: 2 !important;
    justify-content: flex-start !important;
    flex-wrap: wrap !important;
  }
  .cl-row-grid__title--clamp3 {
    display: -webkit-box !important;
    -webkit-line-clamp: 3 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
  }
}

.cl-ops-item-card { min-width: 0; }
@media (max-width: 640px) {
  .cl-ops-item-card { grid-template-columns: 1fr !important; }
}

.cl-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; min-width: 0; }
.cl-section-head__title { min-width: 0; overflow-wrap: anywhere; }
.cl-section-head__aside { min-width: 0; }

@media (max-width: 640px) {
  .cl-section-head {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 4px !important;
  }
}
`;

// ── Watchlist (team) — WatchlistSurface({ items, limit }) ──────────────────────────────────────
export function watchlistFixtures() {
  const empty = { items: [], limit: 50 };

  // UILISTS lane (2026-09-06): `priority`/`impactScores`/`sourceTier`/`complianceDeadline` are
  // additive columns this lane's fetchWatchlist extension now populates for the three
  // ITEM_BACKED_TYPES (reg/research/operations) — WatchlistSurface renders those rows through the
  // shared ListRow (same row anatomy as the other four surfaces) only when `priority` is present;
  // source/market_series rows carry none of them and render the Absence convention. `priority` on
  // the "reg" oneRow fixture exercises the ListRow path (see WatchlistSurface.tsx's own header).
  const oneRow = {
    items: [
      {
        id: "w1",
        type: "reg",
        title: "EU Packaging and Packaging Waste Regulation",
        source: "Official Journal of the EU",
        jurisdiction: "EU",
        lastChangedAt: "2026-08-01T00:00:00Z",
        scope: "team",
        note: "Flagged for the compliance review ahead of the Q4 filing.",
        addedBy: "Alice Chen",
        priority: "HIGH",
        sourceTier: 3,
      },
    ],
    limit: 50,
  };

  const TYPES = ["source", "reg", "signal", "research", "operations", "market_series"];
  const ITEM_BACKED = new Set(["reg", "research", "operations"]);
  const extreme = {
    items: Array.from({ length: 24 }, (_, i) => {
      const type = TYPES[i % TYPES.length];
      return {
        id: `w${i}`,
        type,
        title: `${LONG(6, "Extremely long watched item title token")} #${i}`,
        source: `${LONG(4, "Very-long-source-name-segment")}`,
        jurisdiction: i % 3 === 0 ? "EU" : i % 3 === 1 ? "US-CA" : undefined,
        lastChangedAt: `2026-0${(i % 8) + 1}-01T00:00:00Z`,
        scope: i % 2 === 0 ? "team" : "personal",
        note: i % 2 === 0 ? LONG(20, "long-team-note-word") : undefined,
        addedBy: i % 2 === 0 ? "Priya Patel" : undefined,
        priority: ITEM_BACKED.has(type) ? (i % 4 === 0 ? "CRITICAL" : i % 4 === 1 ? "HIGH" : i % 4 === 2 ? "MODERATE" : "LOW") : undefined,
        sourceTier: ITEM_BACKED.has(type) ? (i % 7) + 1 : undefined,
      };
    }),
    // limit === items.length: exercises the "standing at the read cap" honest banner (§4).
    limit: 24,
  };

  return { empty, oneRow, extreme };
}

// ── Personal archive — ArchiveViewer() reads useResourceStore, so this returns STORE STATE, not
//    props. `resources` backs a personal row's stub-fallback lookup when the corpus is loaded. ────
export function archiveFixtures() {
  const empty = { archived: [], resources: [], personalState: new Map() };

  const oneRow = {
    archived: [],
    resources: [{ id: "p1", title: "Personal Archived Regulation", note: "", tags: [] }],
    personalState: new Map([
      ["p1", { itemId: "p1", isArchived: true, archiveNote: "Superseded by the 2026 revision.", archivedAt: "2026-08-01T00:00:00Z" }],
    ]),
  };

  const REASONS = ["superseded", "expired", "out-of-scope", "duplicate"];
  const teamCount = 10;
  const personalCount = 10;
  const archived = Array.from({ length: teamCount }, (_, i) => ({
    id: `t${i}`,
    title: `${LONG(5, "Extremely long team archive title token")} #${i}`,
    note: LONG(6, "team-archive-note-word"),
    tags: ["reg", "compliance"],
    archiveReason: REASONS[i % REASONS.length],
    archivedDate: `2026-0${(i % 8) + 1}-15`,
    replacedBy: i % 4 === 0 ? `t${i + 1}` : undefined,
  }));
  const resources = archived.map((r) => ({ ...r, isArchived: false }));
  const personalEntries = Array.from({ length: personalCount }, (_, i) => [
    `pp${i}`,
    {
      itemId: `pp${i}`,
      isArchived: true,
      archiveNote: LONG(8, "personal-archive-note-word"),
      archivedAt: `2026-0${(i % 8) + 1}-20T00:00:00Z`,
    },
  ]);
  const extreme = {
    archived,
    resources: [
      ...resources,
      ...Array.from({ length: personalCount }, (_, i) => ({
        id: `pp${i}`,
        title: `${LONG(5, "Extremely long personal archive title token")} #${i}`,
        note: "",
        tags: [],
        archiveReason: REASONS[i % REASONS.length],
      })),
    ],
    personalState: new Map(personalEntries),
  };

  return { empty, oneRow, extreme };
}

// ── List order — DashboardTopPriority({ resources, jurisdictionsCount }) ───────────────────────
export function listOrderFixtures() {
  const empty = { resources: [], jurisdictionsCount: 0 };

  const oneRow = {
    resources: [
      {
        id: "r1",
        title: "Corporate Sustainability Reporting Directive",
        priority: "CRITICAL",
        urgencyScore: 95,
        jurisdiction: "EU",
        jurisdictionIso: ["EU"],
        sourceTier: 1,
        whyMatters: "Binding disclosure obligations begin next fiscal year.",
        actionOwner: "Jane Doe",
        complianceDeadline: "2027-01-01",
      },
    ],
    jurisdictionsCount: 1,
  };

  const extreme = {
    resources: Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      title: `${LONG(7, "Extremely long regulation title token")} #${i}`,
      priority: "CRITICAL",
      urgencyScore: 100 - i,
      jurisdiction: i % 2 === 0 ? "EU" : "US-CA",
      jurisdictionIso: [i % 2 === 0 ? "EU" : "US"],
      sourceTier: (i % 7) + 1,
      whyMatters: LONG(30, "long-analysis-word"),
      actionOwner: `${LONG(3, "Very-Long-Owner-Name-Segment")}`,
      complianceDeadline: i % 3 === 0 ? undefined : `2027-0${(i % 9) + 1}-01`,
    })),
    jurisdictionsCount: 6,
  };

  return { empty, oneRow, extreme };
}

// ── Notifications — bell unread badge + NotificationsList body, keyed by unread volume. ────────
function notification(i, { long = false } = {}) {
  return {
    id: `n${i}`,
    kind: ["mention", "reply", "invite", "promote", "moderation", "archive"][i % 6],
    payload: {
      title: long ? `${LONG(6, "Extremely long notification title token")} #${i}` : `Notification #${i}`,
      body: long ? LONG(15, "long-notification-body-word") : `Body text ${i}`,
    },
    read_at: null,
    created_at: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
  };
}

export function notificationsFixtures() {
  const empty = { unreadCount: 0, notifications: [], totalMatching: 0 };
  const oneRow = { unreadCount: 1, notifications: [notification(0)], totalMatching: 1 };
  const extreme = {
    unreadCount: 150, // > 99 -> the bell's "99+" truncation
    notifications: Array.from({ length: 20 }, (_, i) => notification(i, { long: true })),
    totalMatching: 150,
  };
  return { empty, oneRow, extreme };
}
