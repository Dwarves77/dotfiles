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

export function fullAppCss() {
  const globals = readFileSync(join(APP_DIR, "globals.css"), "utf8");
  const theme = readFileSync(join(APP_DIR, "theme.css"), "utf8");
  return `${theme}\n${globals}`;
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
      },
    ],
    limit: 50,
  };

  const TYPES = ["source", "reg", "signal", "research", "operations", "market_series"];
  const extreme = {
    items: Array.from({ length: 24 }, (_, i) => ({
      id: `w${i}`,
      type: TYPES[i % TYPES.length],
      title: `${LONG(6, "Extremely long watched item title token")} #${i}`,
      source: `${LONG(4, "Very-long-source-name-segment")}`,
      jurisdiction: i % 3 === 0 ? "EU" : i % 3 === 1 ? "US-CA" : undefined,
      lastChangedAt: `2026-0${(i % 8) + 1}-01T00:00:00Z`,
      scope: i % 2 === 0 ? "team" : "personal",
      note: i % 2 === 0 ? LONG(20, "long-team-note-word") : undefined,
      addedBy: i % 2 === 0 ? "Priya Patel" : undefined,
    })),
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
