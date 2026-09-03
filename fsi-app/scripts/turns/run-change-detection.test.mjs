// run-change-detection.test.mjs — proves arg parsing, the due-sources window calc, the Browserless
// units estimate, and the raw-step-results shaping into CONVENTION.md's per_item/metrics/inputs_ref, for
// BOTH dry and apply modes. No DB, no network: importing this module never invokes main() (IS_MAIN
// guard) and none of the tested exports touch I/O.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  dueSourcesWindowStart,
  browserlessUnitsEstimate,
  shapeRunOutput,
  defaultTraceDir,
  crossCheckMismatches,
  evaluateScrapeGate,
  routeExitedAtGate,
  SCRAPE_GATE_REASONS,
  CHANGE_DETECTION_GOVERNING_FILES,
  DEFAULT_CHECK_LIMIT,
  DEFAULT_RECONCILE_BATCH,
  BROWSERLESS_UNITS_PER_SOURCE_EST,
} from "./run-change-detection.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: defaults to dry mode, no flags", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "dry");
  assert.equal(r.skipCheck, false);
  assert.equal(r.checkLimit, null);
  assert.equal(r.reconcileBatch, null);
  assert.equal(r.drainLimit, null);
});

test("parseArgs: --mode must be dry or apply", () => {
  const r = parseArgs(["--mode", "sideways"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mode must be/);
});

test("parseArgs: --mode apply parses", () => {
  const r = parseArgs(["--mode", "apply"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "apply");
});

test("parseArgs: --skip-check is a boolean flag", () => {
  const r = parseArgs(["--mode", "apply", "--skip-check"]);
  assert.equal(r.ok, true);
  assert.equal(r.skipCheck, true);
});

test("parseArgs: --check-limit / --reconcile-batch / --drain-limit must be positive integers", () => {
  assert.equal(parseArgs(["--check-limit", "0"]).ok, false);
  assert.equal(parseArgs(["--check-limit", "-5"]).ok, false);
  assert.equal(parseArgs(["--check-limit", "3.5"]).ok, false);
  assert.equal(parseArgs(["--check-limit", "abc"]).ok, false);
  const ok = parseArgs(["--check-limit", "25", "--reconcile-batch", "50", "--drain-limit", "3"]);
  assert.equal(ok.ok, true);
  assert.equal(ok.checkLimit, 25);
  assert.equal(ok.reconcileBatch, 50);
  assert.equal(ok.drainLimit, 3);
});

test("parseArgs: unknown flag is refused (strict mode)", () => {
  const r = parseArgs(["--bogus", "1"]);
  assert.equal(r.ok, false);
});

test("parseArgs: --harness-runs-dir / --trace-dir pass through", () => {
  const r = parseArgs(["--harness-runs-dir", "/tmp/hr", "--trace-dir", "/tmp/tr"]);
  assert.equal(r.ok, true);
  assert.equal(r.harnessRunsDir, "/tmp/hr");
  assert.equal(r.traceDir, "/tmp/tr");
});

// ── dueSourcesWindowStart ────────────────────────────────────────────────────────────────────────

test("dueSourcesWindowStart: UTC-midnight of the given instant, mirroring check-sources/route.ts's inline calc", () => {
  const now = new Date("2026-09-02T17:43:11.500Z");
  assert.equal(dueSourcesWindowStart(now), "2026-09-02T00:00:00.000Z");
});

test("dueSourcesWindowStart: a moment already at UTC midnight is unchanged", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(dueSourcesWindowStart(now), "2026-01-01T00:00:00.000Z");
});

// ── browserlessUnitsEstimate ─────────────────────────────────────────────────────────────────────

test("browserlessUnitsEstimate: sourcesChecked * BROWSERLESS_UNITS_PER_SOURCE_EST", () => {
  assert.equal(browserlessUnitsEstimate(10), 10 * BROWSERLESS_UNITS_PER_SOURCE_EST);
  assert.equal(browserlessUnitsEstimate(0), 0);
});

test("browserlessUnitsEstimate: never negative for a negative/weird input", () => {
  assert.equal(browserlessUnitsEstimate(-3), 0);
});

// ── crossCheckMismatches ─────────────────────────────────────────────────────────────────────────

test("crossCheckMismatches: agreement on both fields yields no mismatches", () => {
  const reported = { changesDetected: 1, portalCandidates: 7 };
  const verifiedByRead = { changeDetectedCount: 1, portalCandidatesTouched: 7 };
  assert.deepEqual(crossCheckMismatches(reported, verifiedByRead), []);
});

test("crossCheckMismatches: a real disagreement on one field is reported by name, not swallowed", () => {
  const reported = { changesDetected: 1, portalCandidates: 7 };
  const verifiedByRead = { changeDetectedCount: 2, portalCandidatesTouched: 7 };
  const mismatches = crossCheckMismatches(reported, verifiedByRead);
  assert.equal(mismatches.length, 1);
  assert.match(mismatches[0], /changesDetected/);
  assert.match(mismatches[0], /route reported 1/);
  assert.match(mismatches[0], /read-only cross-check counted 2/);
});

test("crossCheckMismatches: disagreement on both fields reports both, independently", () => {
  const reported = { changesDetected: 1, portalCandidates: 7 };
  const verifiedByRead = { changeDetectedCount: 2, portalCandidatesTouched: 9 };
  const mismatches = crossCheckMismatches(reported, verifiedByRead);
  assert.equal(mismatches.length, 2);
});

test("crossCheckMismatches: a null/undefined read-only count is 'unavailable', never diffed as a false mismatch", () => {
  const reported = { changesDetected: 1, portalCandidates: 7 };
  const verifiedByRead = { changeDetectedCount: null, portalCandidatesTouched: 7 };
  const mismatches = crossCheckMismatches(reported, verifiedByRead);
  assert.equal(mismatches.length, 1);
  assert.match(mismatches[0], /cross-check unavailable/);
});

test("crossCheckMismatches: missing reported/verifiedByRead (e.g. check skipped) never throws — empty result", () => {
  assert.deepEqual(crossCheckMismatches(null, null), []);
  assert.deepEqual(crossCheckMismatches(undefined, { changeDetectedCount: 1, portalCandidatesTouched: 1 }), []);
  assert.deepEqual(crossCheckMismatches({ changesDetected: 1, portalCandidates: 1 }, null), []);
});

// ── defaultTraceDir ──────────────────────────────────────────────────────────────────────────────

test("defaultTraceDir: one level below the family dir", () => {
  assert.equal(defaultTraceDir("/a/b/change-detection"), "/a/b/change-detection/traces");
});

// ── governing files / defaults sanity (F28 / CONVENTION.md parity surface) ──────────────────────────

test("CHANGE_DETECTION_GOVERNING_FILES names exactly the driver + reconcile.ts + run-intake-cycle.ts", () => {
  assert.deepEqual(CHANGE_DETECTION_GOVERNING_FILES, [
    "scripts/turns/run-change-detection.mjs",
    "src/lib/sources/reconcile.ts",
    "src/lib/intake/run-intake-cycle.ts",
  ]);
});

test("DEFAULT_CHECK_LIMIT mirrors the deployed route's own hardcoded batch (check-sources/route.ts .limit(10))", () => {
  assert.equal(DEFAULT_CHECK_LIMIT, 10);
});

test("DEFAULT_RECONCILE_BATCH mirrors reconcile.ts's own RECONCILE_BATCH default", () => {
  assert.equal(DEFAULT_RECONCILE_BATCH, 200);
});

// ── shapeRunOutput — dry mode ────────────────────────────────────────────────────────────────────

function dryRaw(overrides = {}) {
  return {
    mode: "dry",
    skipCheck: false,
    checkLimit: 10,
    reconcileBatch: 200,
    drainLimit: 5,
    check: {
      skipped: true,
      reason: "dry mode never calls a route that writes (sources, monitoring_queue, portal_link_candidates)",
      dueCount: 42,
      dueSample: [{ id: "src-1", name: "EUR-Lex OJ", base_tier: 1 }],
    },
    reconcile: {
      result: { processed: 1, changesRecorded: 2, staged: 2, pending: 1, errors: [] },
      queueRows: [{ id: "q-1", source_id: "src-1", checked_at: "2026-09-02T00:00:00Z" }],
      pendingTotal: 1,
    },
    drain: { dryRows: [{ id: "su-1", item_id: "item-1", source_id: "src-1", created_at: "2026-09-01T00:00:00Z" }], overflow: 0 },
    ...overrides,
  };
}

test("shapeRunOutput (dry): check step reports skipped + due count + due sample, never claims a write", () => {
  const shaped = shapeRunOutput(dryRaw(), "/tmp/report.json");
  const checkItem = shaped.perItem.find((p) => p.id === "check-sources");
  assert.equal(checkItem.outcome, "skipped");
  assert.match(checkItem.verdict, /42 source\(s\) due/);
  assert.equal(shaped.metrics.sources_checked, 0);
  assert.equal(shaped.metrics.sources_due_for_check, 42);
  assert.equal(shaped.metrics.changes_detected, null, "never fabricated when the route was never called");
});

test("shapeRunOutput (dry): one per_item per due source sample row", () => {
  const shaped = shapeRunOutput(dryRaw(), "/tmp/report.json");
  const dueItem = shaped.perItem.find((p) => p.id === "due:src-1");
  assert.ok(dueItem);
  assert.equal(dueItem.outcome, "due_not_checked");
});

test("shapeRunOutput (dry): reconcile rows are 'would_reconcile', never claimed as reconciled", () => {
  const shaped = shapeRunOutput(dryRaw(), "/tmp/report.json");
  const qItem = shaped.perItem.find((p) => p.id === "queue:q-1");
  assert.equal(qItem.outcome, "would_reconcile");
  assert.equal(shaped.metrics.changes_recorded, 2);
  assert.equal(shaped.metrics.staged, 2);
  assert.equal(shaped.metrics.pending_change_rows, 1);
  assert.equal(shaped.metrics.pending_change_rows_total, 1);
});

test("shapeRunOutput (dry): drain rows are 'would_drain', drained metric counts the dry set, not a real drain", () => {
  const shaped = shapeRunOutput(dryRaw(), "/tmp/report.json");
  const dItem = shaped.perItem.find((p) => p.id === "drain:su-1");
  assert.equal(dItem.outcome, "would_drain");
  assert.equal(shaped.metrics.drained, 1);
  assert.equal(shaped.metrics.approved, null);
  assert.equal(shaped.metrics.rejected, null);
  assert.equal(shaped.metrics.not_drained, 0);
});

test("shapeRunOutput (dry): full_trace_refs points at the raw-result report path", () => {
  const shaped = shapeRunOutput(dryRaw(), "/tmp/cd-report.json");
  assert.deepEqual(shaped.fullTraceRefs, ["/tmp/cd-report.json"]);
});

test("shapeRunOutput (dry): browserless_units_est is 0 when no source was actually checked", () => {
  const shaped = shapeRunOutput(dryRaw(), "/tmp/report.json");
  assert.equal(shaped.metrics.browserless_units_est, 0);
});

// ── shapeRunOutput — apply mode ──────────────────────────────────────────────────────────────────

function applyRaw(overrides = {}) {
  return {
    mode: "apply",
    skipCheck: false,
    checkLimit: 10,
    reconcileBatch: 200,
    drainLimit: 5,
    check: {
      skipped: false,
      httpStatus: 200,
      ok: true,
      body: {
        message: "Checked 3 sources",
        sourcesChecked: 3,
        changesDetected: 1,
        portalCandidates: 7,
        results: [
          { source: "EUR-Lex OJ", status: "accessible", httpStatus: 200, outcome: "reachable", changeDetected: true, portalCandidates: 7 },
          { source: "Federal Register", status: "inaccessible", httpStatus: 429, outcome: "inconclusive", changeDetected: false, portalCandidates: 0, error: "429 (HTTP 429)" },
        ],
      },
      error: null,
      verifiedByRead: { changeDetectedCount: 1, portalCandidatesTouched: 7 },
      mismatches: [],
    },
    reconcile: {
      result: { processed: 1, changesRecorded: 2, staged: 2, pending: 1, errors: [] },
      queueRows: [{ id: "q-1", source_id: "src-1", checked_at: "2026-09-02T00:00:00Z" }],
      pendingTotal: 1,
    },
    drain: {
      result: {
        items: [
          { stagedId: "su-1", itemId: "item-1", disposition: "update_applied", reason: "verified_cheap ($0)" },
          { stagedId: "su-2", itemId: "item-2", disposition: "update_rejected", reason: "machine-rejected" },
        ],
        drained: 2, approved: 1, rejected: 1, notDrained: 0,
      },
    },
    ...overrides,
  };
}

test("shapeRunOutput (apply): check step reports HTTP status + checked count + route-reported change/portal totals", () => {
  const shaped = shapeRunOutput(applyRaw(), "/tmp/report.json");
  const checkItem = shaped.perItem.find((p) => p.id === "check-sources");
  assert.equal(checkItem.outcome, "checked");
  assert.match(checkItem.verdict, /HTTP 200/);
  assert.match(checkItem.verdict, /1 changesDetected/);
  assert.match(checkItem.verdict, /7 portalCandidates/);
  assert.equal(shaped.metrics.sources_checked, 3);
  assert.equal(shaped.metrics.changes_detected, 1);
  assert.equal(shaped.metrics.portal_candidates_touched, 7);
});

test("shapeRunOutput (apply): verified_by_read cross-check is surfaced in metrics, agreeing with the route", () => {
  const shaped = shapeRunOutput(applyRaw(), "/tmp/report.json");
  assert.deepEqual(shaped.metrics.verified_by_read, {
    changes_detected: 1,
    portal_candidates_touched: 7,
    mismatches: [],
  });
});

test("shapeRunOutput (apply): a verified_by_read mismatch is reported as its own per_item, never swallowed", () => {
  const shaped = shapeRunOutput(
    applyRaw({
      check: {
        skipped: false, httpStatus: 200, ok: true,
        body: { sourcesChecked: 3, changesDetected: 1, portalCandidates: 7, results: [] },
        error: null,
        verifiedByRead: { changeDetectedCount: 2, portalCandidatesTouched: 7 },
        mismatches: ["changesDetected: route reported 1, read-only cross-check counted 2"],
      },
    }),
    "/tmp/report.json",
  );
  const mismatchItem = shaped.perItem.find((p) => p.id === "check-sources:verified_by_read");
  assert.ok(mismatchItem, "a mismatch must produce its own per_item, not just a metrics field");
  assert.equal(mismatchItem.outcome, "cross_check_mismatch");
  assert.match(mismatchItem.verdict, /route reported 1, read-only cross-check counted 2/);
  assert.deepEqual(shaped.metrics.verified_by_read.mismatches, ["changesDetected: route reported 1, read-only cross-check counted 2"]);
});

test("shapeRunOutput (apply): one per_item per route result row, error text preserved", () => {
  const shaped = shapeRunOutput(applyRaw(), "/tmp/report.json");
  const ok = shaped.perItem.find((p) => p.id === "check:EUR-Lex OJ");
  const bad = shaped.perItem.find((p) => p.id === "check:Federal Register");
  assert.equal(ok.outcome, "accessible");
  assert.equal(ok.error, null);
  assert.equal(bad.outcome, "inaccessible");
  assert.match(bad.error, /429/);
});

test("shapeRunOutput (apply): a route HTTP error is reported, never silently swallowed", () => {
  const shaped = shapeRunOutput(
    applyRaw({ check: { skipped: false, httpStatus: 401, ok: false, body: { error: "unauthorized" }, error: "unauthorized", verifiedByRead: { changeDetectedCount: 0, portalCandidatesTouched: 0 }, mismatches: [] } }),
    "/tmp/report.json",
  );
  const checkItem = shaped.perItem.find((p) => p.id === "check-sources");
  assert.equal(checkItem.outcome, "route_error");
  assert.equal(checkItem.error, "unauthorized");
});

test("shapeRunOutput (apply): reconcile rows are 'reconcile_pass_ran' (not per-row outcome fabricated)", () => {
  const shaped = shapeRunOutput(applyRaw(), "/tmp/report.json");
  const qItem = shaped.perItem.find((p) => p.id === "queue:q-1");
  assert.equal(qItem.outcome, "reconcile_pass_ran");
});

test("shapeRunOutput (apply): drain items map disposition verbatim from the real drain result, never a dry label", () => {
  const shaped = shapeRunOutput(applyRaw(), "/tmp/report.json");
  const applied = shaped.perItem.find((p) => p.id === "drain:su-1");
  const rejected = shaped.perItem.find((p) => p.id === "drain:su-2");
  assert.equal(applied.outcome, "update_applied");
  assert.equal(applied.error, null);
  assert.equal(rejected.outcome, "update_rejected");
  assert.equal(rejected.error, "machine-rejected");
  assert.equal(shaped.metrics.drained, 2);
  assert.equal(shaped.metrics.approved, 1);
  assert.equal(shaped.metrics.rejected, 1);
  assert.equal(shaped.metrics.not_drained, 0);
});

test("shapeRunOutput (apply): browserless_units_est scales with sources_checked", () => {
  const shaped = shapeRunOutput(applyRaw(), "/tmp/report.json");
  assert.equal(shaped.metrics.browserless_units_est, 3 * BROWSERLESS_UNITS_PER_SOURCE_EST);
});

test("shapeRunOutput: dry never says 'written' or 'reconciled' anywhere in a verdict string", () => {
  const shaped = shapeRunOutput(dryRaw(), "/tmp/report.json");
  for (const item of shaped.perItem) {
    assert.doesNotMatch(item.verdict ?? "", /\bwritten\b/i);
    assert.doesNotMatch(item.verdict ?? "", /\breconciled\b/i);
  }
});

// ── the scrape gate (2026-09-03, run-004: apply reported ok=true with 0 sources checked) ──────────

const OPEN = () => true;
const CLOSED = () => false;

test("evaluateScrapeGate: emergency stop closes the gate first, whatever the cadence", () => {
  const g = evaluateScrapeGate({ cadence: "weekly", startDate: "2026-09-01", emergencyPaused: true }, new Date("2026-09-08T12:00:00Z"), OPEN);
  assert.equal(g.open, false);
  assert.equal(g.reason, "emergency_stop");
  assert.equal(g.detail, SCRAPE_GATE_REASONS.emergency_stop);
  assert.equal(g.emergency_paused, true);
});

test("evaluateScrapeGate: cadence 'off' closes the gate before the window is even consulted", () => {
  let consulted = false;
  const g = evaluateScrapeGate({ cadence: "off", startDate: null, emergencyPaused: false }, new Date(), () => { consulted = true; return true; });
  assert.equal(g.open, false);
  assert.equal(g.reason, "cadence_off");
  assert.equal(consulted, false, "route.ts's isGloballyPaused() exits before scrapeWindowOpen(); mirror that order");
  assert.match(g.detail, /operator's word only/);
  assert.equal(g.cadence, "off");
  assert.equal(g.start_date, null);
});

test("evaluateScrapeGate: a saved cadence on a non-scrape day is closed with its own reason", () => {
  const g = evaluateScrapeGate({ cadence: "weekly", startDate: "2026-09-01", emergencyPaused: false }, new Date("2026-09-03T12:00:00Z"), CLOSED);
  assert.equal(g.open, false);
  assert.equal(g.reason, "not_a_scrape_day");
  assert.equal(g.start_date, "2026-09-01");
});

test("evaluateScrapeGate: open when the cadence is set, not stopped, and today is a scrape day", () => {
  const seen = [];
  const g = evaluateScrapeGate({ cadence: "weekly", startDate: "2026-09-01", emergencyPaused: false }, new Date("2026-09-08T12:00:00Z"), (s, now) => { seen.push([s, now.toISOString()]); return true; });
  assert.equal(g.open, true);
  assert.equal(g.reason, null);
  assert.deepEqual(seen, [[{ cadence: "weekly", startDate: "2026-09-01" }, "2026-09-08T12:00:00.000Z"]]);
  assert.match(g.detail, /scrape window open today/);
});

test("routeExitedAtGate: both of route.ts's gate exits are recognised; an empty due set and a real batch are not", () => {
  assert.equal(routeExitedAtGate({ message: "Scraping is off (cadence 'off' or emergency stop); worker exiting", sourcesChecked: 0 }), true);
  assert.equal(routeExitedAtGate({ message: "Not a scheduled scrape day (cadence=weekly); worker exiting", sourcesChecked: 0 }), true);
  assert.equal(routeExitedAtGate({ message: "No sources due for checking", sourcesChecked: 0 }), false);
  assert.equal(routeExitedAtGate({ message: "Checked 3 sources", sourcesChecked: 3 }), false);
  assert.equal(routeExitedAtGate(null), false);
  assert.equal(routeExitedAtGate({ raw: "<html>" }), false);
});

const GATE_CLOSED = { open: false, reason: "cadence_off", detail: SCRAPE_GATE_REASONS.cadence_off, cadence: "off", start_date: null, emergency_paused: false };
const GATE_OPEN = { open: true, reason: null, detail: "cadence=weekly start_date=2026-09-01 — scrape window open today", cadence: "weekly", start_date: "2026-09-01", emergency_paused: false };

test("shapeRunOutput (dry, gate closed): due count is reported but sources_checkable is 0 and the gate is its own per_item", () => {
  const shaped = shapeRunOutput(dryRaw({ check: { ...dryRaw().check, gate: GATE_CLOSED } }), "/tmp/report.json");
  const gateItem = shaped.perItem.find((p) => p.id === "scrape-gate");
  assert.equal(gateItem.outcome, "gate_closed");
  assert.match(gateItem.verdict, /cadence_off/);
  const checkItem = shaped.perItem.find((p) => p.id === "check-sources");
  assert.match(checkItem.verdict, /42 source\(s\) due by the due-predicate but 0 checkable/);
  assert.equal(shaped.metrics.sources_due_for_check, 42);
  assert.equal(shaped.metrics.sources_checkable, 0);
  assert.deepEqual(shaped.metrics.scrape_gate, { open: false, reason: "cadence_off", cadence: "off", start_date: null, emergency_paused: false });
});

test("shapeRunOutput (dry, gate open): sources_checkable equals the due count", () => {
  const shaped = shapeRunOutput(dryRaw({ check: { ...dryRaw().check, gate: GATE_OPEN } }), "/tmp/report.json");
  assert.equal(shaped.perItem.find((p) => p.id === "scrape-gate").outcome, "gate_open");
  assert.equal(shaped.metrics.sources_checkable, 42);
  assert.equal(shaped.metrics.scrape_gate.open, true);
});

test("shapeRunOutput (dry, gate not read): sources_checkable and scrape_gate are null, never fabricated", () => {
  const shaped = shapeRunOutput(dryRaw(), "/tmp/report.json");
  assert.equal(shaped.perItem.find((p) => p.id === "scrape-gate"), undefined);
  assert.equal(shaped.metrics.sources_checkable, null);
  assert.equal(shaped.metrics.scrape_gate, null);
});

test("shapeRunOutput (apply, route exited at gate): classified gate_closed_at_route, never 'checked'", () => {
  const raw = applyRaw({
    check: {
      skipped: false, gate: GATE_CLOSED, httpStatus: 200, ok: true,
      body: { message: "Scraping is off (cadence 'off' or emergency stop); worker exiting", checked: 0, sourcesChecked: 0, changesDetected: 0, portalCandidates: 0 },
      error: null, verifiedByRead: { changeDetectedCount: 0, portalCandidatesTouched: 0 }, mismatches: [],
    },
  });
  const shaped = shapeRunOutput(raw, "/tmp/report.json");
  const checkItem = shaped.perItem.find((p) => p.id === "check-sources");
  assert.equal(checkItem.outcome, "gate_closed_at_route");
  assert.match(checkItem.verdict, /refused at its own gate/);
  assert.match(checkItem.verdict, /closed\/cadence_off/);
  assert.equal(shaped.metrics.route_exited_at_gate, true);
  assert.equal(shaped.metrics.sources_checked, 0);
  assert.equal(shaped.metrics.browserless_units_est, 0);
  assert.equal(shaped.perItem.find((p) => p.id === "scrape-gate:cross-check"), undefined, "local read and route agree — no mismatch item");
});

test("shapeRunOutput (apply): a real checked batch stays 'checked' and route_exited_at_gate is false", () => {
  const shaped = shapeRunOutput(applyRaw({ check: { ...applyRaw().check, gate: GATE_OPEN } }), "/tmp/report.json");
  assert.equal(shaped.perItem.find((p) => p.id === "check-sources").outcome, "checked");
  assert.equal(shaped.metrics.route_exited_at_gate, false);
  assert.equal(shaped.perItem.find((p) => p.id === "scrape-gate:cross-check"), undefined);
});

test("shapeRunOutput (apply): local gate read disagreeing with the deployed route is reported, never swallowed", () => {
  const raw = applyRaw({
    check: {
      skipped: false, gate: GATE_OPEN, httpStatus: 200, ok: true,
      body: { message: "Scraping is off (cadence 'off' or emergency stop); worker exiting", sourcesChecked: 0, changesDetected: 0, portalCandidates: 0 },
      error: null, verifiedByRead: { changeDetectedCount: 0, portalCandidatesTouched: 0 }, mismatches: [],
    },
  });
  const shaped = shapeRunOutput(raw, "/tmp/report.json");
  const mismatch = shaped.perItem.find((p) => p.id === "scrape-gate:cross-check");
  assert.equal(mismatch.outcome, "gate_cross_check_mismatch");
  assert.match(mismatch.verdict, /local system_state read says gate open but the deployed route exited at its gate/);
});
