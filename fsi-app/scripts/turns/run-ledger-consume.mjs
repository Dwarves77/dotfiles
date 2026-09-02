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
// `portal-harvest.ts` and `first-fetch-classify.ts` in this lane (no network, no DB) and by
// `run-ledger-consume.test.mjs`'s own jiti-load test, which proves the same thing as a standing red/green
// assertion rather than a one-off probe.
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
// without one"). It is LEFT FALSE by this lane, per the coordinator's build-mode instruction: apply mode
// needs a reviewed decision this lane does not make for itself. `--mode apply` while the const is false
// is not silently downgraded — see `runApplyGate` below: it prints a named "apply DISARMED" line, records
// `apply_disarmed: true` + `requested_mode: "apply"` + `mode: "plan"` in the artifact's `config`, and
// actually RUNS as plan (still spends on classify, still writes an honest artifact) rather than either
// pretending apply ran or refusing to do anything useful with the dispatch.
//
// TELEMETRY (operator ruling 2026-07-06: "every classify call must leave an agent_runs row"). VERIFIED,
// this lane, 2026-09-02: `firstFetchClassify` (src/lib/llm/first-fetch-classify.ts) makes its OWN raw
// `fetch()` call straight to `https://api.anthropic.com/v1/messages` — it imports neither
// `src/lib/llm/spend-client.ts` nor `spend-guard.mjs` (grep confirms: no `SpendTicket`, no
// `spendStream`/`spendSearch`, no `agent_runs` write anywhere in that file). `consumePortalCandidates`
// itself (`src/lib/intake/portal-harvest.ts`) does not write `agent_runs` either — grepped, confirmed
// absent. `first-fetch-classify` IS a Rule-016 sanctioned standing ticket class
// (`STANDING_TICKET_CLASSES` in spend-guard.mjs names it), but nothing in the current call graph ever
// constructs a ticket for it — the class is registered, not wired. `logSpendRun` (spend-client.ts) looks
// like the sanctioned write-site by name, but its own header says it was RETIRED 2026-07-06 to a no-op
// that only drains the per-item ledger — the real per-call write moved into `recordSpendCall` (module-
// private, not exported) inside the SAME file. So THIS driver wires the `classify` injection point
// `ConsumeOpts` already provides (`buildLoggingClassify` below): every classify call is wrapped, and the
// wrapper writes ONE `agent_runs` row per call directly through the guarded Supabase client, in the SAME
// column shape `recordSpendCall` uses (`intelligence_item_id`, `source_id`, `source_url`, `fetch_method`,
// `model`, `started_at`, `ended_at`, `status`, `cost_usd_estimated`, `errors[].telemetry`) — mirrored, not
// imported, because `recordSpendCall` is not exported (the same "mirror an internal contract rather than
// reach into it" call `run-source-sweep.mjs`'s header makes for `persistPortalCandidates`). This closes
// the ledger for THIS classify path; it does NOT retrofit `firstFetchClassify` itself onto the spend
// chokepoint (`spend-client.ts` is out of this lane's write set) — see this file's own defect note in the
// lane's final report.
//
// TOKEN COUNTS — A NAMED LIMIT, NOT A GAP THIS DRIVER CAN CLOSE. `FirstFetchClassifyOutput`
// (first-fetch-classify.ts) exposes `cost_usd_estimated` and `render_ms` but NOT `input_tokens` /
// `output_tokens` — the function computes them internally (`estimateCostUsd`) and never returns them.
// `recordSpendCall`'s own row shape records raw token counts because IT has access to the Anthropic
// response's `usage` block directly; this driver only ever sees `FirstFetchClassifyResult`, which does
// not carry that block. So the `agent_runs` rows this driver writes carry `cost_usd_estimated` (real,
// per-call) and `render_ms`, but NOT `inputTokens`/`outputTokens` — honestly absent, not defaulted to 0
// or omitted silently (the telemetry object's shape makes this explicit; see `buildLoggingClassify`).
//
// Usage:
//   node scripts/turns/run-ledger-consume.mjs --mode plan [--limit 50] [--source-id <uuid>]
//     [--newest-first] [--after '{"firstSeenAt":"...","id":"..."}'] [--harness-runs-dir dir] [--trace-dir dir]
//   node scripts/turns/run-ledger-consume.mjs --mode apply ...   # apply is DISARMED — see header above;
//                                                                  # runs as plan, records why.
// Exit 0 done (including "apply disarmed, ran as plan") · 1 bad args · 2 no DB creds · 3 no ANTHROPIC_API_KEY.

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../lib/run-artifact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const ROOT = FSI_ROOT;
const DEFAULT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "ledger-consume");

// This family's governing files — the driver plus the two library modules it gives a production runtime
// to for the first time. Mirrors CONVENTION.md's harness_version table + F28's
// GOVERNING_FILES.'ledger-consume' (kept in sync by hand, same discipline every other family's list
// already carries — see CONVENTION-TABLE-PARITY-style cross-checks in the sibling families' own tests).
export const LEDGER_CONSUME_GOVERNING_FILES = Object.freeze([
  "scripts/turns/run-ledger-consume.mjs",
  "src/lib/intake/portal-harvest.ts",
  "src/lib/llm/first-fetch-classify.ts",
]);

// THE APPLY GATE (see header). Left FALSE by this lane — ADR-023's reviewed-change gate, applied to a
// consumer. Flip it in a reviewed diff when an operator arms apply for this family.
export const LEDGER_CONSUME_APPLY_ENABLED = false;

const MODES = Object.freeze(["plan", "apply"]);

function usage() {
  return (
    "Usage: node scripts/turns/run-ledger-consume.mjs [--mode plan|apply] [--limit N] [--source-id uuid]\n" +
    "         [--newest-first] [--after '{\"firstSeenAt\":\"...\",\"id\":\"...\"}']\n" +
    "         [--harness-runs-dir dir] [--trace-dir dir]"
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
// Injectable (fetchImpl/now/sleep) so the politeness gap is testable deterministically without real
// network or real timers — the same discipline run-source-sweep.mjs's inline politeFetch has, made
// exportable here because this driver's own tests need to prove the gap fires without a live clock.
export function buildFetchDoc({
  gapMs = Number(process.env.LEDGER_CONSUME_FETCH_GAP_MS ?? 1000),
  timeoutMs = 20_000,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
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
      const text = await res.text();
      return { text, transport: "direct-fetch" };
    } finally {
      clearTimeout(timer);
    }
  };
}

// ── classify telemetry wrapper — the agent_runs write-site this family needed and didn't have ─────────
//
// The Haiku model id first-fetch-classify.ts's HAIKU_MODEL constant. NOT exported publicly by that
// module (only through its `__test` surface) — duplicated here rather than reaching into a test-only
// export, the same "mirror an internal contract, don't reach into internals" call run-source-sweep.mjs's
// header makes for persistPortalCandidates. If first-fetch-classify.ts's model changes, this constant
// and CONTENT does NOT drive the actual call (the real call is inside firstFetchClassify itself); this
// is a TELEMETRY LABEL only — a drift here mislabels the agent_runs row's `model` column, it never
// changes what model is actually billed.
const HAIKU_MODEL_FOR_TELEMETRY = "claude-haiku-4-5-20251001";

/**
 * Wrap `baseClassify` (first-fetch-classify.ts's `firstFetchClassify`, or a test double of the same
 * shape) so every call leaves ONE `agent_runs` row — the missing telemetry this family's classify calls
 * had (see this file's header). Returns `{ classify, telemetry }`:
 *   - `classify` has the exact `ConsumeOpts.classify` shape ((input, apiKey) => FirstFetchClassifyResult)
 *     and is what the driver passes into `consumePortalCandidates`.
 *   - `telemetry` is a `Map<sourceUrl, {sourceId, costUsd, renderMs, ok, error}>` accumulated as calls
 *     happen — read back AFTER the run to shape the artifact's per_item `est_usd` (portal-harvest.ts's
 *     `CandidateOutcome` does not itself carry a cost, so this is the side-channel that supplies it; see
 *     `shapeConsumeResult`'s own doc for the source_id-availability caveat this implies).
 *
 * NEVER throws on a telemetry-write failure (mirrors `recordSpendCall`'s own non-fatal posture: a paid
 * call already happened by the time the write is attempted, so a DB hiccup writing the ledger must not
 * also fail the classify call itself) — it warns instead, same as `recordSpendCall`.
 * @param {import("@supabase/supabase-js").SupabaseClient} sb
 * @param {Function} baseClassify
 * @param {{now?: () => string, warn?: (msg: string) => void}} [deps]
 */
export function buildLoggingClassify(sb, baseClassify, deps = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const warn = deps.warn ?? console.warn;
  const telemetry = new Map();

  async function loggingFirstFetchClassify(input, apiKey) {
    const startedAt = now();
    const res = await baseClassify(input, apiKey);
    const finishedAt = now();
    const ok = res != null && res.ok === true;
    const costUsd = ok && typeof res.result.cost_usd_estimated === "number" ? res.result.cost_usd_estimated : 0;
    const renderMs = ok && typeof res.result.render_ms === "number" ? res.result.render_ms : null;
    const error = ok ? null : res?.error ?? "classify returned no result";

    telemetry.set(input.source_url, { sourceId: input.source_id ?? null, costUsd, renderMs, ok, error });

    try {
      const { error: dbError } = await sb.from("agent_runs").insert({
        intelligence_item_id: null,
        source_id: input.source_id ?? null,
        source_url: input.source_url ?? null,
        fetch_method: "ledger-consume-classify",
        model: HAIKU_MODEL_FOR_TELEMETRY,
        started_at: startedAt,
        ended_at: finishedAt,
        status: ok ? "success" : "error",
        cost_usd_estimated: Number(costUsd.toFixed(6)),
        errors: [
          {
            telemetry: {
              model: HAIKU_MODEL_FOR_TELEMETRY,
              purpose: "first-fetch-classify",
              render_ms: renderMs,
              error,
              // NOTE: no inputTokens/outputTokens — FirstFetchClassifyResult does not expose them; see
              // this file's header ("TOKEN COUNTS — A NAMED LIMIT").
            },
          },
        ],
      });
      if (dbError) {
        warn(`[ledger-consume] agent_runs telemetry write FAILED for ${input.source_url}: ${dbError.message}`);
      }
    } catch (e) {
      warn(`[ledger-consume] agent_runs telemetry write THREW for ${input.source_url}: ${e instanceof Error ? e.message : String(e)}`);
    }

    return res;
  }

  return { classify: loggingFirstFetchClassify, telemetry };
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
 * @param {Map<string, {sourceId: string|null, costUsd: number, renderMs: number|null, ok: boolean, error: string|null}>} telemetryByUrl
 * @param {{sourceIdFilter?: string|null}} [opts]
 */
export function shapeConsumeResult(result, telemetryByUrl, opts = {}) {
  const sourceIdFilter = opts.sourceIdFilter ?? null;

  const perItem = result.outcomes.map((o) => {
    const t = telemetryByUrl.get(o.url);
    return {
      id: o.ledgerId,
      candidate_id: o.ledgerId,
      source_id: t?.sourceId ?? sourceIdFilter,
      url: o.url,
      outcome: o.disposition,
      reason: o.reason,
      est_usd: t ? Number(t.costUsd.toFixed(6)) : 0,
      evidence_refs: [o.url],
      error: t && !t.ok ? t.error : null,
    };
  });

  let estUsdTotal = 0;
  for (const t of telemetryByUrl.values()) estUsdTotal += t.costUsd;

  const metrics = {
    mode: result.mode,
    discovered: result.discovered,
    fetched: result.fetched,
    classified: result.classified,
    promoted: result.outcomes.filter((o) => PROMOTED_LIKE_DISPOSITIONS.includes(o.disposition)).length,
    rejected: result.outcomes.filter((o) => REJECTED_LIKE_DISPOSITIONS.includes(o.disposition)).length,
    skipped: result.outcomes.filter((o) => o.disposition === "skipped").length,
    est_usd_total: Number(estUsdTotal.toFixed(6)),
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
        "or the intake chokepoint; the classify calls it made ARE real spend, each with its own " +
        "agent_runs telemetry row (see per_item est_usd / metrics.est_usd_total)."
      : "Auto-emitted by run-ledger-consume.mjs, the ledger-consume family's canonical entry point " +
        "(Lane CONSUME, 2026-09-02) — the runtime consumePortalCandidates (src/lib/intake/portal-harvest.ts) " +
        "never had. Every classify call in this run left its own agent_runs row (buildLoggingClassify) — " +
        "the sanctioned write-site (recordSpendCall, spend-client.ts) is module-private, so this driver " +
        "mirrors its column shape rather than importing it; see this file's header for the full account, " +
        "including the known limit that FirstFetchClassifyResult does not expose per-call token counts.";

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
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error(
      "run-ledger-consume: no ANTHROPIC_API_KEY — plan mode is READ-ONLY but STILL calls Haiku classify " +
        "(~$0.001/candidate; see this file's header) and cannot run without it (exit 3)."
    );
    process.exit(3);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
  const { consumePortalCandidates } = await jiti.import("../../src/lib/intake/portal-harvest.ts");
  const { firstFetchClassify } = await jiti.import("../../src/lib/llm/first-fetch-classify.ts");

  const requestedMode = parsed.mode;
  const { effectiveMode, applyDisarmed, message: applyGateMessage } = resolveApplyGate(
    requestedMode,
    LEDGER_CONSUME_APPLY_ENABLED
  );
  if (applyGateMessage) console.log(applyGateMessage);

  const harnessRunsDir = resolve(parsed.harnessRunsDir || DEFAULT_HARNESS_RUNS_DIR);
  const traceDir = resolve(parsed.traceDir || defaultTraceDir(harnessRunsDir));

  const fetchDoc = buildFetchDoc();
  const { classify, telemetry } = buildLoggingClassify(sb, firstFetchClassify);

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
  };
  const inputsRef = [
    "portal_link_candidates: status=candidate" +
      (parsed.sourceId ? ` source_id=${parsed.sourceId}` : "") +
      ` limit=${parsed.limit} order=${parsed.newestFirst ? "desc" : "asc"}(first_seen_at,id)` +
      (parsed.after ? ` after=${JSON.stringify(parsed.after)}` : ""),
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
