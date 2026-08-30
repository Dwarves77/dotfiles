// taxonomy.npmtest.mjs — proof for the extracted Research theme/severity classifiers.
//
// Named *.npmtest.mjs (not *.test.mjs) deliberately, same reasoning as theme-brief.npmtest.mjs:
// fsi-app/src/lib/research/ matches no glob in .discipline/run-test-suite.sh (that list is
// explicit, not a directory scan), so a *.test.mjs here would be an ORPHANED PROOF — green
// locally, executed by nothing in CI. `git ls-files 'fsi-app/src/**/*.npmtest.mjs'` is the
// directory-agnostic glob discipline.yml's "App unit tests requiring npm deps" job actually
// wires up (execution-wiring.mjs surface 2), so this naming is what makes the proof run.
//
// WHAT THIS PINS. The table below is a representative-input contract for assignTheme() and
// deriveSeverity(): a future edit to the one home (taxonomy.mjs) that silently changes what a
// row like these classifies as will fail here first. It also specifically encodes the
// last-mile HYBRID decision made during extraction (taxonomy.mjs header, item 1) — the two
// live "false positive" texts that ResearchLedger.tsx's pre-extraction bare-EV/battery
// keywords would have caught and this module deliberately does not, plus the two live
// eHGV texts both former copies (in Detail's case, only after this extraction) correctly
// catch. Every text below is either drawn from, or is a minimal synthetic stand-in for, a
// live /research row read from the corpus during extraction (2026-08-30).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  THEME_KEYS,
  THEME_LABELS,
  THEME_COLUMN_TO_KEY,
  THEME_KEYWORDS,
  assignTheme,
  SEVERITY_KEYS,
  SEVERITY_LABELS,
  deriveSeverity,
} from "./taxonomy.mjs";

// ── assignTheme: DB column wins over keywords ──

test("assignTheme: a recognized theme column wins, even if the text would match a different keyword", () => {
  // Text reads as "carbon markets" (EU ETS) but the stored column says packaging.
  const text = "EU ETS Phase 4 carbon price update";
  assert.equal(assignTheme(text, "packaging_circular"), "packaging");
});

test("assignTheme: an unrecognized/stale theme column falls through to keywords, not silently dropped", () => {
  const text = "PPWR reuse targets for crate pooling";
  assert.equal(assignTheme(text, "some_retired_theme_value"), "packaging");
});

test("assignTheme: no column, no keyword match -> null (honest omission)", () => {
  assert.equal(assignTheme("McKinsey insights on quantum computing and AI adoption", null), null);
});

// ── assignTheme: representative keyword table (one per theme) ──

const THEME_TABLE = [
  ["Scope 3 accounting methodology shift for freight forwarders", "emissions"],
  ["SAF production capacity and hydrogen feedstock constraints", "fuels"],
  ["PPWR reuse targets tighten crate verification standards", "packaging"],
  ["EU ETS Phase 4 allowance price trajectory", "carbon"],
  ["Climate-controlled art handling for fine art transport during conservation projects", "cold-chain"],
  ["Cargo bay restrictions widen for last-mile urban delivery of EV fleets", "last-mile"],
  ["CSRD omnibus revisions change disclosure reporting standard timelines", "disclosure"],
];

for (const [text, expected] of THEME_TABLE) {
  test(`assignTheme: "${text}" -> ${expected}`, () => {
    assert.equal(assignTheme(text), expected);
  });
}

test("assignTheme: THEME_KEYS, THEME_LABELS and THEME_KEYWORDS stay in lockstep", () => {
  for (const key of THEME_KEYS) {
    assert.ok(THEME_LABELS[key], `missing label for ${key}`);
    assert.ok(Array.isArray(THEME_KEYWORDS[key]) && THEME_KEYWORDS[key].length > 0, `missing keywords for ${key}`);
  }
  assert.equal(Object.keys(THEME_LABELS).length, THEME_KEYS.length);
  assert.equal(Object.keys(THEME_KEYWORDS).length, THEME_KEYS.length);
});

test("assignTheme: THEME_COLUMN_TO_KEY only ever points at a real THEME_KEYS entry", () => {
  for (const key of Object.values(THEME_COLUMN_TO_KEY)) {
    assert.ok(THEME_KEYS.includes(key), `${key} is not a real ThemeKey`);
  }
});

// ── assignTheme: the last-mile HYBRID decision, pinned against the live-corpus evidence ──

test("assignTheme: eHGV freight-trial content IS last-mile (evidence-clean addition, kept)", () => {
  // Drawn from the live "Project JOLT" rows (electric heavy goods vehicle trials).
  const text =
    "Project JOLT: Real-World eHGV Trials and Sustainable Road Freight Initiatives. " +
    "Real-world trials of electric heavy goods vehicles (eHGVs) across logistics, energy supply, " +
    "infrastructure, and finance.";
  assert.equal(assignTheme(text), "last-mile");
});

test("assignTheme: an EV mention qualified by fleet/charging/cargo IS last-mile", () => {
  assert.equal(assignTheme("Urban EV charging rollout for cargo fleets"), "last-mile");
});

test("assignTheme: a bare, unqualified EV mention is NOT last-mile (dropped false-positive pattern)", () => {
  // Drawn from the live "Global EV Outlook 2024" rows: general EV-market analysis, not
  // last-mile-freight-specific. Ledger's pre-extraction bare `\bev\b` pattern caught this live;
  // the extracted module deliberately does not (taxonomy.mjs header, item 1).
  const text = "IEA Global EV Outlook 2024 provides comprehensive analysis of electric vehicle market trends.";
  assert.equal(assignTheme(text), null);
});

test("assignTheme: a generic battery/energy-storage mention is NOT last-mile (dropped false-positive pattern)", () => {
  // Drawn from the live "Warehouse Solar & BESS ROI Analysis" row: warehouse energy storage,
  // not last-mile freight. Ledger's pre-extraction generic `battery` pattern caught this live;
  // the extracted module deliberately does not.
  const text = "Rooftop solar and battery energy storage ROI for warehouse operations.";
  assert.equal(assignTheme(text), null);
});

// ── deriveSeverity: DB column short-circuit (preserved from ResearchFindingDetailSurface.tsx) ──

test("deriveSeverity: a literal severityColumn value short-circuits the text/date heuristics", () => {
  assert.equal(deriveSeverity("routine monitoring update", null, "action"), "action");
  assert.equal(deriveSeverity("nothing alarming here", null, "cost"), "cost");
});

test("deriveSeverity: an unrecognized severityColumn (the real migration-102 enum, e.g. 'monitoring') falls through to the heuristic, exactly as it always has live", () => {
  // Confirmed live (2026-08-30, project kwrsbpiseruzbfwjpvsp): real `severity` values on the
  // research candidate population are competitive_edge / cost_alert / monitoring / NULL — never
  // the literal "action"/"cost"/"monitor"/"background" this short-circuit checks for. So this
  // case is what actually happens on every live row that has a severity column value.
  assert.equal(deriveSeverity("Routine background coverage.", null, "monitoring"), "background");
});

// ── deriveSeverity: representative table ──

const NOW = Date.now();
const RECENT_ISO = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
const OLD_ISO = new Date(NOW - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago

test("deriveSeverity: action-required language wins regardless of recency", () => {
  assert.equal(deriveSeverity("Filing deadline: action required before the cease order takes effect", OLD_ISO), "action");
});

test("deriveSeverity: cost/pricing language wins over plain recency", () => {
  assert.equal(deriveSeverity("Carrier surcharge pass-through raises margin pressure", RECENT_ISO), "cost");
});

test("deriveSeverity: the /kwh and tco additions (Ledger's superset, adopted) classify as cost", () => {
  // Drawn from the live "Project JOLT" row: "capital costs, payload, range, TCO, and battery
  // performance" — the one live text where the two former copies actually disagreed.
  assert.equal(deriveSeverity("Data collection on capital costs, payload, range, TCO, and battery performance", OLD_ISO), "cost");
  assert.equal(deriveSeverity("Utility-scale solar LCOE $30-50/MWh, evaluate at $0.04/kWh", OLD_ISO), "cost");
});

test("deriveSeverity: recent, no action/cost language -> monitor", () => {
  assert.equal(deriveSeverity("New research consortium launches a fleet electrification study", RECENT_ISO), "monitor");
});

test("deriveSeverity: old, no action/cost language -> background", () => {
  assert.equal(deriveSeverity("Development financing supports transport infrastructure globally", OLD_ISO), "background");
});

test("deriveSeverity: no addedDate at all, no action/cost language -> background (never guesses recency)", () => {
  assert.equal(deriveSeverity("Framework underpinning national sustainability legislation", null), "background");
});

test("deriveSeverity: SEVERITY_KEYS and SEVERITY_LABELS stay in lockstep", () => {
  assert.equal(Object.keys(SEVERITY_LABELS).length, SEVERITY_KEYS.length);
  for (const key of SEVERITY_KEYS) assert.ok(SEVERITY_LABELS[key]);
});

// ── defensive on missing/malformed inputs ──

test("assignTheme and deriveSeverity are defensive on empty/undefined text", () => {
  assert.equal(assignTheme(""), null);
  assert.equal(assignTheme(undefined), null);
  assert.equal(deriveSeverity(""), "background");
  assert.equal(deriveSeverity(undefined), "background");
});
