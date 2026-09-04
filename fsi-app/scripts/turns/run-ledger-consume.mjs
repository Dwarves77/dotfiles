#!/usr/bin/env node
// run-ledger-consume.mjs — the ledger-consume family's canonical entry point (Lane CONSUME,
// 2026-09-02, system-completion train). A thin driver over ONE EXISTING, UNMODIFIED module that had a
// runtime nowhere in this repo before this file: `consumePortalCandidates`
// (`src/lib/intake/portal-harvest.ts`) — the CONSUME half of the portal-deep-link discovery slice.
// `persistPortalCandidates` (the same file's WRITE half) already has a runtime, the scheduled
// check-sources crawl; `consumePortalCandidates` (ledger row -> classify -> chokepoint -> intake) never
// did (system-completion plan §0, item 1: "`consumePortalCandidates` has no production caller"), leaving
// 1,454 `portal_link_candidates.status='candidate'` rows with no reader.
//
// WHY JITI, NOT A PLAIN NODE IMPORT. Verified directly (jiti-probe, this lane, 2026-09-02): a plain
// `import { consumePortalCandidates } from "../../src/lib/intake/portal-harvest.ts"` under bare `node`
// throws immediately — `portal-harvest.ts` imports `@/lib/llm/first-fetch-classify`,
// `@/lib/agent/metadata-vocab`, and (transitively, through `apply-staged-update.ts` /
// `run-intake-cycle.ts`) a wide graph reaching `workflows/generate-brief.ts`, `mint-item.ts`,
// `verify-item.mjs` and more — every one of them via the `@/lib/...` TS path alias
// (`tsconfig.json`'s `"paths": {"@/*": ["./src/*"]}`, a `moduleResolution: "bundler"` construct only
// Next.js's own bundler resolves). This is EXACTLY the gap `run-source-sweep.mjs`'s header names for
// the same reason, on a different module. jiti (`createJiti(import.meta.url, {interopDefault:true,
// alias:{"@":resolve(ROOT,"src")}})`, the `scripts/canonical-pipeline-proof.mjs` pattern) transpiles TS
// on the fly and resolves the alias itself — CONFIRMED by actually running `jiti.import` against both
// `portal-harvest.ts` and `first-fetch-classify.ts` in this lane (no network, no DB). This is a one-time
// verified confirmation, not a standing test — `run-ledger-consume.test.mjs`'s own header explains why a
// jiti-load test cannot live in that file (the repo's `glob-portability` discipline forbids a bare npm
// import in a file matched by `run-test-suite.sh`'s no-`npm-ci` glob).
//
// MODES (portal-harvest.ts's own contract, verbatim): 'plan' is READ-ONLY and free of grounding — every
// candidate runs the real chokepoint gates via a dry pre-pass and NOTHING is written (no ledger update,
// no staged row, no mint). It STILL calls the Haiku classify step (~$0.001/candidate, first-fetch-
// classify.ts's own cost note) for every row that clears the fetch step — plan mode is READ-ONLY, not
// FREE. 'apply' pushes would-mint candidates through the full intake cycle (stage -> mint -> ground ->
// validate) and stamps the ledger disposition — the operator-priced grounding path.
//
// THE APPLY GATE (ADR-023's "producer ENABLED const is the reviewed-code gate" ruling, applied here to a
// consumer instead of a producer). `LEDGER_CONSUME_APPLY_ENABLED` below is a SOURCE CONSTANT, not an env
// var or a CLI flag — flipping it appears in `git diff` and is a human-reviewed change, exactly the
// property ADR-023 §4 names for producers' own `ENABLED` const ("arming a producer is visible in a
// diff... you cannot stop a misbehaving worker with a pull request [alone], but you also cannot arm one
// without one"). `--mode apply` while the const is false is not silently downgraded — see
// `resolveApplyGate` below: it prints a named "apply DISARMED" line, records `apply_disarmed: true` +
// `requested_mode: "apply"` + `mode: "plan"` in the artifact's `config`, and actually RUNS as plan (writes
// nothing) rather than either pretending apply ran or refusing to do anything useful with the dispatch.
//
// FLIPPED TRUE (operator ruling 2026-09-04, this diff, ADR-023's own reviewed-change mechanism). The
// operator's verbatim rulings this session — "stop offering API when you have a free option with Haiku"
// and "why is this costing me anything when it can be done for free?" — are answered below by the
// session-verdict path, not by leaving apply disarmed forever. With the $0 default in place (no verdict
// -> SKIPPED, never sent to the API — see THE SESSION-VERDICT FLIP below), arming apply no longer means
// "every dispatch spends real money sight-unseen": an apply run with no `--verdicts` file mints nothing
// (every candidate is skipped) and an apply run WITH one mints only what a session lane already
// classified for free. That is the condition ADR-023 §4's two gates exist to let a human set once
// reviewed — this diff is that review, recorded in the same change that flips the constant (see
// `LEDGER_CONSUME_APPLY_ENABLED`'s own comment below and `docs/decisions/ADR-023-producer-execution-
// model.md`'s Consequences section, which records the flip per the ADR's own mechanism).
//
// THE SESSION-VERDICT FLIP (same operator ruling, same diff — the OTHER half of "done" for this family).
// Before this change, EVERY dispatch — plan or apply — called Haiku (`firstFetchClassify`,
// ~$0.001/candidate) for every candidate whose fetch cleared the 200-char floor: plan mode's "read-only"
// promise was about writes, never about spend. `--verdicts <path>` (a session-verdict batch — see
// `scripts/turns/ledger-verdicts/README.md` + `schema.json` for the file contract) lets a session lane
// that already ran the IDENTICAL prompt (`FIRST_FETCH_HAIKU_SYSTEM_PROMPT` /
// `buildFirstFetchClassifyUserMessage`, both exported from `first-fetch-classify.ts` for exactly this —
// ONE BODY, never a second hand-typed copy of the prompt) supply the classification for $0. The default
// posture, with or without `--verdicts`, is now: a candidate with a verdict in the file uses it (classify
// bypassed entirely, $0, `classify_source: "session-verdict"` in this run's own artifact); a candidate
// WITHOUT one is SKIPPED — untouched, left `status='candidate'` for a later batch — and is NEVER sent to
// the metered API. The API path (`firstFetchClassify`, real spend) survives ONLY behind `--allow-api`, an
// explicit CLI-only flag defaulting false that `ledger-consume.yml` does not expose as a workflow input —
// so a workflow dispatch can never spend by omission, only a human running the script directly and asking
// for it by name. `--export-candidates <path>` is the OTHER new mode: a read-only lister (no fetch, no
// classify, no DB write) that hands a session lane the candidate rows to fetch + classify offline.
//
// TELEMETRY (operator ruling 2026-07-06: "every classify call must leave an agent_runs row") — CLOSED
// AT THE SOURCE, NOT BY THIS DRIVER (integration, system-completion train, 2026-09-02). The original Lane
// CONSUME build found `firstFetchClassify` (src/lib/llm/first-fetch-classify.ts) making its OWN raw
// `fetch()` call straight to Anthropic's Messages endpoint — ticketless, unlogged, outside the
// spend chokepoint — and closed the gap from THIS side, by wrapping the `classify` injection point so the
// wrapper itself wrote one `agent_runs` row per call. Lane SPEND (same train) then closed the SAME gap
// from the OTHER side, properly: `firstFetchClassify` now routes every Haiku call through
// `spend-client.ts`'s `spendMessage` (ticket-gated, budget-checked), which writes the `agent_runs` row
// itself via `recordSpendCall` — keyed by `source_id` from the `SpendTicket` `firstFetchClassify` sets
// internally (`standingClass: "first-fetch-classify"`, the Rule-016 sanctioned class). So the telemetry
// row for a classify call now exists BEFORE this driver's `classify` wrapper ever runs. Keeping the old
// wrapper's own `agent_runs` insert would write a SECOND row per call — a double-count, not a fix — so it
// is REMOVED here. What remains is `collectClassifyTelemetry` (below): a READ-ONLY collector, not a
// write-site, that captures `FirstFetchClassifyResult`'s cost/token fields per URL purely so THIS run's
// own `ledger-consume` artifact (per_item `est_usd`/token counts, `metrics.est_usd_total`) can report real
// numbers without a second lookup and without re-deriving anything the chokepoint already owns.
//
// TOKEN COUNTS — NO LONGER A GAP. `FirstFetchClassifyOutput` now exposes `input_tokens`/`output_tokens`
// alongside `cost_usd_estimated`/`render_ms` (Lane SPEND, 2026-09-02 — the chokepoint has the real Haiku
// `usage` block and `firstFetchClassify` now returns it instead of discarding it). `collectClassifyTelemetry`
// reads all four fields; this run's artifact carries real per-call cost AND real per-call token counts.
//
// Usage:
//   node scripts/turns/run-ledger-consume.mjs --mode plan [--limit 50] [--source-id <uuid>]
//     [--newest-first] [--after '{"firstSeenAt":"...","id":"..."}'] [--harness-runs-dir dir] [--trace-dir dir]
//     [--verdicts <path>] [--allow-api]
//   node scripts/turns/run-ledger-consume.mjs --mode apply --verdicts <path> ...
//     # apply only actually WRITES when LEDGER_CONSUME_APPLY_ENABLED is true (see below) — otherwise it
//     # runs as plan, records why. A candidate with a verdict in --verdicts is minted/rejected from that
//     # verdict; one without is SKIPPED (never sent to the API) unless --allow-api is also given.
//   node scripts/turns/run-ledger-consume.mjs --export-candidates <path> [--limit N] [--source-id <uuid>]
//     [--after '{"firstSeenAt":"...","id":"..."}'] [--with-text]
//     # READ-ONLY: no classify, no DB write. Lists candidate rows for offline classification. Ignores
//     # --mode/--verdicts/--allow-api. Without --with-text: no fetch either (unchanged from Lane
//     # LEDGER-ZERO). WITH --with-text: fetches each URL through the SAME fetchDoc (buildFetchDoc — same
//     # politeness gap, same timeout, no second fetcher — see "THE DEFECT THIS CLOSES" below) and carries
//     # the fetched text in the payload, so a classification lane never fetches.
// Exit 0 done · 1 bad args · 2 no DB creds · 3 --allow-api requested but no ANTHROPIC_API_KEY ·
//      4 --verdicts file failed schema validation (scripts/turns/ledger-verdicts/schema.json).
//
// THE DEFECT THIS CLOSES (Lane LEDGER-EXPORT, 2026-09-04, coordinator [CONFIRMED] 16:55). LEDGER-ZERO's
// --export-candidates listed candidate rows WITHOUT page text — its own note_on_fetched_text said "a
// session lane must fetch each URL itself (e.g. via the browser)". The coordinator tried exactly that:
// 1,837 candidates, Haiku classification lanes fetching through WebFetch hit rate limits within minutes,
// and one lane started guessing a classification from the URL string instead of the fetched page (refused
// — see docs/runbooks/CORPUS-TURN-RUNBOOK.md's "Ledger consume" section). This runtime already owns the
// ONE polite fetcher (buildFetchDoc, above — the ConsumeOpts.FetchDocFn contract, with the politeness gap
// and the 20s timeout) and plan mode already fetches every candidate it classifies — so the fix is to run
// THAT SAME fetcher inside --export-candidates (via --with-text) and carry the fetched text in the export
// payload, in the Actions runner (which has real network access this environment does not), delivered as
// a workflow artifact branch — never a second, hand-rolled fetcher, and never a classification lane
// fetching for itself.

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
// THE DEFECT LEDGER-TEXT CLOSES (coordinator [CONFIRMED], first export run 33902755838, 2026-09-04 17:51
// — see buildFetchDoc's own comment below for the full account): these three imports are plain ESM (no
// jiti needed — a relative-path import, same as run-artifact.mjs/governing-files.mjs above), the same
// charset-aware decode + PDF-or-HTML codec + text-extraction path src/lib/agent/canonical-pipeline.ts's
// directFetchClean uses, applied here so buildFetchDoc stops returning raw HTML as if it were text.
import { htmlToText } from "../../src/lib/text/html-to-text.mjs";
import { decodeHtmlBytes, cleanCtl } from "../../src/lib/sources/charset-decode.mjs";
import { classifyBody, pdfToText } from "../../src/lib/sources/pdf-extract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const ROOT = FSI_ROOT;
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "ledger-consume");

// This family's governing files — the driver plus the two library modules it gives a production runtime
// to for the first time. IMPORTED from scripts/harness-runs/governing-files.mjs (Wave GOV-SINGLE,
// 2026-09-04), re-exported under this historical name so existing importers keep working unchanged — F28's
// own copy and this runner's self-hash are now the same array by construction, not two hand-synced ones.
export const LEDGER_CONSUME_GOVERNING_FILES = GOVERNING_FILES['ledger-consume'];

// THE APPLY GATE (see header). FLIPPED TRUE 2026-09-04 — operator ruling, this diff, ADR-023's own
// reviewed-change mechanism ("stop offering API when you have a free option with Haiku"; "why is this
// costing me anything when it can be done for free?"). Armed together with the session-verdict $0 default
// (see header): an apply dispatch with no --verdicts file mints nothing (every candidate skipped, never
// sent to the API); one WITH a verdicts file mints only what a session lane already classified for free.
// docs/decisions/ADR-023-producer-execution-model.md records this flip per its own mechanism.
export const LEDGER_CONSUME_APPLY_ENABLED = true;

const MODES = Object.freeze(["plan", "apply"]);

function usage() {
  return (
    "Usage: node scripts/turns/run-ledger-consume.mjs [--mode plan|apply] [--limit N] [--source-id uuid]\n" +
    "         [--newest-first] [--after '{\"firstSeenAt\":\"...\",\"id\":\"...\"}']\n" +
    "         [--harness-runs-dir dir] [--trace-dir dir] [--verdicts path] [--allow-api]\n" +
    "       node scripts/turns/run-ledger-consume.mjs --export-candidates path [--limit N] [--source-id uuid]\n" +
    "         [--newest-first] [--after '{\"firstSeenAt\":\"...\",\"id\":\"...\"}'] [--with-text]"
  );
}

/** Pure CLI arg parse/validate. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: {
        mode: { type: "string", default: "plan" },
        limit: { type: "string", default: "50" },
        "source-id": { type: "string" },
        "newest-first": { type: "boolean", default: false },
        after: { type: "string" },
        "harness-runs-dir": { type: "string" },
        "trace-dir": { type: "string" },
        verdicts: { type: "string" },
        "allow-api": { type: "boolean", default: false },
        "export-candidates": { type: "string" },
        "with-text": { type: "boolean", default: false },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }

  if (!MODES.includes(values.mode)) {
    return { ok: false, error: `--mode must be "plan" or "apply" (got ${JSON.stringify(values.mode)}).` };
  }
  const limit = Number(values.limit);
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit)) {
    return { ok: false, error: `--limit must be a positive integer (got ${JSON.stringify(values.limit)}).` };
  }
  if (values.verdicts !== undefined && !values.verdicts.trim()) {
    return { ok: false, error: "--verdicts, if given, must be a non-empty path." };
  }
  if (values["export-candidates"] !== undefined && !values["export-candidates"].trim()) {
    return { ok: false, error: "--export-candidates, if given, must be a non-empty path." };
  }
  if (values["with-text"] === true && !values["export-candidates"]) {
    // Loud, not a silent no-op (this file's own discipline — see e.g. the never-silently-defaulted verdict
    // fields): --with-text has no meaning outside --export-candidates, so an operator who typed it expecting
    // an effect finds out immediately, not by reading an unaugmented payload afterward.
    return { ok: false, error: "--with-text requires --export-candidates (it has no effect in plan/apply mode)." };
  }

  let after = null;
  if (values.after) {
    let parsed;
    try {
      parsed = JSON.parse(values.after);
    } catch (err) {
      return { ok: false, error: `--after must be valid JSON: ${err.message}` };
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.firstSeenAt !== "string" ||
      !parsed.firstSeenAt.trim() ||
      typeof parsed.id !== "string" ||
      !parsed.id.trim()
    ) {
      return { ok: false, error: `--after must be {"firstSeenAt": "...", "id": "..."} (both non-empty strings).` };
    }
    after = { firstSeenAt: parsed.firstSeenAt, id: parsed.id };
  }

  return {
    ok: true,
    mode: values.mode,
    limit,
    sourceId: values["source-id"] || null,
    newestFirst: values["newest-first"] === true,
    after,
    harnessRunsDir: values["harness-runs-dir"] || null,
    traceDir: values["trace-dir"] || null,
    verdicts: values.verdicts || null,
    allowApi: values["allow-api"] === true,
    exportCandidates: values["export-candidates"] || null,
    withText: values["with-text"] === true,
  };
}

/** Where a run's raw ConsumeResult (its full trace) is written when --trace-dir is not given: one level
 *  below the family directory, matching source-sweep's `defaultTraceDir` — so F28's family-level *.json
 *  artifact glob never sees it (see CONVENTION.md's source-sweep directory-layout note for the same
 *  reason, applied here). PURE. @param {string} harnessRunsDir */
export function defaultTraceDir(harnessRunsDir) {
  return join(harnessRunsDir, "traces");
}

// ── fetchDoc — a polite plain fetch (ConsumeOpts.FetchDocFn contract) ─────────────────────────────────
//
// Injectable (fetchImpl/now/sleep/pdfToTextImpl) so the politeness gap AND the PDF codec are testable
// deterministically without real network, real timers, or a real PDF parse — the same discipline
// run-source-sweep.mjs's inline politeFetch has, made exportable here because this driver's own tests
// need to prove the gap fires without a live clock.
//
// THE DEFECT THIS CLOSES (Lane LEDGER-TEXT, 2026-09-04 — coordinator [CONFIRMED] from the first
// --with-text export, run 33902755838, 2026-09-04 17:51): this function used to return `res.text()`
// RAW — every one of the 400 exported candidates carried ~6,000 characters of
// "<!DOCTYPE html><html lang=..." (head, scripts, nav markup), and the live plan/apply path fed that
// same raw HTML straight into firstFetchClassify (whose FirstFetchClassifyInput.text is documented
// "Excerpt text from the fetch (already stripped of HTML)" — the contract always assumed stripped text;
// this fetcher never delivered it), so the classifier's "content excerpt" has been markup since the
// runtime was built. Fixed by routing through the SAME two things canonical-pipeline.ts's
// directFetchClean uses: the charset-aware decode (decodeHtmlBytes — header > <meta> > utf-8, never a
// hardcoded utf-8) feeding the ONE shared htmlToText body (src/lib/text/html-to-text.mjs), and a
// PDF-or-HTML codec choice (classifyBody + pdfToText) for a reachable PDF candidate — a PDF body used to
// be handed to htmlToText as if it were HTML (extracting nothing usable); it now extracts real text.
// portal-harvest.ts's 200-char floor and the export's `fetched_chars` therefore now describe TEXT, not
// markup — what portal-harvest.ts:306's floor always intended to measure.
export function buildFetchDoc({
  gapMs = Number(process.env.LEDGER_CONSUME_FETCH_GAP_MS ?? 1000),
  timeoutMs = 20_000,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  pdfMaxChars = 400_000, // generous — downstream (classify's user-message template, --with-text's export
  // shaping) truncates further to CONTENT_MAX_CHARS (6,000) regardless; this only bounds the PDF codec's
  // own extraction work, same order of magnitude as acquire-primaries-batch.mjs's MAXCH for the same job.
  pdfToTextImpl = pdfToText,
} = {}) {
  let lastFetchAt = 0;
  return async function fetchDoc(url) {
    const wait = lastFetchAt + gapMs - now();
    if (wait > 0) await sleep(wait);
    lastFetchAt = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "FSI-ledger-consume/1.0 (+corpus-turn)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "accept-language": "en",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const contentType = res.headers.get("content-type");
      const u8 = new Uint8Array(await res.arrayBuffer());
      // PDF-OR-HTML (same header-or-magic-bytes codec directFetchClean uses): a reachable PDF candidate
      // extracts to real text via pdfToText instead of being handed to htmlToText as if it were markup.
      if (classifyBody(contentType, u8) === "pdf") {
        const { text: pdfText } = await pdfToTextImpl(u8, pdfMaxChars);
        const text = (cleanCtl(pdfText) ?? "").replace(/\s+/g, " ").trim();
        return { text, transport: "direct-pdf" };
      }
      // CHARSET-AWARE DECODE + THE ONE htmlToText BODY: header > <meta> > utf-8 (never a hardcoded
      // utf-8 — a Latin-1/windows-1252 page decoded as utf-8 corrupts every accent to U+FFFD), then
      // strip to plain text. This is the fix — buildFetchDoc used to return `res.text()` raw HTML.
      const decoded = decodeHtmlBytes(u8, contentType);
      const text = htmlToText(decoded.text);
      return { text, transport: "direct-fetch" };
    } finally {
      clearTimeout(timer);
    }
  };
}

// ── classify telemetry collector — READ-ONLY, not an agent_runs write-site ─────────────────────────────
//
// See this file's header ("TELEMETRY ... CLOSED AT THE SOURCE, NOT BY THIS DRIVER") for why this is a
// collector and not a writer: firstFetchClassify now leaves its own agent_runs row via the spend
// chokepoint (spend-client.ts's spendMessage -> recordSpendCall), so a second write here would double the
// row count per call. This function exists ONLY to give this family's own artifact real cost/token
// numbers without a second lookup.

/**
 * Wrap `baseClassify` (first-fetch-classify.ts's `firstFetchClassify`, or a test double of the same
 * shape) to CAPTURE per-call telemetry into a `Map`, without writing anything anywhere. Returns
 * `{ classify, telemetry }`:
 *   - `classify` has the exact `ConsumeOpts.classify` shape ((input, apiKey) => FirstFetchClassifyResult)
 *     and is what the driver passes into `consumePortalCandidates`. It NEVER changes `baseClassify`'s
 *     return value or behavior — a pure pass-through with a side-effect-free recording step.
 *   - `telemetry` is a `Map<sourceUrl, {sourceId, costUsd, renderMs, inputTokens, outputTokens, ok, error}>`
 *     accumulated as calls happen — read back AFTER the run to shape the artifact's per_item `est_usd`/
 *     token counts (portal-harvest.ts's `CandidateOutcome` does not itself carry a cost or token count,
 *     so this is the side-channel that supplies them; see `shapeConsumeResult`'s own doc for the
 *     source_id-availability caveat this implies).
 * @param {Function} baseClassify
 */
export function collectClassifyTelemetry(baseClassify) {
  const telemetry = new Map();

  async function classifyWithTelemetry(input, apiKey) {
    const res = await baseClassify(input, apiKey);
    const ok = res != null && res.ok === true;
    const costUsd = ok && typeof res.result.cost_usd_estimated === "number" ? res.result.cost_usd_estimated : 0;
    const renderMs = ok && typeof res.result.render_ms === "number" ? res.result.render_ms : null;
    const inputTokens = ok && typeof res.result.input_tokens === "number" ? res.result.input_tokens : 0;
    const outputTokens = ok && typeof res.result.output_tokens === "number" ? res.result.output_tokens : 0;
    const error = ok ? null : res?.error ?? "classify returned no result";

    telemetry.set(input.source_url, {
      sourceId: input.source_id ?? null,
      costUsd,
      renderMs,
      inputTokens,
      outputTokens,
      ok,
      error,
      source: "api", // a real, metered Haiku call — see buildVerdictClassify below for the other two sources
    });

    return res;
  }

  return { classify: classifyWithTelemetry, telemetry };
}

// ── session-verdict file — THE $0 DEFAULT (operator ruling 2026-09-04) ─────────────────────────────────
//
// Contract: scripts/turns/ledger-verdicts/schema.json + README.md. A verdict file is a session lane's
// OFFLINE classification of candidates listed by --export-candidates, produced under the IDENTICAL
// prompt firstFetchClassify uses (FIRST_FETCH_HAIKU_SYSTEM_PROMPT / buildFirstFetchClassifyUserMessage,
// both exported from first-fetch-classify.ts for exactly this — ONE BODY). Everything below is PURE
// (no I/O, no DB, no network) so it is fully unit-testable without a live file or a stub Supabase client.

const VERDICT_ENTITY_VERDICTS = Object.freeze(["specific_document", "portal", "uncertain"]);
const VERDICT_SURFACE_TAGS = Object.freeze(["regulations", "operations", "market_intel", "research"]);
// Session-verdict classifier labels this driver accepts. "session-haiku" is the only one the operator's
// 2026-09-04 ruling sanctions today (a real Haiku model call a session lane ran, not a human guess or a
// different model) — schema.json's own `const` enforces the same rule; kept as a Set (not a literal
// string check) here so a future sanctioned label is a one-line addition, not a second hand-edited spot.
const ALLOWED_CLASSIFIED_BY = Object.freeze(new Set(["session-haiku"]));

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function isIsoTimestamp(v) {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}
function isPromptVersion(v) {
  return typeof v === "string" && /^sha256:[0-9a-f]{16}$/.test(v);
}

/**
 * Validate one verdict entry against scripts/turns/ledger-verdicts/schema.json's `definitions.entry`.
 * Pure. Returns error strings prefixed with the entry's index (empty array = valid).
 * @param {object} entry
 * @param {number} i
 * @returns {string[]}
 */
export function validateVerdictEntry(entry, i) {
  const errors = [];
  const at = (msg) => errors.push(`entries[${i}]: ${msg}`);
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return [`entries[${i}]: must be an object`];
  }
  if (!isNonEmptyString(entry.candidate_id)) at("candidate_id must be a non-empty string");
  if (!isNonEmptyString(entry.url)) at("url must be a non-empty string");
  if (!VERDICT_ENTITY_VERDICTS.includes(entry.entity_verdict)) {
    at(`entity_verdict must be one of ${JSON.stringify(VERDICT_ENTITY_VERDICTS)} (got ${JSON.stringify(entry.entity_verdict)})`);
  }
  if (typeof entry.confidence !== "number" || !Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) {
    at(`confidence must be a number in [0,1] (got ${JSON.stringify(entry.confidence)})`);
  }
  if (typeof entry.rationale !== "string") at("rationale must be a string");
  if (!ALLOWED_CLASSIFIED_BY.has(entry.classified_by)) {
    at(`classified_by must be one of ${JSON.stringify([...ALLOWED_CLASSIFIED_BY])} (got ${JSON.stringify(entry.classified_by)})`);
  }
  if (!isIsoTimestamp(entry.classified_at)) at("classified_at must be a parseable ISO 8601 timestamp");
  if (!isPromptVersion(entry.prompt_version)) at(`prompt_version must match ^sha256:[0-9a-f]{16}$ (got ${JSON.stringify(entry.prompt_version)})`);

  // CONDITIONAL REQUIREMENT (schema.json's allOf): entity_verdict='specific_document' needs everything
  // buildCandidateSeed (portal-harvest.ts) needs to build a mint seed; every other verdict leaves them
  // null — the SAME null-contract first-fetch-classify.ts itself enforces (never silently defaulted).
  if (entry.entity_verdict === "specific_document") {
    if (!isNonEmptyString(entry.item_type)) at("item_type must be a non-empty string when entity_verdict='specific_document'");
    if (!(Number.isInteger(entry.domain) && entry.domain >= 1 && entry.domain <= 7)) {
      at(`domain must be an integer 1-7 when entity_verdict='specific_document' (got ${JSON.stringify(entry.domain)})`);
    }
    if (!isNonEmptyString(entry.severity)) at("severity must be a non-empty string when entity_verdict='specific_document'");
    if (!isNonEmptyString(entry.priority)) at("priority must be a non-empty string when entity_verdict='specific_document'");
    if (!isNonEmptyString(entry.urgency_tier)) at("urgency_tier must be a non-empty string when entity_verdict='specific_document'");
    if (!isNonEmptyString(entry.title_candidate)) at("title_candidate must be a non-empty string when entity_verdict='specific_document'");
  } else if (entry.item_type !== null && entry.item_type !== undefined) {
    at(`item_type must be null when entity_verdict is not 'specific_document' (got ${JSON.stringify(entry.item_type)})`);
  }
  if (entry.surface_tags !== undefined) {
    if (!Array.isArray(entry.surface_tags) || entry.surface_tags.some((t) => !VERDICT_SURFACE_TAGS.includes(t))) {
      at(`surface_tags must be an array drawn from ${JSON.stringify(VERDICT_SURFACE_TAGS)}`);
    }
  }
  if (entry.relevance !== undefined && entry.relevance !== null) {
    if (!(Number.isInteger(entry.relevance) && entry.relevance >= 0 && entry.relevance <= 100)) {
      at(`relevance must be an integer 0-100 or null (got ${JSON.stringify(entry.relevance)})`);
    }
  }
  return errors;
}

/**
 * Validate a whole verdict-file object against scripts/turns/ledger-verdicts/schema.json. Pure. Returns
 * error strings (empty = valid) — a non-empty result is FAIL-CLOSED at the caller (main() exits 4, never
 * proceeds with a partially-malformed file: a structural violation is a producer bug, not a per-entry
 * staleness this driver should quietly work around — contrast with prompt-version DRIFT, which
 * `partitionVerdictsByPromptVersion` below handles per-entry, not as a whole-file failure).
 * @param {unknown} parsed the JSON.parse'd file content
 * @returns {string[]}
 */
export function validateVerdictsFile(parsed) {
  const errors = [];
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return ["verdicts file must be a JSON object"];
  }
  if (!isNonEmptyString(parsed.batch)) errors.push("batch must be a non-empty string");
  if (!isIsoTimestamp(parsed.generated_at)) errors.push("generated_at must be a parseable ISO 8601 timestamp");
  if (!isPromptVersion(parsed.prompt_version)) errors.push(`prompt_version must match ^sha256:[0-9a-f]{16}$ (got ${JSON.stringify(parsed.prompt_version)})`);
  if (!ALLOWED_CLASSIFIED_BY.has(parsed.classified_by)) {
    errors.push(`classified_by must be one of ${JSON.stringify([...ALLOWED_CLASSIFIED_BY])} (got ${JSON.stringify(parsed.classified_by)})`);
  }
  if (!Array.isArray(parsed.entries)) {
    errors.push("entries must be an array");
    return errors; // per-entry checks below assume an array
  }
  parsed.entries.forEach((entry, i) => errors.push(...validateVerdictEntry(entry, i)));
  return errors;
}

/**
 * Split a validated verdict file's entries by whether their `prompt_version` matches the driver's own
 * live `FIRST_FETCH_CLASSIFY_PROMPT_VERSION` (imported from first-fetch-classify.ts, the ONE source for
 * both). UNLIKE a structural violation (validateVerdictsFile, whole-file fail-closed), a stale
 * prompt_version is entry-level and NON-FATAL to the rest of the file: prompt text can legitimately move
 * between when a large batch started and when this run dispatches, and a coordinator should not lose an
 * otherwise-valid 1,800-row batch over one edited line. Stale entries are excluded from use (treated as
 * "no verdict" — SKIPPED, never silently accepted as if current) and counted so the run's own artifact
 * can report exactly how many were dropped for this reason, honestly, not silently.
 * @param {object[]} entries already-validated entries (validateVerdictsFile passed)
 * @param {string} currentPromptVersion FIRST_FETCH_CLASSIFY_PROMPT_VERSION
 * @returns {{current: object[], stale: object[]}}
 */
export function partitionVerdictsByPromptVersion(entries, currentPromptVersion) {
  const current = [];
  const stale = [];
  for (const entry of entries) {
    (entry.prompt_version === currentPromptVersion ? current : stale).push(entry);
  }
  return { current, stale };
}

/**
 * Index verdict entries by URL — the field the `classify` injection point actually receives
 * (ConsumeOpts.classify's `input.source_url`; the ledger row's own id never reaches it — see
 * portal-harvest.ts's ConsumeOpts docs). LAST entry for a given URL wins on a duplicate (a session lane
 * re-classifying is assumed to be a correction, not corruption) — pure, no throw.
 * @param {object[]} entries
 * @returns {Map<string, object>}
 */
export function indexVerdictsByUrl(entries) {
  const byUrl = new Map();
  for (const entry of entries) byUrl.set(entry.url, entry);
  return byUrl;
}

/**
 * Map one validated verdict entry to a FirstFetchClassifyOutput-shaped object — the SAME shape
 * buildCandidateSeed (portal-harvest.ts) consumes from a live classify() call, so a verdict-driven
 * candidate flows through the identical entity-gate / seed-building path as an API-classified one. PURE.
 * Fields entity_verdict != 'specific_document' leaves null on the entry (validateVerdictEntry enforces
 * this) pass through as null here too — the same never-silently-defaulted contract first-fetch-classify.ts
 * itself carries.
 * @param {object} entry a validated verdict entry
 * @returns {object} FirstFetchClassifyOutput-shaped
 */
export function verdictEntryToClassifyOutput(entry) {
  const isDoc = entry.entity_verdict === "specific_document";
  return {
    entity_verdict: entry.entity_verdict,
    item_type: isDoc ? entry.item_type : null,
    domain: isDoc ? entry.domain : null,
    surface_tags: Array.isArray(entry.surface_tags) ? entry.surface_tags : [],
    relevance: entry.relevance ?? null,
    severity: isDoc ? entry.severity : "MONITORING",
    priority: isDoc ? entry.priority : "MODERATE",
    urgency_tier: isDoc ? entry.urgency_tier : "stable",
    topic_tags: Array.isArray(entry.topic_tags) ? entry.topic_tags : [],
    jurisdictions: Array.isArray(entry.jurisdictions) ? entry.jurisdictions : [],
    title_candidate: isDoc ? entry.title_candidate : entry.url,
    summary: entry.summary ?? "",
    rationale: entry.rationale,
    cost_usd_estimated: 0,
    render_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
  };
}

/**
 * Compose the driver's actual `classify` injection point: a verdict hit is used for $0 (classify
 * bypassed entirely — the base classify function below is never called for it); a miss with
 * `allowApi: false` (the default) is SKIPPED with a named, greppable reason and NEVER reaches the base
 * classify function either; a miss with `allowApi: true` (an explicit CLI-only escape hatch —
 * ledger-consume.yml never sets it) falls through to `baseClassify` (normally
 * collectClassifyTelemetry-wrapped `firstFetchClassify`) for a real, metered call. Every branch records
 * into the SAME `telemetry` Map `baseClassify`'s own wrapper (collectClassifyTelemetry) already writes
 * to, tagged with `source` ("session-verdict" | "skipped-no-verdict" | whatever baseClassify itself
 * tagged, "api" for the live wrapper) — one telemetry map, one shaping pass (shapeConsumeResult), no
 * second bookkeeping structure to keep in sync.
 * @param {{verdictsByUrl: Map<string,object>, allowApi: boolean, baseClassify: Function, telemetry: Map}} opts
 * @returns {Function} a ConsumeOpts.classify-shaped function
 */
export function buildVerdictClassify({ verdictsByUrl, allowApi, baseClassify, telemetry }) {
  return async function classifyWithVerdicts(input, apiKey) {
    const verdict = verdictsByUrl.get(input.source_url);
    if (verdict) {
      telemetry.set(input.source_url, {
        sourceId: input.source_id ?? null,
        costUsd: 0,
        renderMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        ok: true,
        error: null,
        source: "session-verdict",
        verdictCandidateId: verdict.candidate_id ?? null,
        confidence: typeof verdict.confidence === "number" ? verdict.confidence : null,
      });
      return { ok: true, result: verdictEntryToClassifyOutput(verdict) };
    }
    if (!allowApi) {
      const reason =
        "no session verdict for this URL (--verdicts) and --allow-api not set (defaults false) — " +
        "never sent to the API";
      telemetry.set(input.source_url, {
        sourceId: input.source_id ?? null,
        costUsd: 0,
        renderMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        ok: false,
        error: reason,
        source: "skipped-no-verdict",
      });
      // portal-harvest.ts treats {ok:false} as INCONCLUSIVE (fetchOk discipline) — the row stays
      // 'candidate', untouched, exactly the "SKIPPED with a named outcome" contract asks for. Prefixed so
      // this driver's own artifact reason text is greppably distinct from a real API failure.
      return { ok: false, error: `skipped-no-verdict: ${reason}` };
    }
    return baseClassify(input, apiKey);
  };
}

// ── shaping — ConsumeResult -> CONVENTION.md's per_item / metrics ──────────────────────────────────────

// Disposition -> "counts as promoted/rejected" mapping. Mutually exclusive by construction
// (portal-harvest.ts assigns exactly one CandidateDisposition per outcome), so a plan run's `would_mint`/
// `would_reject` and an apply run's `promoted`/`rejected` are counted under the SAME metric keys without
// double-counting — the same "same shape, different verb" idea run-source-sweep.mjs's shapeRunOutput
// applies to its own `upserted` metric (see that file's header comment on `verb`).
export const PROMOTED_LIKE_DISPOSITIONS = Object.freeze(["promoted", "exists", "would_mint"]);
export const REJECTED_LIKE_DISPOSITIONS = Object.freeze(["rejected", "would_reject", "not_an_item"]);

/**
 * Build this run's per_item / metrics from a ConsumeResult plus the classify telemetry side-channel.
 * PURE (no I/O) so the shaping is independently testable.
 *
 * source_id CAVEAT (honest gap, not fixed here — CandidateOutcome, portal-harvest.ts, does not carry the
 * ledger row's source_id): an outcome whose candidate reached classify gets its source_id from the
 * telemetry map (real, recorded at the classify call); an outcome that never reached classify (fetch
 * failed, or fetched text was under the 200-char floor) has NO source_id available from anything this
 * driver sees, so it falls back to `sourceIdFilter` (the run's own `--source-id`, when the run was
 * scoped to one source) or `null` when the run spanned multiple sources. This is recorded here rather
 * than solved by re-querying the ledger, which would duplicate `consumePortalCandidates`'s own read and
 * risk reading a different row set than the one it actually processed (REUSE-ONLY discipline — see
 * run-source-sweep.mjs's header on why a walker's own query is mirrored, never independently re-derived).
 * @param {object} result ConsumeResult
 * @param {Map<string, {sourceId: string|null, costUsd: number, renderMs: number|null, inputTokens: number, outputTokens: number, ok: boolean, error: string|null, source?: string, verdictCandidateId?: string|null, confidence?: number|null}>} telemetryByUrl
 * @param {{sourceIdFilter?: string|null}} [opts]
 */
export function shapeConsumeResult(result, telemetryByUrl, opts = {}) {
  const sourceIdFilter = opts.sourceIdFilter ?? null;

  const perItem = result.outcomes.map((o) => {
    const t = telemetryByUrl.get(o.url);
    const item = {
      id: o.ledgerId,
      candidate_id: o.ledgerId,
      source_id: t?.sourceId ?? sourceIdFilter,
      url: o.url,
      outcome: o.disposition,
      reason: o.reason,
      est_usd: t ? Number(t.costUsd.toFixed(6)) : 0,
      input_tokens: t?.inputTokens ?? 0,
      output_tokens: t?.outputTokens ?? 0,
      evidence_refs: [o.url],
      error: t && !t.ok ? t.error : null,
      // classify_source names WHERE this outcome's classification came from — "session-verdict" ($0, the
      // operator-ruled default), "skipped-no-verdict" (never sent to the API), "api" (a real metered
      // Haiku call, --allow-api only), or "none" (the row never reached classify at all — fetch failed or
      // sub-200ch, portal-harvest.ts's own fetchOk floor). See buildVerdictClassify's own doc for the
      // three sources a telemetry entry can carry.
      classify_source: t?.source ?? "none",
    };
    // candidate_id CROSS-CHECK (honest, not silently discarded — schema.json's own note on this field):
    // the verdict entry's OWN candidate_id vs. the ledger row this outcome actually resolved to. The
    // match itself is by URL (the only key the classify() injection point receives — see
    // buildVerdictClassify), so a stale/misordered verdict batch is a real, if rare, possibility this
    // flags rather than assumes away.
    if (t?.source === "session-verdict") {
      item.confidence = typeof t.confidence === "number" ? t.confidence : null;
      if (t.verdictCandidateId && t.verdictCandidateId !== o.ledgerId) {
        item.verdict_candidate_id_mismatch = true;
      }
    }
    return item;
  });

  let estUsdTotal = 0;
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let withVerdict = 0;
  let withoutVerdictSkipped = 0;
  for (const t of telemetryByUrl.values()) {
    estUsdTotal += t.costUsd;
    inputTokensTotal += t.inputTokens ?? 0;
    outputTokensTotal += t.outputTokens ?? 0;
    if (t.source === "session-verdict") withVerdict += 1;
    else if (t.source === "skipped-no-verdict") withoutVerdictSkipped += 1;
  }
  // "uncertain" — entity_verdict='uncertain' outcomes, matched off portal-harvest.ts's own
  // `entity-gate: ${cls.entity_verdict} — ...` reason text (the only place entity_verdict itself survives
  // into a CandidateOutcome — see that file's not_an_item branch). Distinct from "portal" (also
  // not_an_item, but a real classification, not a genuine "couldn't tell").
  const uncertainCount = result.outcomes.filter((o) => /^entity-gate: uncertain\b/.test(o.reason ?? "")).length;

  const metrics = {
    mode: result.mode,
    // "candidates" is CONVENTION.md/F28's own metrics contract naming (build brief item 5) for what this
    // family has always called "discovered" — kept as BOTH keys (discovered stays for back-compat with
    // every already-shipped reader of this shape) rather than a rename that would silently break one.
    candidates: result.discovered,
    discovered: result.discovered,
    fetched: result.fetched,
    classified: result.classified,
    with_verdict: withVerdict,
    without_verdict_skipped: withoutVerdictSkipped,
    uncertain: uncertainCount,
    promoted: result.outcomes.filter((o) => PROMOTED_LIKE_DISPOSITIONS.includes(o.disposition)).length,
    rejected: result.outcomes.filter((o) => REJECTED_LIKE_DISPOSITIONS.includes(o.disposition)).length,
    skipped: result.outcomes.filter((o) => o.disposition === "skipped").length,
    // est_usd — build brief item 5's naming; est_usd_total kept alongside it for the same back-compat
    // reason as candidates/discovered above. Both are the SAME number: $0 whenever every classified
    // candidate came from a session verdict, which is the operator-ruled default posture.
    est_usd: Number(estUsdTotal.toFixed(6)),
    est_usd_total: Number(estUsdTotal.toFixed(6)),
    input_tokens_total: inputTokensTotal,
    output_tokens_total: outputTokensTotal,
    next_cursor: result.nextCursor ?? null,
  };

  return { perItem, metrics };
}

/**
 * Build this run's CONVENTION.md-shaped artifact. PURE. Mirrors run-source-sweep.mjs's / run-extraction
 * .mjs's identical `finally`-block artifact-assembly pattern — a thrown error still produces a record.
 */
export function buildRunArtifact({
  runId,
  harnessVersion,
  startedAt,
  finishedAt,
  config,
  inputsRef,
  shaped,
  resultTracePath,
  runError,
  harnessRunsDirFallback,
}) {
  const fullTraceRefs = resultTracePath ? [resultTracePath] : [harnessRunsDirFallback];

  const defectsFound = [];
  if (runError) {
    defectsFound.push({
      description: `run-ledger-consume.mjs threw during a ${config.mode} run (requested_mode=${config.requested_mode}): ${runError.message}`,
      root_cause: runError.stack ?? "",
      fix_ref: null,
    });
  }

  const proposerNotes = runError
    ? "This run threw before completing — see defects_found for the error. Re-run after fixing the root cause."
    : config.apply_disarmed
      ? "APPLY DISARMED (see config.requested_mode/apply_enabled_const): LEDGER_CONSUME_APPLY_ENABLED is " +
        "false in run-ledger-consume.mjs (ADR-023 reviewed-change gate) — this run executed with plan " +
        "semantics regardless of the --mode apply request. Nothing was written to portal_link_candidates " +
        "or the intake chokepoint; the classify calls it made ARE real spend, each metered by the spend " +
        "chokepoint itself (src/lib/llm/spend-client.ts's spendMessage/recordSpendCall — one agent_runs " +
        "row per call, written from inside first-fetch-classify.ts, not by this driver); this artifact's " +
        "per_item est_usd/input_tokens/output_tokens and metrics.est_usd_total are read back from " +
        "FirstFetchClassifyResult, not a second ledger write (see per_item est_usd / metrics.est_usd_total)."
      : "Auto-emitted by run-ledger-consume.mjs, the ledger-consume family's canonical entry point " +
        "(Lane CONSUME, 2026-09-02) — the runtime consumePortalCandidates (src/lib/intake/portal-harvest.ts) " +
        "never had. Every classify call's agent_runs telemetry is written by the spend chokepoint itself " +
        "(src/lib/llm/spend-client.ts's spendMessage/recordSpendCall, wired into first-fetch-classify.ts by " +
        "Lane SPEND) — this driver only READS BACK FirstFetchClassifyResult's cost_usd_estimated/" +
        "input_tokens/output_tokens (collectClassifyTelemetry) to shape this artifact's per_item/metrics; " +
        "it does not write agent_runs itself, so a classify call leaves exactly one telemetry row, not two. " +
        "See this file's header for the full account.";

  return {
    harness_family: "ledger-consume",
    harness_version: harnessVersion,
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    config,
    inputs_ref: inputsRef,
    per_item: shaped?.perItem ?? [],
    metrics: shaped?.metrics ?? {},
    defects_found: defectsFound,
    full_trace_refs: fullTraceRefs,
    proposer_notes: proposerNotes,
  };
}

/**
 * THE APPLY GATE, as a pure decision (see this file's header for the full rationale). Separated from
 * main() so it is unit-testable without a DB, a jiti import, or a subprocess.
 * @param {"plan"|"apply"} requestedMode
 * @param {boolean} applyEnabled the LEDGER_CONSUME_APPLY_ENABLED const
 * @returns {{effectiveMode: "plan"|"apply", applyDisarmed: boolean, message: string|null}}
 */
export function resolveApplyGate(requestedMode, applyEnabled) {
  if (requestedMode === "apply" && !applyEnabled) {
    return {
      effectiveMode: "plan",
      applyDisarmed: true,
      message:
        "run-ledger-consume: --mode apply requested but LEDGER_CONSUME_APPLY_ENABLED is false " +
        "(ADR-023 reviewed-change gate — see this file's header). APPLY DISARMED. Running with plan " +
        "semantics instead: READ-ONLY, no ledger write, no mint — but classify calls still run and still spend.",
    };
  }
  return { effectiveMode: requestedMode, applyDisarmed: false, message: null };
}

// ── --export-candidates — the READ-ONLY lister for offline classification ────────────────────────────────
//
// Hands a session lane exactly what selectCandidateLedgerPage (portal-harvest.ts) reads, in the SAME
// keyset-paginated page a consume pass would have — never a second hand-mirrored query.
//
// --with-text (Lane LEDGER-EXPORT, 2026-09-04 — see this file's header, "THE DEFECT THIS CLOSES"): fetches
// each row's URL through the SAME buildFetchDoc a consume pass uses (no second fetcher, same politeness
// gap, same 20s timeout) and carries the fetched text in the payload, so a classification lane never
// fetches for itself. Without --with-text this mode is UNCHANGED from Lane LEDGER-ZERO: no fetch, and the
// payload says so honestly (portal_link_candidates itself has no content column: migrations 162/220 only
// ever added url/anchor_text/status/disposition columns — the ledger table was never the text's home; the
// text --with-text carries here comes from a live fetch this run makes, not from the table).

/**
 * Shape one candidate's text fields from a single fetch attempt's outcome. PURE — no I/O; the actual
 * `fetchDoc` call happens in `runExportCandidates`'s I/O half, which passes its outcome in here for
 * shaping. Independently testable with a canned {ok, error?, text?, transport?} outcome — no real network.
 *
 * `maxChars` is REQUIRED, never defaulted here — the caller must thread it in from
 * `first-fetch-classify.ts`'s own exported `CONTENT_MAX_CHARS` (via jiti — see main()) so this file never
 * carries a second, independently-typed copy of that cap that could silently drift from the live one.
 *
 * THE 200-CHAR FLOOR is the SAME ONE portal-harvest.ts's consumePortalCandidates applies at its own fetch
 * step (that file, `if (text.trim().length < 200)` — see the "1 — FETCH" comment above that line): a fetch
 * that succeeded transport-wise but returned too little text to classify is INCONCLUSIVE, not a hard
 * failure. Unlike consumePortalCandidates (which just skips the row), this export STILL CARRIES the short
 * text — a session lane or a later retry may find it useful — but marks `fetch_ok: false` with a named,
 * greppable reason so a reader does not treat it as classify-ready.
 * @param {{ok: true, text: string, transport?: string|null} | {ok: false, error: string}} fetchOutcome
 * @param {{maxChars: number, now?: () => string}} opts
 * @returns {{text: string, fetched_chars: number, fetch_ok: boolean, fetch_error: string|null, fetched_at: string, transport: string|null}}
 */
export function shapeCandidateTextFields(fetchOutcome, opts) {
  if (typeof opts?.maxChars !== "number") {
    throw new Error(
      "shapeCandidateTextFields requires opts.maxChars — pass first-fetch-classify.ts's own exported " +
        "CONTENT_MAX_CHARS (via jiti), never a retyped literal."
    );
  }
  const now = opts.now ?? (() => new Date().toISOString());
  if (fetchOutcome.ok === false) {
    return {
      text: "",
      fetched_chars: 0,
      fetch_ok: false,
      fetch_error: fetchOutcome.error,
      fetched_at: now(),
      transport: null,
    };
  }
  const raw = fetchOutcome.text ?? "";
  const sliced = raw.slice(0, opts.maxChars);
  const belowFloor = raw.trim().length < 200; // SAME floor as portal-harvest.ts's fetch step — see doc above
  return {
    text: sliced,
    fetched_chars: sliced.length,
    fetch_ok: !belowFloor,
    fetch_error: belowFloor ? "below_floor_200" : null,
    fetched_at: now(),
    transport: fetchOutcome.transport ?? null,
  };
}

/**
 * Shape one export batch from a page of LedgerCandidate rows. PURE — no I/O, independently testable.
 * @param {object[]} candidates rows from selectCandidateLedgerPage
 * @param {{limit?: number, promptVersion?: string|null, now?: () => string, withText?: boolean, contentMaxChars?: number|null, textByCandidateId?: Map<string, object>}} [opts]
 */
export function buildCandidateExportPayload(candidates, opts = {}) {
  const now = opts.now ?? (() => new Date().toISOString());
  const limit = opts.limit ?? candidates.length;
  const withText = opts.withText === true;
  let fetchOkCount = 0;
  let fetchFailedCount = 0;
  const candidateRows = candidates.map((row) => {
    const base = {
      candidate_id: row.id,
      url: row.url,
      source_id: row.source_id,
      anchor_text: row.anchor_text ?? null,
      first_seen_at: row.first_seen_at,
      source_name: row.sources?.name ?? null,
      source_category: row.sources?.category ?? null,
      source_tier: row.sources?.base_tier ?? null,
    };
    if (!withText) return base;
    const t = opts.textByCandidateId?.get(row.id);
    if (!t) return base; // defensive: --with-text always populates one entry per row (see runExportCandidates)
    if (t.fetch_ok) fetchOkCount += 1;
    else fetchFailedCount += 1;
    return {
      ...base,
      text: t.text,
      fetched_chars: t.fetched_chars,
      fetch_ok: t.fetch_ok,
      fetch_error: t.fetch_error,
      fetched_at: t.fetched_at,
      transport: t.transport,
    };
  });
  return {
    generated_at: now(),
    source: "portal_link_candidates status=candidate",
    with_text: withText,
    content_max_chars: withText ? opts.contentMaxChars ?? null : null,
    note_on_fetched_text: withText
      ? "This export was produced with --with-text: each candidate below carries its already-fetched page " +
        "text (fetched by the SAME fetchDoc — buildFetchDoc's politeness gap and timeout — a consume pass " +
        "uses; no second fetcher), sliced to content_max_chars (first-fetch-classify.ts's own " +
        "CONTENT_MAX_CHARS). fetch_ok=false marks a row that failed to fetch (fetch_error names why) or " +
        "fell under portal-harvest.ts's own 200-char floor (fetch_error='below_floor_200'; its text field " +
        "is still carried — a session lane or a later retry may find it useful — but should not be treated " +
        "as classify-ready). A classification lane consuming this file must NOT fetch these URLs itself — " +
        "the fix this field exists for was Haiku classification lanes hitting fetch rate limits by doing " +
        "exactly that (see run-ledger-consume.mjs's header, \"THE DEFECT THIS CLOSES\")."
      : "This runtime does not persist first-fetch page text (portal_link_candidates carries no content " +
        "column — see migrations 162/220): re-dispatch this export with --with-text to have this run fetch " +
        "and carry the text itself (the SAME fetchDoc a consume pass uses), rather than a classification " +
        "lane fetching each URL for itself.",
    fetch_ok_count: withText ? fetchOkCount : null,
    fetch_failed_count: withText ? fetchFailedCount : null,
    prompt_version: opts.promptVersion ?? null,
    count: candidates.length,
    candidates: candidateRows,
    // Same keyset-cursor convention as ConsumeResult.nextCursor (portal-harvest.ts) — omitted when this
    // page read fewer rows than `limit` (the source is exhausted here), present otherwise so a session
    // lane can page through the full backlog across several --export-candidates calls.
    next_cursor:
      candidates.length === limit && candidates.length > 0
        ? { firstSeenAt: candidates[candidates.length - 1].first_seen_at, id: candidates[candidates.length - 1].id }
        : null,
  };
}

/**
 * The I/O half: page-select (via the injected `selectPage`, normally `selectCandidateLedgerPage` bound to
 * a live client) + write the shaped payload to `outPath`. `selectPage` is injected so this is testable
 * with a stub, no live Supabase client required — same discipline the rest of this driver's I/O seams use.
 *
 * `--with-text` (`opts.withText`): when set, fetches every selected row's URL through the injected
 * `fetchDoc` — ONE instance, called sequentially in page order, so its own politeness-gap state (the
 * closure `buildFetchDoc` returns) actually applies between consecutive fetches, exactly as it would
 * inside a consume pass. A per-row fetch failure is caught and shaped as `{ok:false, error}` — it never
 * aborts the batch; the row is still exported, `fetch_ok:false`. This function performs NO database write
 * of any kind: `selectPage` is the only DB-shaped call it makes (a read), `fetchDoc` is a plain HTTP-shaped
 * function, and the only other I/O is the local `writeFileSync` below.
 * @param {{selectPage: (opts:object)=>Promise<object[]>, limit: number, sourceId?: string|null, newestFirst?: boolean, after?: object|null, promptVersion?: string|null, outPath: string, now?: () => string, withText?: boolean, fetchDoc?: (url:string)=>Promise<{text:string,transport?:string}>, maxChars?: number}} opts
 * @returns {Promise<{path: string, count: number, payload: object}>}
 */
export async function runExportCandidates(opts) {
  const candidates = await opts.selectPage({
    limit: opts.limit,
    sourceId: opts.sourceId ?? undefined,
    newestFirst: opts.newestFirst,
    after: opts.after ?? undefined,
  });

  const withText = opts.withText === true;
  let textByCandidateId;
  if (withText) {
    if (typeof opts.fetchDoc !== "function") {
      throw new Error("runExportCandidates: opts.withText requires opts.fetchDoc (the SAME fetchDoc a consume pass uses).");
    }
    textByCandidateId = new Map();
    for (const row of candidates) {
      let fetchOutcome;
      try {
        const r = await opts.fetchDoc(row.url);
        fetchOutcome = { ok: true, text: r?.text ?? "", transport: r?.transport ?? null };
      } catch (e) {
        fetchOutcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      textByCandidateId.set(row.id, shapeCandidateTextFields(fetchOutcome, { maxChars: opts.maxChars, now: opts.now }));
    }
  }

  const payload = buildCandidateExportPayload(candidates, {
    limit: opts.limit,
    promptVersion: opts.promptVersion ?? null,
    now: opts.now,
    withText,
    contentMaxChars: withText ? opts.maxChars ?? null : null,
    textByCandidateId,
  });
  const outPath = resolve(opts.outPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return { path: outPath, count: candidates.length, payload };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  try {
    process.loadEnvFile(resolve(ROOT, ".env.local"));
  } catch {
    /* CI: env injected */
  }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`run-ledger-consume: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("run-ledger-consume: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
  const { consumePortalCandidates, selectCandidateLedgerPage } = await jiti.import("../../src/lib/intake/portal-harvest.ts");
  const { firstFetchClassify, FIRST_FETCH_CLASSIFY_PROMPT_VERSION, CONTENT_MAX_CHARS } = await jiti.import(
    "../../src/lib/llm/first-fetch-classify.ts"
  );

  // ── --export-candidates: a DISTINCT, READ-ONLY action — no classify, no DB write, no harness-run
  // artifact (this is a listing utility for offline classification, not a consume pass — see this file's
  // header). Exits here; never falls through to the consume path below. Without --with-text: no fetch
  // either, unchanged from Lane LEDGER-ZERO. WITH --with-text: fetches through the SAME buildFetchDoc a
  // consume pass uses below (no second fetcher, same politeness gap, same timeout) — see this file's
  // header, "THE DEFECT THIS CLOSES".
  if (parsed.exportCandidates) {
    const selectPage = (opts) => selectCandidateLedgerPage(sb, opts);
    const { path, count } = await runExportCandidates({
      selectPage,
      limit: parsed.limit,
      sourceId: parsed.sourceId,
      newestFirst: parsed.newestFirst,
      after: parsed.after,
      promptVersion: FIRST_FETCH_CLASSIFY_PROMPT_VERSION,
      outPath: parsed.exportCandidates,
      withText: parsed.withText,
      fetchDoc: parsed.withText ? buildFetchDoc() : undefined,
      maxChars: CONTENT_MAX_CHARS,
    });
    console.log(
      `run-ledger-consume --export-candidates${parsed.withText ? " --with-text" : ""}: wrote ${count} candidate(s) to ${path}`
    );
    process.exit(0);
  }

  // ── --verdicts (optional): load + fail-closed validate a session-verdict batch before anything else
  // runs, so a malformed file is caught immediately, not partway through a live consume pass.
  let verdictsByUrl = new Map();
  let verdictsInfo = null;
  if (parsed.verdicts) {
    let raw;
    try {
      raw = readFileSync(resolve(parsed.verdicts), "utf8");
    } catch (err) {
      console.error(`run-ledger-consume: cannot read --verdicts file "${parsed.verdicts}": ${err.message} (exit 4).`);
      process.exit(4);
    }
    let parsedVerdicts;
    try {
      parsedVerdicts = JSON.parse(raw);
    } catch (err) {
      console.error(`run-ledger-consume: --verdicts file "${parsed.verdicts}" is not valid JSON: ${err.message} (exit 4).`);
      process.exit(4);
    }
    const schemaErrors = validateVerdictsFile(parsedVerdicts);
    if (schemaErrors.length) {
      console.error(
        `run-ledger-consume: --verdicts file "${parsed.verdicts}" failed schema validation ` +
          `(scripts/turns/ledger-verdicts/schema.json) — exit 4:\n  ${schemaErrors.join("\n  ")}`
      );
      process.exit(4);
    }
    const { current, stale } = partitionVerdictsByPromptVersion(parsedVerdicts.entries, FIRST_FETCH_CLASSIFY_PROMPT_VERSION);
    if (stale.length) {
      console.log(
        `run-ledger-consume: ${stale.length}/${parsedVerdicts.entries.length} verdict(s) in "${parsed.verdicts}" ` +
          `carry a prompt_version other than the live ${FIRST_FETCH_CLASSIFY_PROMPT_VERSION} — excluded, treated ` +
          `as no-verdict for their URLs (never silently accepted as current).`
      );
    }
    verdictsByUrl = indexVerdictsByUrl(current);
    verdictsInfo = {
      path: parsed.verdicts,
      batch: parsedVerdicts.batch,
      total_entries: parsedVerdicts.entries.length,
      usable_entries: current.length,
      stale_prompt_version_entries: stale.length,
    };
  }

  // --allow-api is the ONLY path that can still spend on Haiku — see this file's header. ANTHROPIC_API_KEY
  // is required ONLY when it is set; a plan/apply dispatch with the $0 default (no --allow-api) needs no
  // key at all, closing the registration gap the audit named for the workflow's plan path.
  if (parsed.allowApi && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "run-ledger-consume: --allow-api requested but no ANTHROPIC_API_KEY — the real Haiku path cannot " +
        "run without it (exit 3). Omit --allow-api to use the $0 session-verdict/skip default."
    );
    process.exit(3);
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";

  const requestedMode = parsed.mode;
  const { effectiveMode, applyDisarmed, message: applyGateMessage } = resolveApplyGate(
    requestedMode,
    LEDGER_CONSUME_APPLY_ENABLED
  );
  if (applyGateMessage) console.log(applyGateMessage);
  if (effectiveMode === "apply" && !parsed.verdicts && !parsed.allowApi) {
    console.log(
      "run-ledger-consume: apply requested with no --verdicts and no --allow-api — every candidate this " +
        "run touches will be SKIPPED (no classification source), so this apply will mint nothing. Not an " +
        "error: an honest no-op, recorded as such in this run's own artifact."
    );
  }

  const harnessRunsDir = resolve(parsed.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  const traceDir = resolve(parsed.traceDir || defaultTraceDir(harnessRunsDir));

  const fetchDoc = buildFetchDoc();
  const { classify: apiClassify, telemetry } = collectClassifyTelemetry(firstFetchClassify);
  const classify = buildVerdictClassify({
    verdictsByUrl,
    allowApi: parsed.allowApi,
    baseClassify: apiClassify,
    telemetry,
  });

  const config = {
    requested_mode: requestedMode,
    mode: effectiveMode,
    apply_disarmed: applyDisarmed,
    apply_enabled_const: LEDGER_CONSUME_APPLY_ENABLED,
    limit: parsed.limit,
    source_id: parsed.sourceId,
    newest_first: parsed.newestFirst,
    after: parsed.after,
    fetch_gap_ms: Number(process.env.LEDGER_CONSUME_FETCH_GAP_MS ?? 1000),
    verdicts_file: verdictsInfo,
    allow_api: parsed.allowApi,
    prompt_version: FIRST_FETCH_CLASSIFY_PROMPT_VERSION,
  };
  const inputsRef = [
    "portal_link_candidates: status=candidate" +
      (parsed.sourceId ? ` source_id=${parsed.sourceId}` : "") +
      ` limit=${parsed.limit} order=${parsed.newestFirst ? "desc" : "asc"}(first_seen_at,id)` +
      (parsed.after ? ` after=${JSON.stringify(parsed.after)}` : ""),
    parsed.verdicts
      ? `session-verdicts: ${parsed.verdicts} (batch=${verdictsInfo.batch}, usable=${verdictsInfo.usable_entries}/${verdictsInfo.total_entries})`
      : "session-verdicts: none — every candidate without --allow-api is skipped, never sent to the API",
  ];

  let runId = null;
  let result = null;
  let runError = null;
  let resultTracePath = null;
  // Stamped BEFORE the run, not inside `finally` — same discipline run-source-sweep.mjs's header
  // documents (source-sweep-run-001's own started_at bug), applied here from the start.
  const startedAt = new Date().toISOString();

  try {
    runId = claimRunId(harnessRunsDir, "ledger-consume");

    result = await consumePortalCandidates(sb, {
      mode: effectiveMode,
      limit: parsed.limit,
      sourceId: parsed.sourceId ?? undefined,
      newestFirst: parsed.newestFirst,
      after: parsed.after ?? undefined,
      fetchDoc,
      classify,
      anthropicKey,
      caller: "ledger-consume-turn",
    });

    mkdirSync(traceDir, { recursive: true });
    resultTracePath = join(traceDir, `${runId}.result.json`);
    writeFileSync(resultTracePath, JSON.stringify(result, null, 2) + "\n", "utf8");
    console.log(`Wrote ${resultTracePath}`);
    console.log(
      `${effectiveMode === "plan" ? "[plan] " : ""}discovered=${result.discovered} fetched=${result.fetched} ` +
        `classified=${result.classified} outcomes=${result.outcomes.length} next_cursor=${JSON.stringify(result.nextCursor ?? null)}`
    );
  } catch (err) {
    runError = err;
  } finally {
    if (runId) {
      const harnessVersion = hashHarnessVersion(LEDGER_CONSUME_GOVERNING_FILES, FSI_ROOT);
      const shaped = result ? shapeConsumeResult(result, telemetry, { sourceIdFilter: parsed.sourceId }) : null;
      const artifact = buildRunArtifact({
        runId,
        harnessVersion,
        startedAt,
        finishedAt: new Date().toISOString(),
        config,
        inputsRef,
        shaped,
        resultTracePath,
        runError,
        harnessRunsDirFallback: harnessRunsDir,
      });
      const artifactPath = writeRunArtifact(harnessRunsDir, artifact);
      console.log(`Wrote ${artifactPath}`);
    }
  }

  if (runError) {
    console.error(`run-ledger-consume: FAILED — ${runError.message}`);
    process.exit(1);
  }
  process.exit(0);
}
