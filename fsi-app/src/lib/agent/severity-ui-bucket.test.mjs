// severity-ui-bucket.test.mjs — Addendum 63 (2026-08-30).
//
// THE RULING (task item 2): the severity vocabulary itself (metadata-vocab.ts) IS single-homed
// and correct. What was NOT single-homed:
//
//   1. [duplication] OperationsItemsView.tsx and OperationsLedger.tsx each hand-copied a
//      byte-identical 13-entry DB-severity -> {critical,high,moderate,low} bucket map
//      independently — the exact "mapping duplicated in two components" defect class this
//      codebase has hit before (WatchlistItemType, ITEM_TYPES, surface_of). Consolidated into
//      SEVERITY_TO_OPERATIONS_BUCKET here; both components now import it.
//
//   2. [silent fall-through to a default] IntelligenceMetadataStrip.tsx's SEVERITY_COLORS map was
//      keyed on the DISPLAY form ("ACTION REQUIRED") but fed the DB form ("action_required")
//      straight off /api/intelligence-items/[id]/metadata's raw select — a lookup that could
//      never hit, so the severity chip silently rendered the neutral fallback colour (and the raw
//      DB string as its own visible text) for every item, regardless of actual severity. Fixed by
//      converting through toDisplaySeverity (metadata-vocab.ts's own display<->db mapping) before
//      the lookup.
//
// This file pins (1) with a real unit test of the shared bucket map, plus source-text regression
// locks on both fixes (the established idiom for logic embedded in components this suite has no
// render harness for — no jsdom/testing-library exists in this repo; see domain-laundering.test.mjs
// for the precedent).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DB_SEVERITY_VALUES, SEVERITY_TO_OPERATIONS_BUCKET, toDisplaySeverity } from "./metadata-vocab.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(HERE, p), "utf8");

// ── 1. SEVERITY_TO_OPERATIONS_BUCKET: every live DB severity value buckets to something ──

test("every DB_SEVERITY_VALUES entry has a bucket (no severity silently falls through this map)", () => {
  for (const v of DB_SEVERITY_VALUES) {
    assert.ok(
      ["critical", "high", "moderate", "low"].includes(SEVERITY_TO_OPERATIONS_BUCKET[v]),
      `${v} has no entry in SEVERITY_TO_OPERATIONS_BUCKET`
    );
  }
});

test("SEVERITY_TO_OPERATIONS_BUCKET maps the 5 SKILL.md labels to their documented bucket", () => {
  assert.equal(SEVERITY_TO_OPERATIONS_BUCKET.action_required, "critical");
  assert.equal(SEVERITY_TO_OPERATIONS_BUCKET.cost_alert, "high");
  assert.equal(SEVERITY_TO_OPERATIONS_BUCKET.window_closing, "moderate");
  assert.equal(SEVERITY_TO_OPERATIONS_BUCKET.competitive_edge, "moderate");
  assert.equal(SEVERITY_TO_OPERATIONS_BUCKET.monitoring, "low");
});

test("SEVERITY_TO_OPERATIONS_BUCKET is a pass-through identity for the 4 already-bucketed per-surface values", () => {
  assert.equal(SEVERITY_TO_OPERATIONS_BUCKET.critical, "critical");
  assert.equal(SEVERITY_TO_OPERATIONS_BUCKET.high, "high");
  assert.equal(SEVERITY_TO_OPERATIONS_BUCKET.moderate, "moderate");
  assert.equal(SEVERITY_TO_OPERATIONS_BUCKET.low, "low");
});

// ── 2. Regression: OperationsItemsView.tsx / OperationsLedger.tsx import the shared map, no local copy ──

test("OperationsItemsView.tsx has no local SEVERITY_COLUMN_TO_KEY duplicate; imports the shared bucket map", () => {
  const code = read("../../components/operations/OperationsItemsView.tsx");
  assert.doesNotMatch(code, /const SEVERITY_COLUMN_TO_KEY/);
  assert.match(code, /import\s*\{\s*SEVERITY_TO_OPERATIONS_BUCKET\s*\}\s*from\s*"@\/lib\/agent\/metadata-vocab"/);
});

test("OperationsLedger.tsx has no local SEVERITY_COLUMN_TO_KEY duplicate; imports the shared bucket map", () => {
  const code = read("../../components/operations/OperationsLedger.tsx");
  assert.doesNotMatch(code, /const SEVERITY_COLUMN_TO_KEY/);
  assert.match(code, /import\s*\{\s*SEVERITY_TO_OPERATIONS_BUCKET\s*\}\s*from\s*"@\/lib\/agent\/metadata-vocab"/);
});

// ── 3. Regression: IntelligenceMetadataStrip converts DB form -> display form before the color lookup ──

test("IntelligenceMetadataStrip converts meta.severity through toDisplaySeverity before indexing SEVERITY_COLORS", () => {
  const raw = read("../../components/resource/IntelligenceMetadataStrip.tsx");
  assert.match(raw, /import\s*\{\s*toDisplaySeverity\s*\}\s*from\s*"@\/lib\/agent\/metadata-vocab"/);
  // Strip comment lines (this test's own doc comments above cite the pre-fix literal
  // `SEVERITY_COLORS[meta.severity]` as prose) — check the real code only, the same idiom
  // domain-laundering.test.mjs uses for this class of source-text assertion.
  const code = raw
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
  // The color lookup must key off the converted value, not the raw DB-form meta.severity.
  assert.match(code, /SEVERITY_COLORS\[severityDisplay\]/);
  assert.doesNotMatch(code, /SEVERITY_COLORS\[meta\.severity\]/);
  // The chip must render the converted label, not the raw DB string ("action_required").
  assert.doesNotMatch(code, />\s*\{meta\.severity\}\s*<\/span>/);
});

// ── 4. toDisplaySeverity itself: the exact bug scenario ──

test("toDisplaySeverity converts the DB form the API route actually returns into the DISPLAY form SEVERITY_COLORS is keyed on", () => {
  assert.equal(toDisplaySeverity("action_required"), "ACTION REQUIRED");
  assert.equal(toDisplaySeverity("cost_alert"), "COST ALERT");
  assert.equal(toDisplaySeverity("window_closing"), "WINDOW CLOSING");
  assert.equal(toDisplaySeverity("competitive_edge"), "COMPETITIVE EDGE");
  assert.equal(toDisplaySeverity("monitoring"), "MONITORING");
});

test("toDisplaySeverity falls back to the raw value for a per-surface legacy severity (no crash, no data loss)", () => {
  assert.equal(toDisplaySeverity("critical"), "critical");
  assert.equal(toDisplaySeverity("watch"), "watch");
});

test("toDisplaySeverity(null/undefined) is null (severity is nullable)", () => {
  assert.equal(toDisplaySeverity(null), null);
  assert.equal(toDisplaySeverity(undefined), null);
});
