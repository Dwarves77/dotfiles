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
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
  validateVerdictEntry,
  validateVerdictsFile,
  partitionVerdictsByPromptVersion,
  indexVerdictsByUrl,
  verdictEntryToClassifyOutput,
  buildVerdictClassify,
  buildCandidateExportPayload,
  runExportCandidates,
  shapeCandidateTextFields,
} from "./run-ledger-consume.mjs";

const PV = "sha256:aaaaaaaaaaaaaaaa"; // a well-formed stand-in prompt_version for fixtures below

function verdictEntry(overrides = {}) {
  return {
    candidate_id: "plc-1",
    url: "https://x/doc1",
    entity_verdict: "specific_document",
    item_type: "regulation",
    confidence: 0.9,
    rationale: "specific instrument",
    classified_by: "session-haiku",
    classified_at: "2026-09-04T00:00:00.000Z",
    prompt_version: PV,
    domain: 1,
    severity: "ACTION REQUIRED",
    priority: "HIGH",
    urgency_tier: "elevated",
    title_candidate: "Doc 1",
    ...overrides,
  };
}

function verdictsFile(entries, overrides = {}) {
  return {
    batch: "ledger-verdicts-001",
    generated_at: "2026-09-04T00:00:00.000Z",
    prompt_version: PV,
    classified_by: "session-haiku",
    entries,
    ...overrides,
  };
}

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

// ── parseArgs: --with-text ──────────────────────────────────────────────────────────────────────────

test("parseArgs: --with-text defaults false", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, true);
  assert.equal(r.withText, false);
});

test("parseArgs: --with-text requires --export-candidates — refused loudly, never a silent no-op", () => {
  const r = parseArgs(["--with-text"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--with-text requires --export-candidates/);
});

test("parseArgs: --export-candidates --with-text parses fine together", () => {
  const r = parseArgs(["--export-candidates", "out.json", "--with-text"]);
  assert.equal(r.ok, true);
  assert.equal(r.exportCandidates, "out.json");
  assert.equal(r.withText, true);
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

test("the shipped LEDGER_CONSUME_APPLY_ENABLED const is true (operator ruling 2026-09-04, ADR-023 gate flipped in this diff)", () => {
  assert.equal(LEDGER_CONSUME_APPLY_ENABLED, true);
});

// ── defaultTraceDir ──────────────────────────────────────────────────────────────────────────────────

test("defaultTraceDir: one level below the family dir, not inside it as a sibling *.json glob target", () => {
  assert.equal(defaultTraceDir("/x/ledger-consume"), "/x/ledger-consume/traces");
});

// ── buildFetchDoc — polite gap + error handling, fully injected (no real network, no real timers) ─────
//
// mockRes: the fetch response shape buildFetchDoc actually consumes since Lane LEDGER-TEXT (2026-09-04) —
// `.ok`, `.headers.get("content-type")`, `.arrayBuffer()` — NOT `.text()` (the pre-fix shape). Defaults to
// a plain-text/utf-8 content-type so a caller that only cares about the gap/error-handling behavior (not
// the decode/strip path) can omit it.
function mockRes(body, { ok = true, status = 200, contentType = "text/plain; charset=utf-8" } = {}) {
  return {
    ok,
    status,
    headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}

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
    return mockRes("hello world");
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
  const fetchImpl = async () => mockRes("x");
  const fetchDoc = buildFetchDoc({ gapMs: 1000, fetchImpl, now, sleep });

  await fetchDoc("https://a.example/1");
  clock += 5000; // plenty elapsed
  await fetchDoc("https://a.example/2");

  assert.equal(waits.length, 0);
});

test("buildFetchDoc: returns {text, transport} on success — plain text passes through", async () => {
  const fetchImpl = async () => mockRes("the document body");
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {} });
  const r = await fetchDoc("https://a.example/doc");
  assert.equal(r.text, "the document body");
  assert.equal(r.transport, "direct-fetch");
});

test("buildFetchDoc: throws on a non-ok HTTP response (caller treats as skip)", async () => {
  const fetchImpl = async () => mockRes("", { ok: false, status: 404 });
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {} });
  await assert.rejects(() => fetchDoc("https://a.example/missing"), /HTTP 404/);
});

// ── buildFetchDoc — THE DEFECT THIS CLOSES (Lane LEDGER-TEXT, 2026-09-04): HTML gets STRIPPED, not
// returned raw; a PDF body gets EXTRACTED, not handed to the HTML strip as if it were markup ────────────

test("buildFetchDoc: an HTML body is stripped to text (script/style/tags gone) — this is the fix, buildFetchDoc used to return res.text() raw", async () => {
  // Only <script>/<style> CONTENT is removed — every other tag is unwrapped with its text KEPT (this is
  // a markup-strip, not a chrome-remover; see html-to-text.mjs's own header), so <title> text survives
  // same as <nav>/<h1>/<p> do — the assertion below matches that documented behavior exactly.
  const html = "<!DOCTYPE html><html><head><script>alert(1)</script><style>body{color:red}</style>" +
    "<title>Ignore</title></head><body><nav>Home</nav><main><h1>Real Title</h1><p>Real content here.</p></main></body></html>";
  const fetchImpl = async () => mockRes(html, { contentType: "text/html; charset=utf-8" });
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {} });
  const r = await fetchDoc("https://a.example/doc");
  assert.equal(r.text, "Ignore Home Real Title Real content here.");
  assert.ok(!r.text.includes("<"), "no markup characters survive");
  assert.ok(!r.text.includes("alert(1)"), "script content is gone, not just the tags");
  assert.ok(!r.text.includes("color:red"), "style content is gone, not just the tags");
  assert.equal(r.transport, "direct-fetch");
});

test("buildFetchDoc: decodes with the response's declared charset, not a hardcoded utf-8 (the same charset-aware path canonical-pipeline.ts's directFetchClean uses)", async () => {
  // windows-1252 bytes for "Política" (í = 0xED as a single byte) — decoded as utf-8 this corrupts to
  // the U+FFFD replacement char; decoded with the declared charset it recovers the real text.
  const html = "<p>Pol\xEDtica</p>";
  const bytes = Uint8Array.from([...html].map((c) => c.charCodeAt(0)));
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? "text/html; charset=iso-8859-1" : null) },
    arrayBuffer: async () => bytes.buffer,
  });
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {} });
  const r = await fetchDoc("https://a.example/doc");
  assert.equal(r.text, "Política");
  assert.ok(!r.text.includes("�"));
});

test("buildFetchDoc: a PDF body (content-type application/pdf) is extracted via the injected pdfToTextImpl, not stripped as HTML", async () => {
  const fetchImpl = async () => mockRes("%PDF-1.4 fake bytes", { contentType: "application/pdf" });
  let calledWith = null;
  const pdfToTextImpl = async (bytes, max) => {
    calledWith = { bytesLength: bytes.length, max };
    return { text: "Extracted PDF text content.", fullLength: 28 };
  };
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {}, pdfToTextImpl });
  const r = await fetchDoc("https://a.example/doc.pdf");
  assert.equal(r.text, "Extracted PDF text content.");
  assert.equal(r.transport, "direct-pdf");
  assert.ok(calledWith, "the injected pdfToTextImpl must be called for a PDF content-type");
  assert.equal(typeof calledWith.max, "number");
});

test("buildFetchDoc: PDF detection also fires on magic bytes when content-type is absent/wrong (same codec directFetchClean uses)", async () => {
  const fetchImpl = async () => mockRes("%PDF-1.4 header, no content-type declared", { contentType: null });
  let pdfCalls = 0;
  const pdfToTextImpl = async () => { pdfCalls += 1; return { text: "pdf text", fullLength: 8 }; };
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {}, pdfToTextImpl });
  const r = await fetchDoc("https://a.example/doc");
  assert.equal(pdfCalls, 1);
  assert.equal(r.transport, "direct-pdf");
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

// ── session-verdict file contract (operator ruling 2026-09-04) — validation ─────────────────────────────

test("validateVerdictEntry: a well-formed specific_document entry validates clean", () => {
  assert.deepEqual(validateVerdictEntry(verdictEntry(), 0), []);
});

test("validateVerdictEntry: a well-formed portal entry (item_type null) validates clean", () => {
  const e = verdictEntry({
    entity_verdict: "portal", item_type: null, domain: undefined, severity: undefined,
    priority: undefined, urgency_tier: undefined, title_candidate: undefined,
  });
  assert.deepEqual(validateVerdictEntry(e, 0), []);
});

test("validateVerdictEntry: specific_document with item_type/domain/severity/priority/urgency_tier/title_candidate missing -> named errors", () => {
  const errs = validateVerdictEntry(
    verdictEntry({ item_type: null, domain: null, severity: null, priority: null, urgency_tier: null, title_candidate: null }),
    2
  );
  assert.ok(errs.some((e) => e.startsWith("entries[2]:") && /item_type/.test(e)));
  assert.ok(errs.some((e) => /domain/.test(e)));
  assert.ok(errs.some((e) => /severity/.test(e)));
  assert.ok(errs.some((e) => /priority/.test(e)));
  assert.ok(errs.some((e) => /urgency_tier/.test(e)));
  assert.ok(errs.some((e) => /title_candidate/.test(e)));
});

test("validateVerdictEntry: entity_verdict must be one of the three sanctioned values", () => {
  const errs = validateVerdictEntry(verdictEntry({ entity_verdict: "definitely_an_item" }), 0);
  assert.ok(errs.some((e) => /entity_verdict must be one of/.test(e)));
});

test("validateVerdictEntry: confidence out of [0,1] is rejected", () => {
  assert.ok(validateVerdictEntry(verdictEntry({ confidence: 1.5 }), 0).length > 0);
  assert.ok(validateVerdictEntry(verdictEntry({ confidence: -0.1 }), 0).length > 0);
  assert.deepEqual(validateVerdictEntry(verdictEntry({ confidence: 0 }), 0), []);
  assert.deepEqual(validateVerdictEntry(verdictEntry({ confidence: 1 }), 0), []);
});

test("validateVerdictEntry: classified_by must be the sanctioned 'session-haiku' label", () => {
  const errs = validateVerdictEntry(verdictEntry({ classified_by: "a-human-guess" }), 0);
  assert.ok(errs.some((e) => /classified_by must be one of/.test(e)));
});

test("validateVerdictEntry: prompt_version must match ^sha256:[0-9a-f]{16}$", () => {
  assert.ok(validateVerdictEntry(verdictEntry({ prompt_version: "not-a-hash" }), 0).length > 0);
  assert.ok(validateVerdictEntry(verdictEntry({ prompt_version: "sha256:tooshort" }), 0).length > 0);
});

test("validateVerdictEntry: classified_at must be a parseable ISO timestamp", () => {
  assert.ok(validateVerdictEntry(verdictEntry({ classified_at: "not a date" }), 0).length > 0);
});

test("validateVerdictEntry: item_type must be null when entity_verdict is not specific_document", () => {
  const errs = validateVerdictEntry(verdictEntry({ entity_verdict: "uncertain", item_type: "regulation" }), 0);
  assert.ok(errs.some((e) => /item_type must be null/.test(e)));
});

test("validateVerdictEntry: not an object -> a single clear error, never a throw", () => {
  assert.deepEqual(validateVerdictEntry(null, 5), ["entries[5]: must be an object"]);
  assert.deepEqual(validateVerdictEntry("nope", 5), ["entries[5]: must be an object"]);
});

test("validateVerdictsFile: a well-formed batch validates clean", () => {
  assert.deepEqual(validateVerdictsFile(verdictsFile([verdictEntry()])), []);
});

test("validateVerdictsFile: missing batch/generated_at/prompt_version/classified_by are named", () => {
  const errs = validateVerdictsFile({ entries: [] });
  assert.ok(errs.some((e) => /^batch/.test(e)));
  assert.ok(errs.some((e) => /^generated_at/.test(e)));
  assert.ok(errs.some((e) => /^prompt_version/.test(e)));
  assert.ok(errs.some((e) => /^classified_by/.test(e)));
});

test("validateVerdictsFile: entries must be an array; per-entry errors are prefixed with their index", () => {
  const badEntries = validateVerdictsFile(verdictsFile("not-an-array"));
  assert.ok(badEntries.some((e) => e === "entries must be an array"));

  const twoEntries = validateVerdictsFile(verdictsFile([verdictEntry(), verdictEntry({ candidate_id: "" })]));
  assert.ok(twoEntries.some((e) => e.startsWith("entries[1]:")));
  assert.ok(!twoEntries.some((e) => e.startsWith("entries[0]:")));
});

test("validateVerdictsFile: not an object -> a single clear error", () => {
  assert.deepEqual(validateVerdictsFile(null), ["verdicts file must be a JSON object"]);
  assert.deepEqual(validateVerdictsFile([1, 2]), ["verdicts file must be a JSON object"]);
});

// ── partitionVerdictsByPromptVersion — per-entry, non-fatal prompt-drift handling ───────────────────────

test("partitionVerdictsByPromptVersion: splits current vs stale by exact prompt_version match", () => {
  const entries = [
    verdictEntry({ url: "https://x/1", prompt_version: PV }),
    verdictEntry({ url: "https://x/2", prompt_version: "sha256:bbbbbbbbbbbbbbbb" }),
  ];
  const { current, stale } = partitionVerdictsByPromptVersion(entries, PV);
  assert.equal(current.length, 1);
  assert.equal(current[0].url, "https://x/1");
  assert.equal(stale.length, 1);
  assert.equal(stale[0].url, "https://x/2");
});

test("partitionVerdictsByPromptVersion: all-current and all-stale edge cases", () => {
  const entries = [verdictEntry({ url: "https://x/1" })];
  assert.deepEqual(partitionVerdictsByPromptVersion(entries, PV).stale, []);
  assert.deepEqual(partitionVerdictsByPromptVersion(entries, "sha256:0000000000000000").current, []);
});

// ── indexVerdictsByUrl / verdictEntryToClassifyOutput ────────────────────────────────────────────────

test("indexVerdictsByUrl: keyed by URL, last entry wins on a duplicate URL", () => {
  const a = verdictEntry({ url: "https://x/dup", rationale: "first" });
  const b = verdictEntry({ url: "https://x/dup", rationale: "second (correction)" });
  const byUrl = indexVerdictsByUrl([a, b]);
  assert.equal(byUrl.size, 1);
  assert.equal(byUrl.get("https://x/dup").rationale, "second (correction)");
});

test("verdictEntryToClassifyOutput: specific_document maps to a FirstFetchClassifyOutput-shaped object, $0 cost", () => {
  const out = verdictEntryToClassifyOutput(verdictEntry({ surface_tags: ["regulations"], relevance: 77, topic_tags: ["emissions"], jurisdictions: ["EU"], summary: "s" }));
  assert.equal(out.entity_verdict, "specific_document");
  assert.equal(out.item_type, "regulation");
  assert.equal(out.domain, 1);
  assert.deepEqual(out.surface_tags, ["regulations"]);
  assert.equal(out.relevance, 77);
  assert.equal(out.severity, "ACTION REQUIRED");
  assert.equal(out.title_candidate, "Doc 1");
  assert.equal(out.summary, "s");
  assert.equal(out.cost_usd_estimated, 0);
  assert.equal(out.input_tokens, 0);
  assert.equal(out.output_tokens, 0);
});

test("verdictEntryToClassifyOutput: portal/uncertain -> item_type/domain null, never silently defaulted", () => {
  const out = verdictEntryToClassifyOutput(verdictEntry({ entity_verdict: "uncertain", item_type: null, domain: null }));
  assert.equal(out.item_type, null);
  assert.equal(out.domain, null);
  assert.equal(out.title_candidate, "https://x/doc1", "falls back to the URL, never a fabricated title");
});

// ── buildVerdictClassify — THE BYPASS, THE SKIP, THE $0 TELEMETRY ──────────────────────────────────────

test("buildVerdictClassify: a URL WITH a verdict bypasses baseClassify entirely — $0, classify_source session-verdict", async () => {
  let baseCalls = 0;
  const baseClassify = async () => { baseCalls++; return { ok: true, result: { cost_usd_estimated: 0.001 } }; };
  const verdictsByUrl = indexVerdictsByUrl([verdictEntry({ url: "https://x/hit", confidence: 0.8 })]);
  const telemetry = new Map();
  const classify = buildVerdictClassify({ verdictsByUrl, allowApi: false, baseClassify, telemetry });

  const res = await classify({ source_id: "s1", source_url: "https://x/hit" }, "key");
  assert.equal(res.ok, true);
  assert.equal(res.result.entity_verdict, "specific_document");
  assert.equal(baseCalls, 0, "the API classify function must NEVER be called for a verdict hit");
  const t = telemetry.get("https://x/hit");
  assert.equal(t.source, "session-verdict");
  assert.equal(t.costUsd, 0);
  assert.equal(t.confidence, 0.8);
  assert.equal(t.verdictCandidateId, "plc-1");
});

test("buildVerdictClassify: a URL WITHOUT a verdict, allowApi=false (the default) is SKIPPED — never reaches baseClassify", async () => {
  let baseCalls = 0;
  const baseClassify = async () => { baseCalls++; return { ok: true, result: {} }; };
  const classify = buildVerdictClassify({ verdictsByUrl: new Map(), allowApi: false, baseClassify, telemetry: new Map() });
  const telemetry = new Map();
  const classify2 = buildVerdictClassify({ verdictsByUrl: new Map(), allowApi: false, baseClassify, telemetry });

  const res = await classify2({ source_id: "s1", source_url: "https://x/miss" }, "key");
  assert.equal(res.ok, false);
  assert.match(res.error, /^skipped-no-verdict:/);
  assert.equal(baseCalls, 0, "no verdict + allowApi=false must NEVER reach the API");
  const t = telemetry.get("https://x/miss");
  assert.equal(t.source, "skipped-no-verdict");
  assert.equal(t.costUsd, 0);
  assert.equal(t.ok, false);
  void classify; // (unused first instance, kept only to mirror the two-arg construction above)
});

test("buildVerdictClassify: a URL WITHOUT a verdict, allowApi=true, DOES fall through to baseClassify (the CLI-only escape hatch)", async () => {
  let baseCalls = 0;
  const baseClassify = async (input, apiKey) => {
    baseCalls++;
    assert.equal(apiKey, "real-key");
    return { ok: true, result: { cost_usd_estimated: 0.0012 } };
  };
  const telemetry = new Map();
  // baseClassify here stands in for a collectClassifyTelemetry-wrapped real classify — buildVerdictClassify
  // itself does not write telemetry for this branch (the wrapped baseClassify does), so only assert the
  // call happened and the result passed through unchanged.
  const classify = buildVerdictClassify({ verdictsByUrl: new Map(), allowApi: true, baseClassify, telemetry });
  const res = await classify({ source_id: "s1", source_url: "https://x/allow-api" }, "real-key");
  assert.equal(baseCalls, 1, "allow-api=true must fall through to the real classify function on a miss");
  assert.equal(res.ok, true);
});

test("buildVerdictClassify: a verdict hit WINS even when allowApi=true (verdict > API, never the reverse)", async () => {
  let baseCalls = 0;
  const baseClassify = async () => { baseCalls++; return { ok: true, result: {} }; };
  const verdictsByUrl = indexVerdictsByUrl([verdictEntry({ url: "https://x/both" })]);
  const telemetry = new Map();
  const classify = buildVerdictClassify({ verdictsByUrl, allowApi: true, baseClassify, telemetry });
  await classify({ source_id: "s1", source_url: "https://x/both" }, "key");
  assert.equal(baseCalls, 0, "a verdict hit must be used even when --allow-api is set");
  assert.equal(telemetry.get("https://x/both").source, "session-verdict");
});

test("buildVerdictClassify + collectClassifyTelemetry compose into ONE telemetry map (api branch tagged 'api')", async () => {
  const baseFn = async () => ({ ok: true, result: { cost_usd_estimated: 0.002, input_tokens: 500, output_tokens: 40 } });
  const { classify: apiClassify, telemetry } = collectClassifyTelemetry(baseFn);
  const classify = buildVerdictClassify({
    verdictsByUrl: indexVerdictsByUrl([verdictEntry({ url: "https://x/verdict" })]),
    allowApi: true,
    baseClassify: apiClassify,
    telemetry,
  });
  await classify({ source_id: "s1", source_url: "https://x/verdict" }, "key");
  await classify({ source_id: "s2", source_url: "https://x/api" }, "key"); // no verdict -> falls through to apiClassify
  assert.equal(telemetry.size, 2);
  assert.equal(telemetry.get("https://x/verdict").source, "session-verdict");
  assert.equal(telemetry.get("https://x/verdict").costUsd, 0);
  assert.equal(telemetry.get("https://x/api").source, "api");
  assert.equal(telemetry.get("https://x/api").costUsd, 0.002);
});

// ── shapeConsumeResult — new metrics/per_item fields the session-verdict flip adds ──────────────────────

test("shapeConsumeResult: classify_source/confidence/mismatch surface per_item, with_verdict/without_verdict_skipped/uncertain/est_usd surface in metrics", () => {
  const result = {
    mode: "plan", discovered: 4, fetched: 4, classified: 2,
    outcomes: [
      { ledgerId: "row-1", url: "https://x/1", disposition: "would_mint", reason: "dry: minted" },
      { ledgerId: "row-2", url: "https://x/2", disposition: "skipped", reason: "skipped-no-verdict: no session verdict for this URL (--verdicts) and --allow-api not set (defaults false) — never sent to the API" },
      { ledgerId: "row-3", url: "https://x/3", disposition: "not_an_item", reason: "entity-gate: uncertain — genuinely unclear" },
      { ledgerId: "row-4", url: "https://x/4", disposition: "not_an_item", reason: "entity-gate: portal — nav home" },
    ],
  };
  const telemetry = new Map([
    ["https://x/1", { sourceId: "s1", costUsd: 0, renderMs: 0, inputTokens: 0, outputTokens: 0, ok: true, error: null, source: "session-verdict", verdictCandidateId: "row-1", confidence: 0.85 }],
    ["https://x/2", { sourceId: "s1", costUsd: 0, renderMs: 0, inputTokens: 0, outputTokens: 0, ok: false, error: "skipped-no-verdict: ...", source: "skipped-no-verdict" }],
    ["https://x/3", { sourceId: "s1", costUsd: 0, renderMs: 0, inputTokens: 0, outputTokens: 0, ok: true, error: null, source: "session-verdict", verdictCandidateId: "row-3", confidence: 0.4 }],
    // row-4 never reached classify's telemetry in this fixture (no map entry) — exercises the "none" default.
  ]);

  const { perItem, metrics } = shapeConsumeResult(result, telemetry);
  const byId = Object.fromEntries(perItem.map((p) => [p.id, p]));

  assert.equal(byId["row-1"].classify_source, "session-verdict");
  assert.equal(byId["row-1"].confidence, 0.85);
  assert.equal(byId["row-1"].verdict_candidate_id_mismatch, undefined);
  assert.equal(byId["row-2"].classify_source, "skipped-no-verdict");
  assert.equal(byId["row-3"].confidence, 0.4);
  assert.equal(byId["row-4"].classify_source, "none");

  assert.equal(metrics.candidates, 4);
  assert.equal(metrics.with_verdict, 2);
  assert.equal(metrics.without_verdict_skipped, 1);
  assert.equal(metrics.uncertain, 1, "only row-3 (entity-gate: uncertain) counts; row-4 (portal) does not");
  assert.equal(metrics.est_usd, 0);
  assert.equal(metrics.est_usd_total, 0);
});

test("shapeConsumeResult: a candidate_id mismatch between the verdict entry and the actual ledger row is flagged, not silently dropped", () => {
  const result = {
    mode: "plan", discovered: 1, fetched: 1, classified: 1,
    outcomes: [{ ledgerId: "REAL-ROW-ID", url: "https://x/mismatch", disposition: "would_mint", reason: "dry: minted" }],
  };
  const telemetry = new Map([
    ["https://x/mismatch", { sourceId: "s1", costUsd: 0, renderMs: 0, inputTokens: 0, outputTokens: 0, ok: true, error: null, source: "session-verdict", verdictCandidateId: "STALE-DIFFERENT-ID", confidence: 0.9 }],
  ]);
  const { perItem } = shapeConsumeResult(result, telemetry);
  assert.equal(perItem[0].verdict_candidate_id_mismatch, true);
});

// ── --export-candidates — buildCandidateExportPayload / runExportCandidates ─────────────────────────────

test("buildCandidateExportPayload: shapes candidate rows, names why fetched text is absent, carries prompt_version", () => {
  const rows = [
    { id: "plc-1", url: "https://x/a", source_id: "src-1", anchor_text: "A", first_seen_at: "2026-09-01T00:00:00Z", sources: { name: "EUR-Lex", category: "regulatory", base_tier: 1 } },
  ];
  const payload = buildCandidateExportPayload(rows, { limit: 10, promptVersion: PV, now: () => "2026-09-04T00:00:00Z" });
  assert.equal(payload.generated_at, "2026-09-04T00:00:00Z");
  assert.equal(payload.prompt_version, PV);
  assert.equal(payload.count, 1);
  assert.match(payload.note_on_fetched_text, /does not persist first-fetch page text/);
  assert.deepEqual(payload.candidates[0], {
    candidate_id: "plc-1", url: "https://x/a", source_id: "src-1", anchor_text: "A",
    first_seen_at: "2026-09-01T00:00:00Z", source_name: "EUR-Lex", source_category: "regulatory", source_tier: 1,
  });
  assert.equal(payload.next_cursor, null, "fewer rows than limit -> exhausted, no cursor");
});

test("buildCandidateExportPayload: next_cursor present when the page is exactly full (limit reached)", () => {
  const rows = [
    { id: "a", url: "https://x/a", source_id: "s", first_seen_at: "2026-09-01T00:00:00Z", sources: null },
    { id: "b", url: "https://x/b", source_id: "s", first_seen_at: "2026-09-02T00:00:00Z", sources: null },
  ];
  const payload = buildCandidateExportPayload(rows, { limit: 2 });
  assert.deepEqual(payload.next_cursor, { firstSeenAt: "2026-09-02T00:00:00Z", id: "b" });
});

test("runExportCandidates: writes the shaped payload to outPath via the injected selectPage (no live client needed)", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "ledger-consume-export-"));
  try {
    const outPath = join(tmpDir, "candidates.json");
    let calledWith = null;
    const selectPage = async (opts) => {
      calledWith = opts;
      return [{ id: "plc-1", url: "https://x/a", source_id: "src-1", first_seen_at: "2026-09-01T00:00:00Z", sources: null }];
    };
    const { path, count } = await runExportCandidates({
      selectPage, limit: 5, sourceId: "src-1", newestFirst: false, after: null, promptVersion: PV, outPath,
      now: () => "2026-09-04T00:00:00Z",
    });
    assert.equal(count, 1);
    assert.equal(path, resolve(outPath));
    assert.deepEqual(calledWith, { limit: 5, sourceId: "src-1", newestFirst: false, after: undefined });
    const written = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(written.count, 1);
    assert.equal(written.candidates[0].candidate_id, "plc-1");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── shapeCandidateTextFields — the --with-text row shape (Lane LEDGER-EXPORT) ───────────────────────────

test("shapeCandidateTextFields: a successful fetch >=200ch -> fetch_ok true, sliced text, transport carried", () => {
  const now = () => "2026-09-04T12:00:00.000Z";
  const r = shapeCandidateTextFields({ ok: true, text: "x".repeat(500), transport: "direct-fetch" }, { maxChars: 6000, now });
  assert.equal(r.fetch_ok, true);
  assert.equal(r.fetch_error, null);
  assert.equal(r.text.length, 500);
  assert.equal(r.fetched_chars, 500);
  assert.equal(r.transport, "direct-fetch");
  assert.equal(r.fetched_at, "2026-09-04T12:00:00.000Z");
});

test("shapeCandidateTextFields: CONTENT_MAX_CHARS slice — text longer than maxChars is truncated, fetched_chars reflects the slice", () => {
  const r = shapeCandidateTextFields({ ok: true, text: "y".repeat(9000), transport: "direct-fetch" }, { maxChars: 6000 });
  assert.equal(r.text.length, 6000);
  assert.equal(r.fetched_chars, 6000);
  assert.equal(r.fetch_ok, true, "well over the 200ch floor even after slicing");
});

test("shapeCandidateTextFields: a fetch failure -> fetch_ok false, text empty, fetch_error is the thrown message, no transport", () => {
  const r = shapeCandidateTextFields({ ok: false, error: "HTTP 404 for https://x/missing" }, { maxChars: 6000 });
  assert.equal(r.fetch_ok, false);
  assert.equal(r.text, "");
  assert.equal(r.fetched_chars, 0);
  assert.equal(r.fetch_error, "HTTP 404 for https://x/missing");
  assert.equal(r.transport, null);
});

test("shapeCandidateTextFields: below the SAME 200-char floor portal-harvest.ts's fetch step applies — text is KEPT, fetch_ok false, fetch_error='below_floor_200'", () => {
  const r = shapeCandidateTextFields({ ok: true, text: "too short", transport: "direct-fetch" }, { maxChars: 6000 });
  assert.equal(r.fetch_ok, false);
  assert.equal(r.fetch_error, "below_floor_200");
  assert.equal(r.text, "too short", "the short text is still carried, not discarded");
  assert.equal(r.fetched_chars, "too short".length);
});

test("shapeCandidateTextFields: requires opts.maxChars — throws rather than silently falling back to a retyped literal", () => {
  assert.throws(() => shapeCandidateTextFields({ ok: true, text: "hello" }, {}), /requires opts\.maxChars/);
  assert.throws(() => shapeCandidateTextFields({ ok: true, text: "hello" }), /requires opts\.maxChars/);
});

// ── buildCandidateExportPayload — withText merges text fields, changes the honesty note ─────────────────

test("buildCandidateExportPayload: withText=false is byte-identical to the pre-LEDGER-EXPORT shape (no text fields, old note)", () => {
  const rows = [{ id: "plc-1", url: "https://x/a", source_id: "s", first_seen_at: "2026-09-01T00:00:00Z", sources: null }];
  const payload = buildCandidateExportPayload(rows, { limit: 5, now: () => "2026-09-04T00:00:00Z" });
  assert.equal(payload.with_text, false);
  assert.equal(payload.content_max_chars, null);
  assert.equal(payload.fetch_ok_count, null);
  assert.match(payload.note_on_fetched_text, /does not persist first-fetch page text/);
  assert.deepEqual(Object.keys(payload.candidates[0]).sort(), ["anchor_text", "candidate_id", "first_seen_at", "source_category", "source_id", "source_name", "source_tier", "url"].sort());
});

test("buildCandidateExportPayload: withText=true merges text/fetched_chars/fetch_ok/fetch_error/fetched_at/transport per row", () => {
  const rows = [
    { id: "plc-1", url: "https://x/ok", source_id: "s", first_seen_at: "2026-09-01T00:00:00Z", sources: null },
    { id: "plc-2", url: "https://x/fail", source_id: "s", first_seen_at: "2026-09-02T00:00:00Z", sources: null },
  ];
  const textByCandidateId = new Map([
    ["plc-1", { text: "x".repeat(300), fetched_chars: 300, fetch_ok: true, fetch_error: null, fetched_at: "t1", transport: "direct-fetch" }],
    ["plc-2", { text: "", fetched_chars: 0, fetch_ok: false, fetch_error: "HTTP 500", fetched_at: "t2", transport: null }],
  ]);
  const payload = buildCandidateExportPayload(rows, { limit: 5, withText: true, contentMaxChars: 6000, textByCandidateId });
  assert.equal(payload.with_text, true);
  assert.equal(payload.content_max_chars, 6000);
  assert.equal(payload.fetch_ok_count, 1);
  assert.equal(payload.fetch_failed_count, 1);
  assert.match(payload.note_on_fetched_text, /produced with --with-text/);
  assert.match(payload.note_on_fetched_text, /must NOT fetch these URLs itself/);
  const byId = Object.fromEntries(payload.candidates.map((c) => [c.candidate_id, c]));
  assert.equal(byId["plc-1"].text, "x".repeat(300));
  assert.equal(byId["plc-1"].fetch_ok, true);
  assert.equal(byId["plc-2"].fetch_ok, false);
  assert.equal(byId["plc-2"].fetch_error, "HTTP 500");
});

// ── runExportCandidates — the I/O half with --with-text: injected fetchDoc, no DB write ─────────────────

test("runExportCandidates: withText=true calls the injected fetchDoc once per row, in page order, and writes the fetched text to disk", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "ledger-consume-export-text-"));
  try {
    const outPath = join(tmpDir, "candidates.json");
    const rows = [
      { id: "plc-1", url: "https://x/a", source_id: "s", first_seen_at: "2026-09-01T00:00:00Z", sources: null },
      { id: "plc-2", url: "https://x/b", source_id: "s", first_seen_at: "2026-09-02T00:00:00Z", sources: null },
    ];
    const selectPage = async () => rows;
    const fetchCalls = [];
    const fetchDoc = async (url) => {
      fetchCalls.push(url);
      return { text: `content for ${url} `.repeat(50), transport: "direct-fetch" };
    };
    const { payload } = await runExportCandidates({
      selectPage, limit: 5, outPath, withText: true, fetchDoc, maxChars: 6000, now: () => "2026-09-04T00:00:00Z",
    });
    assert.deepEqual(fetchCalls, ["https://x/a", "https://x/b"], "fetchDoc called once per row, in page order");
    assert.equal(payload.with_text, true);
    const written = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(written.candidates[0].fetch_ok, true);
    assert.ok(written.candidates[0].text.startsWith("content for https://x/a"));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runExportCandidates: withText=true, a per-row fetch throw does not abort the batch — that row is fetch_ok:false, the rest still export", async () => {
  const rows = [
    { id: "plc-1", url: "https://x/good", source_id: "s", first_seen_at: "2026-09-01T00:00:00Z", sources: null },
    { id: "plc-2", url: "https://x/bad", source_id: "s", first_seen_at: "2026-09-02T00:00:00Z", sources: null },
  ];
  const selectPage = async () => rows;
  const fetchDoc = async (url) => {
    if (url === "https://x/bad") throw new Error("HTTP 429 for https://x/bad");
    return { text: "z".repeat(300), transport: "direct-fetch" };
  };
  const tmpDir = mkdtempSync(join(tmpdir(), "ledger-consume-export-text-"));
  try {
    const outPath = join(tmpDir, "candidates.json");
    const { payload, count } = await runExportCandidates({ selectPage, limit: 5, outPath, withText: true, fetchDoc, maxChars: 6000 });
    assert.equal(count, 2, "both rows still exported despite one fetch throwing");
    const byId = Object.fromEntries(payload.candidates.map((c) => [c.candidate_id, c]));
    assert.equal(byId["plc-1"].fetch_ok, true);
    assert.equal(byId["plc-2"].fetch_ok, false);
    assert.equal(byId["plc-2"].fetch_error, "HTTP 429 for https://x/bad");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("runExportCandidates: withText=true requires fetchDoc — throws rather than silently exporting with no text", async () => {
  const selectPage = async () => [{ id: "a", url: "https://x/a", source_id: "s", first_seen_at: "t", sources: null }];
  await assert.rejects(
    () => runExportCandidates({ selectPage, limit: 5, outPath: "/dev/null", withText: true, maxChars: 6000 }),
    /requires opts\.fetchDoc/
  );
});

test("runExportCandidates: never touches a database — selectPage (a read) and fetchDoc (plain HTTP) are the ONLY injected calls; no upsert/update/insert/delete-shaped object is ever passed in or called", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "ledger-consume-export-nodbwrite-"));
  try {
    const outPath = join(tmpDir, "candidates.json");
    let selectPageCalls = 0;
    const selectPage = async (opts) => {
      selectPageCalls += 1;
      assert.deepEqual(opts, { limit: 3, sourceId: undefined, newestFirst: undefined, after: undefined });
      return [{ id: "plc-1", url: "https://x/a", source_id: "s", first_seen_at: "2026-09-01T00:00:00Z", sources: null }];
    };
    let fetchDocCalls = 0;
    const fetchDoc = async () => { fetchDocCalls += 1; return { text: "w".repeat(300), transport: "direct-fetch" }; };
    await runExportCandidates({ selectPage, limit: 3, outPath, withText: true, fetchDoc, maxChars: 6000 });
    // Exactly one read (the page select) and one fetch (the one candidate row) — no hidden second round
    // trip that could imply a write-shaped call snuck in anywhere in this function.
    assert.equal(selectPageCalls, 1);
    assert.equal(fetchDocCalls, 1);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// The jiti-load proof (consumePortalCandidates + first-fetch-classify.ts resolve cleanly through jiti,
// and consumePortalCandidates runs end-to-end against a stub client with 0 candidates) is NOT a test in
// this file — see the header comment at the top of this file for exactly why (glob-portability's
// no-bare-npm-import rule) and where the verification evidence lives.
