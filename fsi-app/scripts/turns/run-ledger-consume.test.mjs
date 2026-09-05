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
  buildClassifyGate,
  isVerdictsBatchFilename,
  sortVerdictsBatchFilenames,
  discoverVerdictsFiles,
  buildCandidateExportPayload,
  runExportCandidates,
  shapeCandidateTextFields,
  resolveExportAfter,
  findLatestExportArtifact,
  buildExportRunArtifact,
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

// ── buildFetchDoc — Lane LEDGER-WALLS (2026-09-04): API-host routing, EUR-Lex rewrite, wall detection ────
//
// THE FACTS this closes [CONFIRMED by coordinator, ledger-consume export #5, run 33908401816]: of 400
// candidates, ~230 www.federalregister.gov document URLs and ~15 eur-lex.europa.eu legal-content URLs came
// back as bot/interface shells that buildFetchDoc reported fetch_ok:true, wasting 230 Haiku classify calls.

test("buildFetchDoc: a federalregister.gov document URL is routed through fetchDocumentApiImpl, never the plain HTML fetch — transport 'federalregister-api'", async () => {
  let plainFetchCalls = 0;
  const fetchImpl = async () => { plainFetchCalls++; return mockRes("Federal Register :: Request Access ... CAPTCHA ..."); };
  let apiCalledWith = null;
  const fetchDocumentApiImpl = async (url, opts) => {
    apiCalledWith = { url, max: opts.max };
    return { status: 200, text: "The real document text, well over two hundred characters long, straight from the official API.", truncated: false, fullLength: 90, cap: opts.max };
  };
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {}, fetchDocumentApiImpl });
  const r = await fetchDoc("https://www.federalregister.gov/documents/2026/07/15/2026-14204/lake-ontario-national-marine-sanctuary-delay-of-effective-date");
  assert.equal(plainFetchCalls, 0, "the API transport won — the plain HTML fetch (the CAPTCHA shell) must never be called");
  assert.ok(apiCalledWith, "fetchDocumentApiImpl must be called for a federalregister.gov document URL");
  assert.equal(r.transport, "federalregister-api");
  assert.ok(r.text.includes("real document text"));
  assert.equal(r.wall, null, "real API content is not a wall");
});

test("buildFetchDoc: an ecfr.gov URL is routed through fetchDocumentApiImpl too — transport 'ecfr-api', not 'federalregister-api'", async () => {
  const fetchDocumentApiImpl = async (url, opts) => ({ status: 200, text: "Full eCFR title text, over two hundred characters, from the versioner API endpoint.", truncated: false, fullLength: 85, cap: opts.max });
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl: async () => mockRes("should never be called"), now: () => 0, sleep: async () => {}, fetchDocumentApiImpl });
  const r = await fetchDoc("https://www.ecfr.gov/current/on/2026-01-01/title-40/part-1");
  assert.equal(r.transport, "ecfr-api");
});

test("buildFetchDoc: an API-host URL with no document-specific endpoint (fetchDocumentApiImpl returns null) falls through to the plain HTML fetch — the honest exhaustion path, never a silent skip", async () => {
  const fetchDocumentApiImpl = async () => null; // e.g. an agency-listing page, no document_number in the URL
  let plainFetchUrl = null;
  const fetchImpl = async (u) => { plainFetchUrl = u; return mockRes("Agency listing page content, plenty long enough to clear any floor check here."); };
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {}, fetchDocumentApiImpl });
  const url = "https://www.federalregister.gov/agencies/some-agency";
  const r = await fetchDoc(url);
  assert.equal(plainFetchUrl, url, "falls through to directFetchDoc on the ORIGINAL url, not a rewritten one (apiBase host, EUR-Lex rewrite is a no-op)");
  assert.equal(r.transport, "direct-fetch");
});

test("buildFetchDoc: a bare eur-lex.europa.eu /legal-content/.../TXT/ URL is rewritten to its /TXT/HTML/ rendering form before fetching (renderingUrlForPrimary, reused verbatim — proven on CSRD CELEX:32022L2464)", async () => {
  let fetchedUrl = null;
  const fetchImpl = async (u) => { fetchedUrl = u; return mockRes("<p>Article 1</p><p>HAS ADOPTED THIS REGULATION and plenty of real legislative body text here, well past two hundred characters so it clears the usability floor easily.</p>", { contentType: "text/html; charset=utf-8" }); };
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {} });
  const bareUrl = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1727";
  await fetchDoc(bareUrl);
  assert.notEqual(fetchedUrl, bareUrl, "the bare /TXT/ form must not be fetched as-is");
  assert.match(fetchedUrl, /\/TXT\/HTML\//, "renderingUrlForPrimary's rewrite must have fired");
});

test("buildFetchDoc: a federalregister.gov 'Request Access' CAPTCHA shell returned by the API's raw_text_url fallback is flagged wall:request_access, never silently treated as real content", async () => {
  const shellText =
    "Federal Register :: Request Access Request Access Due to aggressive automated scraping of FederalRegister.gov and eCFR.gov, we are unable to serve your request. Your request has been flagged as potentially automated. To ensure our website remains accessible to all users, please complete the CAPTCHA (bot test) below and click \"Request Access\".";
  const fetchDocumentApiImpl = async (url, opts) => ({ status: 200, text: shellText, truncated: false, fullLength: shellText.length, cap: opts.max });
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl: async () => mockRes("unused"), now: () => 0, sleep: async () => {}, fetchDocumentApiImpl });
  const r = await fetchDoc("https://www.federalregister.gov/documents/2026/07/15/2026-14204/some-slug");
  assert.equal(r.transport, "federalregister-api");
  assert.ok(r.wall, "even API-transport text is run through the SAME wall detector — no transport is exempt");
  assert.equal(r.wall.kind, "request_access");
});

test("buildFetchDoc: an EUR-Lex legal-content page whose captured window is portal chrome only (no legislative body) is flagged wall:eurlex_interface_shell", async () => {
  const chromeOnly = "My EUR-Lex EUR-Lex Access to European Union law Select your language Browse by EU institutions " + "chrome ".repeat(100);
  const fetchImpl = async () => mockRes(chromeOnly, { contentType: "text/html; charset=utf-8" });
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {} });
  const r = await fetchDoc("https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32026R1727");
  assert.ok(r.wall, "chrome-only EUR-Lex capture must be flagged even though it clears the 200-char floor");
  assert.equal(r.wall.kind, "eurlex_interface_shell");
});

test("buildFetchDoc: ordinary real content on a non-API, non-EUR-Lex host is never flagged as a wall", async () => {
  const fetchImpl = async () => mockRes("This is a perfectly ordinary regulatory document with plenty of real body text, well past the two-hundred-character usability floor and containing none of the wall vocabulary at all.");
  const fetchDoc = buildFetchDoc({ gapMs: 0, fetchImpl, now: () => 0, sleep: async () => {} });
  const r = await fetchDoc("https://reg.example/doc/123");
  assert.equal(r.wall, null);
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

// ── buildClassifyGate — THE PRE-FETCH GATE (build plan W1.4 item 5: "a verdict lookup precedes any
// fetch") — the SAME decision buildVerdictClassify makes at classify time, read again by
// consumePortalCandidates BEFORE its own fetch step. ─────────────────────────────────────────────────────

test("buildClassifyGate: a URL WITH a verdict -> willClassify true, needsFetch FALSE (no page text needed at all)", () => {
  const verdictsByUrl = indexVerdictsByUrl([verdictEntry({ url: "https://x/hit" })]);
  const gate = buildClassifyGate({ verdictsByUrl, allowApi: false });
  const decision = gate("https://x/hit");
  assert.equal(decision.willClassify, true);
  assert.equal(decision.needsFetch, false, "a verdict is built from the verdict object alone — never fetched");
  assert.equal(decision.source, "session-verdict");
  assert.equal(decision.verdict.candidate_id, "plc-1");
});

test("buildClassifyGate: a URL WITHOUT a verdict, allowApi=false (the default) -> willClassify false, needsFetch false, named reason", () => {
  const gate = buildClassifyGate({ verdictsByUrl: new Map(), allowApi: false });
  const decision = gate("https://x/miss");
  assert.equal(decision.willClassify, false);
  assert.equal(decision.needsFetch, false, "nothing to fetch for — this row is never touched at all");
  assert.equal(decision.source, "skipped-no-verdict");
  assert.match(decision.reason, /no session verdict for this URL/);
});

test("buildClassifyGate: a URL WITHOUT a verdict, allowApi=true -> willClassify true, needsFetch TRUE (the only case a fetch is needed)", () => {
  const gate = buildClassifyGate({ verdictsByUrl: new Map(), allowApi: true });
  const decision = gate("https://x/allow-api");
  assert.equal(decision.willClassify, true);
  assert.equal(decision.needsFetch, true);
  assert.equal(decision.source, "api");
});

test("buildClassifyGate: a verdict hit wins even when allowApi=true — needsFetch stays false", () => {
  const verdictsByUrl = indexVerdictsByUrl([verdictEntry({ url: "https://x/both" })]);
  const gate = buildClassifyGate({ verdictsByUrl, allowApi: true });
  const decision = gate("https://x/both");
  assert.equal(decision.source, "session-verdict");
  assert.equal(decision.needsFetch, false);
});

// ── verdict-batch discovery — every committed ledger-verdicts-NNN.json batch, not only the newest ──────

test("isVerdictsBatchFilename: matches ledger-verdicts-NNN.json only, not README.md/schema.json/other files", () => {
  assert.equal(isVerdictsBatchFilename("ledger-verdicts-001.json"), true);
  assert.equal(isVerdictsBatchFilename("ledger-verdicts-002.json"), true);
  assert.equal(isVerdictsBatchFilename("README.md"), false);
  assert.equal(isVerdictsBatchFilename("schema.json"), false);
  assert.equal(isVerdictsBatchFilename("ledger-verdicts-abc.json"), false);
});

test("sortVerdictsBatchFilenames: ascending by numeric suffix, not lexicographic (010 after 002, not before)", () => {
  const sorted = sortVerdictsBatchFilenames(["ledger-verdicts-010.json", "ledger-verdicts-002.json", "ledger-verdicts-001.json"]);
  assert.deepEqual(sorted, ["ledger-verdicts-001.json", "ledger-verdicts-002.json", "ledger-verdicts-010.json"]);
});

test("discoverVerdictsFiles: lists every batch file ascending, as absolute paths, via an injected readdirSyncImpl", () => {
  const files = discoverVerdictsFiles("/fake/dir", {
    readdirSyncImpl: () => ["README.md", "ledger-verdicts-002.json", "schema.json", "ledger-verdicts-001.json"],
  });
  assert.deepEqual(files, [resolve("/fake/dir/ledger-verdicts-001.json"), resolve("/fake/dir/ledger-verdicts-002.json")]);
});

test("discoverVerdictsFiles: a missing directory yields [] (no batches yet), never a throw", () => {
  const files = discoverVerdictsFiles("/does/not/exist", {
    readdirSyncImpl: () => { throw new Error("ENOENT"); },
  });
  assert.deepEqual(files, []);
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

test("shapeConsumeResult: metrics.matched is with_verdict under build plan W1.4's own vocabulary; metrics.verdict_batches_read carries opts.verdictBatchesRead", () => {
  const result = {
    mode: "plan", discovered: 1, fetched: 0, classified: 1,
    outcomes: [{ ledgerId: "row-1", url: "https://x/1", disposition: "would_mint", reason: "dry: minted" }],
  };
  const telemetry = new Map([
    ["https://x/1", { sourceId: "s1", costUsd: 0, renderMs: 0, inputTokens: 0, outputTokens: 0, ok: true, error: null, source: "session-verdict", verdictCandidateId: "row-1", confidence: 0.9 }],
  ]);
  const { metrics } = shapeConsumeResult(result, telemetry, { verdictBatchesRead: 2 });
  assert.equal(metrics.matched, 1);
  assert.equal(metrics.matched, metrics.with_verdict, "matched is an alias of with_verdict, not a second count");
  assert.equal(metrics.verdict_batches_read, 2);
});

test("shapeConsumeResult: without_verdict_skipped counts a classifyGate-skipped row even with NO telemetry entry (the undercount bug this lane fixed)", () => {
  // This is the production shape: consumePortalCandidates's classifyGate skips the row BEFORE classify()
  // is ever called, so telemetry (only written from inside classify()) has NOTHING for this URL — the
  // ONLY signal is the outcome's own "skipped-no-verdict:" reason text.
  const result = {
    mode: "plan", discovered: 1, fetched: 0, classified: 0,
    outcomes: [{ ledgerId: "row-1", url: "https://x/gated", disposition: "skipped", reason: "skipped-no-verdict: no session verdict for this URL (--verdicts) and --allow-api not set (defaults false) — never sent to the API" }],
  };
  const { metrics } = shapeConsumeResult(result, new Map());
  assert.equal(metrics.without_verdict_skipped, 1, "counted from outcomes, not just telemetry");
});

test("shapeConsumeResult: without_verdict_skipped does not double-count a URL that has BOTH a telemetry entry AND a matching outcome reason", () => {
  const result = {
    mode: "plan", discovered: 1, fetched: 0, classified: 0,
    outcomes: [{ ledgerId: "row-1", url: "https://x/both-paths", disposition: "skipped", reason: "classify failed: skipped-no-verdict: no session verdict for this URL (--verdicts) and --allow-api not set (defaults false) — never sent to the API" }],
  };
  const telemetry = new Map([
    ["https://x/both-paths", { sourceId: "s1", costUsd: 0, renderMs: 0, inputTokens: 0, outputTokens: 0, ok: false, error: "skipped-no-verdict: ...", source: "skipped-no-verdict" }],
  ]);
  const { metrics } = shapeConsumeResult(result, telemetry);
  assert.equal(metrics.without_verdict_skipped, 1, "one row, one count — telemetry path wins, outcomes path excludes URLs already in telemetry");
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

// ── export cursor persistence — resolveExportAfter / findLatestExportArtifact / buildExportRunArtifact
// (build plan W1.4 item 1: "the export lands as today"; item 5: "two consecutive chained runs cover
// disjoint windows"). ───────────────────────────────────────────────────────────────────────────────────

test("resolveExportAfter: an explicit --after ALWAYS wins, even when a prior export artifact exists (build item 2: hand dispatch keeps every input)", () => {
  const after = resolveExportAfter({
    explicitAfter: { firstSeenAt: "2026-09-01T00:00:00Z", id: "explicit-id" },
    latestExportArtifact: { config: { action: "export" }, metrics: { next_cursor: { firstSeenAt: "2026-08-01T00:00:00Z", id: "old-id" } } },
  });
  assert.deepEqual(after, { firstSeenAt: "2026-09-01T00:00:00Z", id: "explicit-id" });
});

test("resolveExportAfter: no explicit --after -> auto-resumes from the prior export artifact's own next_cursor", () => {
  const after = resolveExportAfter({
    explicitAfter: null,
    latestExportArtifact: { config: { action: "export" }, metrics: { next_cursor: { firstSeenAt: "2026-08-01T00:00:00Z", id: "prior-id" } } },
  });
  assert.deepEqual(after, { firstSeenAt: "2026-08-01T00:00:00Z", id: "prior-id" });
});

test("resolveExportAfter: a config.action='consume' artifact is IGNORED — the consume cursor is a different keyset walk, never conflated with the export cursor", () => {
  const after = resolveExportAfter({
    explicitAfter: null,
    latestExportArtifact: { config: { action: "consume" }, metrics: { next_cursor: { firstSeenAt: "2026-08-01T00:00:00Z", id: "consume-id" } } },
  });
  assert.equal(after, null);
});

test("resolveExportAfter: no explicit --after and no prior export artifact -> null (start from the beginning, the honest default)", () => {
  assert.equal(resolveExportAfter({ explicitAfter: null, latestExportArtifact: null }), null);
});

test("resolveExportAfter: a prior export whose own window was exhausted (next_cursor: null) resolves to null, not undefined", () => {
  const after = resolveExportAfter({ explicitAfter: null, latestExportArtifact: { config: { action: "export" }, metrics: { next_cursor: null } } });
  assert.equal(after, null);
});

test("findLatestExportArtifact: returns the LAST config.action==='export' run from readRunHistory's ascending order, ignoring consume runs", () => {
  const artifact = findLatestExportArtifact("/fake/dir", {
    readRunHistoryImpl: () => ({
      runs: [
        { run_id: "ledger-consume-run-001", config: { action: "export" }, metrics: { next_cursor: { firstSeenAt: "a", id: "1" } } },
        { run_id: "ledger-consume-run-002", config: { action: "consume" }, metrics: { next_cursor: { firstSeenAt: "b", id: "2" } } },
        { run_id: "ledger-consume-run-003", config: { action: "export" }, metrics: { next_cursor: { firstSeenAt: "c", id: "3" } } },
      ],
    }),
  });
  assert.equal(artifact.run_id, "ledger-consume-run-003");
});

test("findLatestExportArtifact: no export runs at all -> null", () => {
  const artifact = findLatestExportArtifact("/fake/dir", {
    readRunHistoryImpl: () => ({ runs: [{ run_id: "ledger-consume-run-001", config: { action: "consume" }, metrics: {} }] }),
  });
  assert.equal(artifact, null);
});

test("buildExportRunArtifact: shape validates against F28 (via a live import), config.action='export' distinguishes it from a consume artifact", async () => {
  const { validateRunArtifact } = await import("../lib/run-artifact.mjs");
  const payload = {
    count: 1, with_text: true, fetch_ok_count: 1, fetch_failed_count: 0,
    next_cursor: { firstSeenAt: "2026-09-01T00:00:00Z", id: "x" },
    candidates: [{ candidate_id: "plc-1", url: "https://x/a", source_id: "s1", fetch_ok: true, fetch_error: null }],
  };
  const artifact = buildExportRunArtifact({
    runId: "ledger-consume-run-010",
    harnessVersion: "sha256:0000000000000000",
    startedAt: "2026-09-05T00:00:00Z",
    finishedAt: "2026-09-05T00:00:05Z",
    config: { action: "export", limit: 400, after: null, after_source: "start", with_text: true },
    inputsRef: ["portal_link_candidates: status=candidate limit=400 order=asc(first_seen_at,id) after=start"],
    payload,
    outPath: "scripts/harness-runs/ledger-consume/candidates-x.json",
  });
  const errors = validateRunArtifact(artifact);
  assert.deepEqual(errors, []);
  assert.equal(artifact.config.action, "export");
  assert.equal(artifact.metrics.next_cursor.id, "x");
  assert.equal(artifact.per_item[0].outcome, "fetch_ok");
});

// THE BUILD-BRIEF ITEM 5 TEST: "A unit test proves two consecutive chained runs cover disjoint windows."
// Emulates keyset pagination across TWO --export-candidates dispatches: the first has no prior artifact
// (starts from the beginning), the second reads the first's own next_cursor back via resolveExportAfter +
// findLatestExportArtifact — never restarting from the same window, the exact defect
// ledger-consume-run-001/002 recorded on the consume side.
test("two consecutive chained --export-candidates runs cover DISJOINT windows (build plan W1.4 item 5)", async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "ledger-consume-chain-"));
  try {
    // A tiny in-memory ledger, ascending (first_seen_at, id) — the same order selectCandidateLedgerPage
    // (portal-harvest.ts) queries in. selectPage below emulates its own after-cursor keyset filtering.
    const LEDGER = [
      { id: "id-1", url: "https://x/1", source_id: "s", first_seen_at: "2026-07-19T00:00:00Z", sources: null },
      { id: "id-2", url: "https://x/2", source_id: "s", first_seen_at: "2026-07-19T00:00:01Z", sources: null },
      { id: "id-3", url: "https://x/3", source_id: "s", first_seen_at: "2026-07-19T00:00:02Z", sources: null },
      { id: "id-4", url: "https://x/4", source_id: "s", first_seen_at: "2026-07-19T00:00:03Z", sources: null },
    ];
    const selectPage = async ({ limit, after }) => {
      const startIdx = after ? LEDGER.findIndex((r) => r.id === after.id) + 1 : 0;
      return LEDGER.slice(startIdx, startIdx + limit);
    };

    // ── run 1: no prior artifact anywhere -> effectiveAfter is null, starts from the beginning ──────────
    const run1Dir = tmpDir; // same dir as run 2 — the real coordinator's harness-runs dir persists across dispatches
    const latest1 = findLatestExportArtifact(run1Dir); // real readRunHistory against an empty/nonexistent dir
    const effectiveAfter1 = resolveExportAfter({ explicitAfter: null, latestExportArtifact: latest1 });
    assert.equal(effectiveAfter1, null, "no prior export artifact -> starts from the beginning");
    const out1 = join(tmpDir, "candidates-1.json");
    const { payload: payload1 } = await runExportCandidates({
      selectPage, limit: 2, after: effectiveAfter1, outPath: out1, now: () => "2026-09-05T00:00:00Z",
    });
    assert.deepEqual(payload1.candidates.map((c) => c.candidate_id), ["id-1", "id-2"]);
    assert.deepEqual(payload1.next_cursor, { firstSeenAt: "2026-07-19T00:00:01Z", id: "id-2" });

    // Persist run 1's OWN artifact — the mechanism this lane adds so run 2 can find it.
    const { claimRunId, writeRunArtifact } = await import("../lib/run-artifact.mjs");
    const runId1 = claimRunId(run1Dir, "ledger-consume");
    writeRunArtifact(
      run1Dir,
      buildExportRunArtifact({
        runId: runId1,
        harnessVersion: "sha256:0000000000000000",
        startedAt: "2026-09-05T00:00:00Z",
        finishedAt: "2026-09-05T00:00:01Z",
        config: { action: "export", limit: 2, after: effectiveAfter1, after_source: "start" },
        inputsRef: ["run 1"],
        payload: payload1,
        outPath: out1,
      })
    );

    // ── run 2: reads run 1's artifact back, resumes past its next_cursor ─────────────────────────────────
    const latest2 = findLatestExportArtifact(run1Dir);
    assert.equal(latest2.run_id, runId1);
    const effectiveAfter2 = resolveExportAfter({ explicitAfter: null, latestExportArtifact: latest2 });
    assert.deepEqual(effectiveAfter2, { firstSeenAt: "2026-07-19T00:00:01Z", id: "id-2" }, "auto-resumed from run 1's own next_cursor");
    const out2 = join(tmpDir, "candidates-2.json");
    const { payload: payload2 } = await runExportCandidates({
      selectPage, limit: 2, after: effectiveAfter2, outPath: out2, now: () => "2026-09-05T00:01:00Z",
    });
    assert.deepEqual(payload2.candidates.map((c) => c.candidate_id), ["id-3", "id-4"]);

    // THE ASSERTION: the two windows are disjoint — no id appears in both.
    const ids1 = new Set(payload1.candidates.map((c) => c.candidate_id));
    const ids2 = new Set(payload2.candidates.map((c) => c.candidate_id));
    const overlap = [...ids1].filter((id) => ids2.has(id));
    assert.deepEqual(overlap, [], "run 2 must never re-fetch a row run 1 already exported");
    assert.notEqual(effectiveAfter1?.id, effectiveAfter2?.id, "the two runs' effective cursors differ — they did not restart from the same window");
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

// Lane LEDGER-WALLS, 2026-09-04: a detected wall is checked BEFORE the 200-char floor — the whole point is
// that a wall body (1,180ch FR shell) routinely CLEARS 200ch, so the floor check alone would misclassify
// it as usable text and send it to classify (exactly what happened to 230 rows in export #5).
test("shapeCandidateTextFields: a detected access wall -> fetch_ok false, fetch_error='access_wall:<kind>', text still carried (checked BEFORE the 200ch floor, which this wall clears easily)", () => {
  const shellText = "X".repeat(1180); // clears 200ch on raw length alone — the exact export #5 shape
  const r = shapeCandidateTextFields(
    { ok: true, text: shellText, transport: "direct-fetch", wall: { kind: "request_access", evidence: "..." } },
    { maxChars: 6000 }
  );
  assert.equal(r.fetch_ok, false);
  assert.equal(r.fetch_error, "access_wall:request_access");
  assert.equal(r.fetched_chars, 1180, "text is still sliced/carried, same as the below-floor case — never discarded");
  assert.equal(r.transport, "direct-fetch");
});

test("shapeCandidateTextFields: fetchOutcome.wall absent/null -> the ordinary floor/success path runs unchanged", () => {
  const r = shapeCandidateTextFields({ ok: true, text: "A".repeat(300), transport: "direct-fetch", wall: null }, { maxChars: 6000 });
  assert.equal(r.fetch_ok, true);
  assert.equal(r.fetch_error, null);
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
