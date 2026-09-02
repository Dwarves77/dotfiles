// run-ledger-consume.test.mjs — proves arg parsing, the apply-disarm gate, the classify telemetry
// COLLECTOR (read-only — see run-ledger-consume.mjs's header for why this is no longer an agent_runs
// write-site: Lane SPEND routed firstFetchClassify through the spend chokepoint, which now writes that
// row itself, so this driver only reads back FirstFetchClassifyResult's cost/token fields), and artifact
// shaping from a fake ConsumeResult.
//
// THE JITI-LOAD PROOF IS DELIBERATELY NOT A TEST IN THIS FILE. This file is in
// `.discipline/run-test-suite.sh`'s no-`npm-ci` glob (`fsi-app/scripts/turns/*.test.mjs`), and
// `.discipline/glob-portability.test.mjs` fails any file in that glob that imports a bare npm package
// (jiti included) — CONFIRMED by actually adding the test and running the suite: it failed with
// "imports jiti (bare package — unavailable without npm ci)". The repo's sanctioned escape hatch for an
// npm-dependent proof, `*.npmtest.mjs`, is wired into CI (`discipline.yml`'s "App unit tests requiring
// npm deps" step) ONLY for `fsi-app/src/**/*.npmtest.mjs` plus a hand-maintained named list — neither
// covers `scripts/turns/`, and extending either requires editing `.github/workflows/discipline.yml`,
// which is outside this lane's write set. Rather than either breaking that gate or landing a new file
// nothing in CI would ever run (an ORPHANED PROOF — exactly what F23 exists to catch), the jiti-load
// proof was run directly in this environment instead (no network, no DB — a stub Supabase client
// returning zero candidates): both `consumePortalCandidates` (`src/lib/intake/portal-harvest.ts`) and
// `firstFetchClassify` (`src/lib/llm/first-fetch-classify.ts`) import cleanly through jiti and
// `consumePortalCandidates` runs end-to-end against the stub, returning
// `{discovered:0, fetched:0, classified:0, outcomes:[]}` with `fetchDoc` never invoked. See the lane's
// final report for the exact commands and output; `run-ledger-consume.mjs`'s own header carries the same
// account. This is a real, one-time-verified confirmation, not a standing regression test — an honest
// gap, not a silent one.
import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseArgs,
  resolveApplyGate,
  buildFetchDoc,
  collectClassifyTelemetry,
  shapeConsumeResult,
  buildRunArtifact,
  defaultTraceDir,
  LEDGER_CONSUME_GOVERNING_FILES,
  LEDGER_CONSUME_APPLY_ENABLED,
  PROMOTED_LIKE_DISPOSITIONS,
  REJECTED_LIKE_DISPOSITIONS,
} from "./run-ledger-consume.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: defaults are mode=plan, limit=50, newest-first=false", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "plan");
  assert.equal(r.limit, 50);
  assert.equal(r.sourceId, null);
  assert.equal(r.newestFirst, false);
  assert.equal(r.after, null);
});

test("parseArgs: --mode must be plan or apply", () => {
  const r = parseArgs(["--mode", "sideways"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mode must be/);
});

test("parseArgs: --mode apply parses fine (the gate is a separate concern)", () => {
  const r = parseArgs(["--mode", "apply"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "apply");
});

test("parseArgs: --limit must be a positive integer", () => {
  assert.equal(parseArgs(["--limit", "0"]).ok, false);
  assert.equal(parseArgs(["--limit", "-5"]).ok, false);
  assert.equal(parseArgs(["--limit", "3.5"]).ok, false);
  assert.equal(parseArgs(["--limit", "abc"]).ok, false);
  const r = parseArgs(["--limit", "12"]);
  assert.equal(r.ok, true);
  assert.equal(r.limit, 12);
});

test("parseArgs: --source-id and --newest-first are threaded through", () => {
  const r = parseArgs(["--source-id", "abc-123", "--newest-first"]);
  assert.equal(r.ok, true);
  assert.equal(r.sourceId, "abc-123");
  assert.equal(r.newestFirst, true);
});

test("parseArgs: --after must be valid JSON with firstSeenAt+id", () => {
  assert.equal(parseArgs(["--after", "not json"]).ok, false);
  assert.equal(parseArgs(["--after", "{}"]).ok, false);
  assert.equal(parseArgs(["--after", '{"firstSeenAt":"2026-09-01T00:00:00Z"}']).ok, false);
  const r = parseArgs(["--after", '{"firstSeenAt":"2026-09-01T00:00:00Z","id":"row-1"}']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.after, { firstSeenAt: "2026-09-01T00:00:00Z", id: "row-1" });
});

test("parseArgs: --harness-runs-dir / --trace-dir pass through raw", () => {
  const r = parseArgs(["--harness-runs-dir", "/tmp/hr", "--trace-dir", "/tmp/tr"]);
  assert.equal(r.ok, true);
  assert.equal(r.harnessRunsDir, "/tmp/hr");
  assert.equal(r.traceDir, "/tmp/tr");
});

test("parseArgs: unknown flag is refused (strict)", () => {
  const r = parseArgs(["--bogus", "x"]);
  assert.equal(r.ok, false);
});

// ── resolveApplyGate — the apply-disarmed path ──────────────────────────────────────────────────────

test("resolveApplyGate: plan mode is never gated, const value irrelevant", () => {
  const r1 = resolveApplyGate("plan", false);
  assert.equal(r1.effectiveMode, "plan");
  assert.equal(r1.applyDisarmed, false);
  assert.equal(r1.message, null);
  const r2 = resolveApplyGate("plan", true);
  assert.equal(r2.effectiveMode, "plan");
  assert.equal(r2.applyDisarmed, false);
});

test("resolveApplyGate: apply requested + const false -> DISARMED, falls back to plan, names why", () => {
  const r = resolveApplyGate("apply", false);
  assert.equal(r.effectiveMode, "plan");
  assert.equal(r.applyDisarmed, true);
  assert.match(r.message, /APPLY DISARMED/);
  assert.match(r.message, /LEDGER_CONSUME_APPLY_ENABLED/);
});

test("resolveApplyGate: apply requested + const true -> apply runs, no disarm message", () => {
  const r = resolveApplyGate("apply", true);
  assert.equal(r.effectiveMode, "apply");
  assert.equal(r.applyDisarmed, false);
  assert.equal(r.message, null);
});

test("the shipped LEDGER_CONSUME_APPLY_ENABLED const is false (ADR-023 gate, left unarmed by this lane)", () => {
  assert.equal(LEDGER_CONSUME_APPLY_ENABLED, false);
});

// ── defaultTraceDir ──────────────────────────────────────────────────────────────────────────────────

test("defaultTraceDir: one level below the family dir, not inside it as a sibling *.json glob target", () => {
  assert.equal(defaultTraceDir("/x/ledger-consume"), "/x/ledger-consume/traces");
});

// ── buildFetchDoc — polite gap + error handling, fully injected (no real network, no real timers) ─────

test("buildFetchDoc: waits out the gap between consecutive calls", async () => {
  // clock starts well above 0 — lastFetchAt's zero-sentinel (mirrors run-source-sweep.mjs's own
  // politeFetch) must never look like "a fetch just happened at the epoch" on the very first call.
  let clock = 10_000;
  const now = () => clock;
  const waits = [];
  const sleep = async (ms) => {
    waits.push(ms);
    clock += ms;
  };
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push({ url, at: clock });
    return { ok: true, text: async () => "hello world" };
  };
  const fetchDoc = buildFetchDoc({ gapMs: 1000, fetchImpl, now, sleep });

  await fetchDoc("https://a.example/1");
  clock += 100; // only 100ms elapsed before the second call — the gap must make up the other 900ms
  await fetchDoc("https://a.example/2");

  assert.equal(calls.length, 2);
  assert.equal(waits.length, 1);
  assert.equal(waits[0], 900);
});

test("buildFetchDoc: does not wait when the gap already elapsed", async () => {
  let clock = 10_000;
  const now = () => clock;
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); clock += ms; };
  const fetchImpl = async () => ({ ok: true, text: async () => "x" });
  const fetchDoc = buildFetchDoc({ gapMs: 1000, fetchImpl, now, sleep });

  await fetchDoc("https://a.example/1");
  clock += 5000; // plenty elapsed
  await fetchDoc("https://a.example/2");

  assert.equal(waits.length, 0);
});

test("buildFetchDoc: returns {text, transport} on success", async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => "the document body" });
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {} });
  const r = await fetchDoc("https://a.example/doc");
  assert.equal(r.text, "the document body");
  assert.equal(r.transport, "direct-fetch");
});

test("buildFetchDoc: throws on a non-ok HTTP response (caller treats as skip)", async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => "" });
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {} });
  await assert.rejects(() => fetchDoc("https://a.example/missing"), /HTTP 404/);
});

// ── collectClassifyTelemetry — a READ-ONLY collector, no DB, no double-counted agent_runs rows ────────

test("collectClassifyTelemetry: never touches a database — the wrapped fn's return value passes through unchanged", async () => {
  const baseClassify = async (input, apiKey) => {
    assert.equal(apiKey, "key");
    return {
      ok: true,
      result: {
        entity_verdict: "specific_document",
        item_type: "regulation",
        cost_usd_estimated: 0.0012,
        render_ms: 450,
        input_tokens: 900,
        output_tokens: 120,
        title_candidate: "t",
        summary: "s",
      },
    };
  };
  const { classify, telemetry } = collectClassifyTelemetry(baseClassify);

  const res = await classify({ source_id: "src-1", source_url: "https://x/a", text: "..." }, "key");
  // Pass-through: the exact object baseClassify returned, untouched.
  assert.equal(res.ok, true);
  assert.equal(res.result.title_candidate, "t");

  const t = telemetry.get("https://x/a");
  assert.equal(t.costUsd, 0.0012);
  assert.equal(t.renderMs, 450);
  assert.equal(t.inputTokens, 900);
  assert.equal(t.outputTokens, 120);
  assert.equal(t.sourceId, "src-1");
  assert.equal(t.ok, true);
  assert.equal(t.error, null);
});

test("collectClassifyTelemetry: ok=false is recorded with $0 cost, 0 tokens, and the error string — never thrown", async () => {
  const baseClassify = async () => ({ ok: false, error: "Haiku 429: rate limited" });
  const { classify, telemetry } = collectClassifyTelemetry(baseClassify);

  const res = await classify({ source_id: "src-2", source_url: "https://x/b", text: "..." }, "key");
  assert.equal(res.ok, false);
  const t = telemetry.get("https://x/b");
  assert.equal(t.costUsd, 0);
  assert.equal(t.inputTokens, 0);
  assert.equal(t.outputTokens, 0);
  assert.equal(t.ok, false);
  assert.equal(t.error, "Haiku 429: rate limited");
});

test("collectClassifyTelemetry: N calls record N telemetry entries, keyed by source_url", async () => {
  const baseClassify = async () => ({
    ok: true,
    result: { cost_usd_estimated: 0.001, render_ms: 5, input_tokens: 100, output_tokens: 20 },
  });
  const { classify, telemetry } = collectClassifyTelemetry(baseClassify);

  for (let i = 0; i < 5; i++) {
    await classify({ source_id: `s${i}`, source_url: `https://x/${i}` }, "key");
  }
  assert.equal(telemetry.size, 5);
  assert.equal(telemetry.get("https://x/3").sourceId, "s3");
});

test("collectClassifyTelemetry: a result missing input_tokens/output_tokens (older classify double) records 0, not undefined/NaN", async () => {
  const baseClassify = async () => ({ ok: true, result: { cost_usd_estimated: 0.001, render_ms: 5 } });
  const { classify, telemetry } = collectClassifyTelemetry(baseClassify);
  await classify({ source_id: "s", source_url: "https://x/legacy" }, "key");
  const t = telemetry.get("https://x/legacy");
  assert.equal(t.inputTokens, 0);
  assert.equal(t.outputTokens, 0);
});

// ── shapeConsumeResult ───────────────────────────────────────────────────────────────────────────────

function fakeConsumeResult(overrides = {}) {
  return {
    mode: "plan",
    discovered: 4,
    fetched: 3,
    classified: 2,
    outcomes: [
      { ledgerId: "row-1", url: "https://x/1", disposition: "would_mint", reason: "dry: minted" },
      { ledgerId: "row-2", url: "https://x/2", disposition: "not_an_item", reason: "entity-gate: portal" },
      { ledgerId: "row-3", url: "https://x/3", disposition: "skipped", reason: "fetch failed: timeout" },
      { ledgerId: "row-4", url: "https://x/4", disposition: "exists", reason: "exists: already minted as item-9" },
    ],
    nextCursor: { firstSeenAt: "2026-09-01T00:00:00Z", id: "row-4" },
    ...overrides,
  };
}

test("shapeConsumeResult: one per_item entry per outcome, est_usd + tokens from telemetry when present", () => {
  const telemetry = new Map([
    ["https://x/1", { sourceId: "src-1", costUsd: 0.0011, renderMs: 400, inputTokens: 800, outputTokens: 100, ok: true, error: null }],
    ["https://x/2", { sourceId: "src-1", costUsd: 0.0009, renderMs: 380, inputTokens: 700, outputTokens: 90, ok: true, error: null }],
    // row-3 never reached classify (fetch failed) — no telemetry entry.
    // row-4 (exists) reached classify too, in this fixture:
    ["https://x/4", { sourceId: "src-2", costUsd: 0.0013, renderMs: 420, inputTokens: 850, outputTokens: 110, ok: true, error: null }],
  ]);
  const { perItem, metrics } = shapeConsumeResult(fakeConsumeResult(), telemetry, { sourceIdFilter: null });

  assert.equal(perItem.length, 4);
  const byId = Object.fromEntries(perItem.map((p) => [p.id, p]));
  assert.equal(byId["row-1"].outcome, "would_mint");
  assert.equal(byId["row-1"].est_usd, 0.0011);
  assert.equal(byId["row-1"].source_id, "src-1");
  assert.equal(byId["row-1"].input_tokens, 800);
  assert.equal(byId["row-1"].output_tokens, 100);
  assert.equal(byId["row-3"].est_usd, 0); // no telemetry -> 0, not invented
  assert.equal(byId["row-3"].input_tokens, 0);
  assert.equal(byId["row-3"].output_tokens, 0);
  assert.equal(byId["row-3"].source_id, null); // no telemetry, no --source-id filter -> honest null
  assert.equal(byId["row-3"].url, "https://x/3");

  assert.equal(metrics.mode, "plan");
  assert.equal(metrics.discovered, 4);
  assert.equal(metrics.fetched, 3);
  assert.equal(metrics.classified, 2);
  // promoted-like: would_mint (row-1) + exists (row-4) = 2
  assert.equal(metrics.promoted, 2);
  // rejected-like: not_an_item (row-2) = 1
  assert.equal(metrics.rejected, 1);
  assert.equal(metrics.skipped, 1);
  assert.equal(metrics.est_usd_total, Number((0.0011 + 0.0009 + 0.0013).toFixed(6)));
  assert.equal(metrics.input_tokens_total, 800 + 700 + 850);
  assert.equal(metrics.output_tokens_total, 100 + 90 + 110);
  assert.deepEqual(metrics.next_cursor, { firstSeenAt: "2026-09-01T00:00:00Z", id: "row-4" });
});

test("shapeConsumeResult: an empty telemetry map yields 0 token totals, not undefined/NaN", () => {
  const { metrics } = shapeConsumeResult(fakeConsumeResult(), new Map());
  assert.equal(metrics.input_tokens_total, 0);
  assert.equal(metrics.output_tokens_total, 0);
});

test("shapeConsumeResult: source_id falls back to --source-id filter when telemetry has none", () => {
  const { perItem } = shapeConsumeResult(fakeConsumeResult(), new Map(), { sourceIdFilter: "src-scoped" });
  for (const item of perItem) assert.equal(item.source_id, "src-scoped");
});

test("shapeConsumeResult: apply-mode dispositions (promoted/rejected) count the same way", () => {
  const result = fakeConsumeResult({
    mode: "apply",
    outcomes: [
      { ledgerId: "a", url: "https://x/a", disposition: "promoted", reason: "minted" },
      { ledgerId: "b", url: "https://x/b", disposition: "rejected", reason: "chokepoint: entity-gate" },
    ],
  });
  const { metrics } = shapeConsumeResult(result, new Map());
  assert.equal(metrics.promoted, 1);
  assert.equal(metrics.rejected, 1);
});

test("PROMOTED_LIKE_DISPOSITIONS / REJECTED_LIKE_DISPOSITIONS are disjoint (no double-counting)", () => {
  const overlap = PROMOTED_LIKE_DISPOSITIONS.filter((d) => REJECTED_LIKE_DISPOSITIONS.includes(d));
  assert.deepEqual(overlap, []);
});

// ── buildRunArtifact — F28 schema shape + the "never say written/minted in a plan run" wording rule ──

test("buildRunArtifact: a clean plan run's shape validates against F28 (via a live import)", async () => {
  const { validateRunArtifact } = await import("../lib/run-artifact.mjs");
  const shaped = shapeConsumeResult(fakeConsumeResult(), new Map());
  const artifact = buildRunArtifact({
    runId: "ledger-consume-run-001",
    harnessVersion: "sha256:0000000000000000",
    startedAt: "2026-09-02T00:00:00Z",
    finishedAt: "2026-09-02T00:00:05Z",
    config: { requested_mode: "plan", mode: "plan", apply_disarmed: false },
    inputsRef: ["portal_link_candidates: status=candidate limit=4"],
    shaped,
    resultTracePath: "scripts/harness-runs/ledger-consume/traces/ledger-consume-run-001.result.json",
    runError: null,
    harnessRunsDirFallback: "scripts/harness-runs/ledger-consume",
  });
  const errors = validateRunArtifact(artifact);
  assert.deepEqual(errors, []);
  assert.equal(artifact.harness_family, "ledger-consume");
  assert.equal(artifact.full_trace_refs.length, 1);
  assert.match(artifact.full_trace_refs[0], /traces\/ledger-consume-run-001\.result\.json$/);
});

test("buildRunArtifact: full_trace_refs falls back to the harness-runs dir when no trace was written", () => {
  const artifact = buildRunArtifact({
    runId: "ledger-consume-run-002",
    harnessVersion: "sha256:0000000000000000",
    startedAt: "2026-09-02T00:00:00Z",
    finishedAt: "2026-09-02T00:00:05Z",
    config: { requested_mode: "plan", mode: "plan", apply_disarmed: false },
    inputsRef: ["portal_link_candidates: status=candidate limit=4"],
    shaped: null,
    resultTracePath: null,
    runError: new Error("boom"),
    harnessRunsDirFallback: "scripts/harness-runs/ledger-consume",
  });
  assert.deepEqual(artifact.full_trace_refs, ["scripts/harness-runs/ledger-consume"]);
  assert.equal(artifact.defects_found.length, 1);
  assert.match(artifact.defects_found[0].description, /threw during a plan run/);
});

test("buildRunArtifact: an apply-disarmed run's proposer_notes names the disarm, never says written/minted", () => {
  const shaped = shapeConsumeResult(fakeConsumeResult(), new Map());
  const artifact = buildRunArtifact({
    runId: "ledger-consume-run-003",
    harnessVersion: "sha256:0000000000000000",
    startedAt: "2026-09-02T00:00:00Z",
    finishedAt: "2026-09-02T00:00:05Z",
    config: { requested_mode: "apply", mode: "plan", apply_disarmed: true, apply_enabled_const: false },
    inputsRef: ["portal_link_candidates: status=candidate limit=4"],
    shaped,
    resultTracePath: "scripts/harness-runs/ledger-consume/traces/ledger-consume-run-003.result.json",
    runError: null,
    harnessRunsDirFallback: "scripts/harness-runs/ledger-consume",
  });
  assert.match(artifact.proposer_notes, /APPLY DISARMED/);
  // The wording rule (run-source-sweep.mjs's precedent): a plan/dry verdict must never CLAIM a write
  // happened. "nothing was written" is an honest NEGATIVE claim and is fine; what's forbidden is an
  // affirmative "wrote N" / "minted N" — assert neither appears.
  assert.doesNotMatch(artifact.proposer_notes, /\bwrote \d/i);
  assert.doesNotMatch(artifact.proposer_notes, /\bminted \d/i);
  assert.match(artifact.proposer_notes, /nothing was written/i);
});

// ── governing files / harness_version ───────────────────────────────────────────────────────────────

test("LEDGER_CONSUME_GOVERNING_FILES names the driver + both library modules it gives a runtime to", () => {
  assert.deepEqual(LEDGER_CONSUME_GOVERNING_FILES, [
    "scripts/turns/run-ledger-consume.mjs",
    "src/lib/intake/portal-harvest.ts",
    "src/lib/llm/first-fetch-classify.ts",
  ]);
});

test("hashHarnessVersion resolves every governing file on disk (no typo'd path)", async () => {
  const { hashHarnessVersion } = await import("../lib/run-artifact.mjs");
  const hash = hashHarnessVersion(LEDGER_CONSUME_GOVERNING_FILES, FSI_ROOT);
  assert.match(hash, /^sha256:[0-9a-f]{16}$/);
});

// The jiti-load proof (consumePortalCandidates + first-fetch-classify.ts resolve cleanly through jiti,
// and consumePortalCandidates runs end-to-end against a stub client with 0 candidates) is NOT a test in
// this file — see the header comment at the top of this file for exactly why (glob-portability's
// no-bare-npm-import rule) and where the verification evidence lives.
