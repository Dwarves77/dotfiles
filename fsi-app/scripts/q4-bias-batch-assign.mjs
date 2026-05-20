// Q4 bias-tag batch assignment for existing sources.
//
// Per the Q4 decision in
// `docs/sprint-2/source-credibility-model-decisions-2026-05-19.md` and the
// canonical model in
// `fsi-app/.claude/skills/source-credibility-model/SKILL.md` Section 6:
//
//   - confidence >= 0.80 -> assignment_source = 'haiku_auto_high_confidence'
//   - 0.65 <= confidence < 0.80 -> assignment_source = 'haiku_proposed_low_confidence'
//   - confidence < 0.65 -> discard (operator decision; the platform does NOT
//     accumulate sub-threshold proposals; the bias signal is not strong
//     enough to merit either auto-application or operator-attention)
//
// Idempotency contract:
//
//   - Skip a source entirely when ANY existing row in source_bias_tags has
//     assignment_source IN ('operator_confirmed', 'operator_set'). Operator
//     judgment supersedes batch classifier output.
//   - Sources that already carry only haiku_* rows get re-run; re-runs
//     ON CONFLICT DO NOTHING per the (source_id, dimension, tag) UNIQUE
//     constraint, so re-runs are safe and incremental.
//
// Usage:
//
//   node scripts/q4-bias-batch-assign.mjs --sample
//     20-source sample (default). Reports per-source assignments + tag
//     distribution + confidence distribution + estimated full-batch cost.
//     Does NOT touch sources already carrying operator_* tags.
//
//   node scripts/q4-bias-batch-assign.mjs --full
//     Full ~794-source batch. NOT to be run without explicit operator
//     authorization (cost concern: ~794 Haiku calls). The sample run prints
//     the projected total cost so the operator can decide.
//
//   node scripts/q4-bias-batch-assign.mjs --dry-run
//     Sample run that prints what would happen but writes NOTHING to the DB.
//
//   node scripts/q4-bias-batch-assign.mjs --limit <n>
//     Bounded slice of the eligible source list (deterministic ORDER BY id).
//     Useful for smoke-testing patch changes without committing to a full
//     batch run. Behaves like sample mode (printing projection) at the
//     requested slice size.
//
// Rate limiting: 1.2 seconds between Haiku calls (well under the 50 RPM
// Anthropic default for Tier 1, generous under higher tiers). Tunable via
// --interval-ms <number>.
//
// Resilience (added 2026-05-20 in feat/q4-batch-resilience; see OBS-51):
//
//   - Anthropic SDK calls retry on transient errors (Request timed out,
//     network/connection errors, 5xx HTTP status) with exponential backoff
//     1s / 2s / 4s, max 3 retries per source. After exhaustion the per-source
//     try/catch logs the failure and the batch CONTINUES to the next source.
//   - The pg layer uses pg.Pool rather than a single pg.Client, plus a
//     withDbRetry() wrapper that detects 'Connection terminated', ECONNRESET,
//     and pg client error events. The pool reconnects transparently; the
//     wrapper retries the failed query up to 3 times. After exhaustion the
//     per-source try/catch logs and continues.
//   - Per-source error isolation: ONE source's classification or write
//     failure NEVER crashes the whole batch (summary.failed counts the
//     skip; the next source proceeds normally).
//   - Idempotency preserved: re-running the script after a partial batch
//     skips sources that already carry haiku_* or operator_* rows per the
//     existing UNIQUE (source_id, dimension, tag) constraint + ON CONFLICT
//     DO NOTHING write path. The classification semantics, threshold buckets,
//     and tag vocabulary are unchanged.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import Anthropic from "@anthropic-ai/sdk";
import {
  isAnthropicRetryable,
  isPgRetryable,
} from "./lib/batch-primitives.mjs";

// -----------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------

const SAMPLE_SIZE = 20;

// Per-dimension auto-confidence thresholds (D1 Option B, 2026-05-20).
// methodology stays at 0.80 (tags like methodologically-transparent vs
// analytical-synthesis require methodology examination; operator-in-loop
// is appropriate). funding + stakeholder bump to 0.75 (usually clearer
// from institutional context; classifier was unnecessarily conservative
// per D1 investigation showing 84% of methodology rows in review queue
// vs ~26% for funding).
const HIGH_CONFIDENCE_THRESHOLDS = {
  funding: 0.75,
  methodology: 0.80,
  stakeholder: 0.75,
};
const REVIEW_QUEUE_THRESHOLD = 0.65;

function autoThresholdFor(dimension) {
  return HIGH_CONFIDENCE_THRESHOLDS[dimension] ?? 0.80;
}

const DEFAULT_INTERVAL_MS = 1200;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// Per Anthropic public pricing (claude-haiku-4-5): $1 / MTok input,
// $5 / MTok output (2026 pricing band; verify before billing the operator).
// Per-call token math derived from production-shape calls:
//   - input: ~1200 tokens (system + user message)
//   - output: ~800 tokens (full bias_tags object + classification fields)
// Per-call cost: (1200/1e6)*$1 + (800/1e6)*$5 = $0.0012 + $0.0040 = $0.0052
const PRICING = {
  input_per_mtok: 1.0,
  output_per_mtok: 5.0,
  est_input_tokens: 1200,
  est_output_tokens: 800,
};

const BIAS_TAG_VOCAB = {
  funding: [
    "industry-funded",
    "government-funded",
    "foundation-funded",
    "subscription-supported",
    "academic-institutional",
    "mixed-funded",
    "funding-opaque",
  ],
  methodology: [
    "peer-reviewed",
    "methodologically-transparent",
    "analytical-synthesis",
    "editorial-opinion",
    "advocacy",
    "factual-reporting",
    "standards-defining",
  ],
  stakeholder: [
    "industry-incumbent",
    "industry-challenger",
    "regulator-aligned",
    "environmental-advocate",
    "independent-research",
    "customer-perspective",
    "labor-perspective",
    "investor-perspective",
  ],
};

const SYSTEM_PROMPT = `You assign bias tags to existing sources in a freight sustainability intelligence platform. Your output is a single JSON object with one key, bias_tags. No prose, no markdown, no code fences.

bias_tags is an object with three keys: funding, methodology, stakeholder. Each maps to an array of {tag, confidence} pairs where tag is from the per-dimension vocabulary below and confidence is a number 0.00-1.00 reflecting how sure you are this tag applies. Emit zero or more tags per dimension; multi-value is expected (most sources carry multiple tags within at least one dimension). The three dimensions are orthogonal.

Dimension 1 — funding (Funding / Institutional Affiliation):
  industry-funded | government-funded | foundation-funded | subscription-supported | academic-institutional | mixed-funded | funding-opaque

Dimension 2 — methodology (Methodological Orientation):
  peer-reviewed | methodologically-transparent | analytical-synthesis | editorial-opinion | advocacy | factual-reporting | standards-defining

Dimension 3 — stakeholder (Stakeholder Position):
  industry-incumbent | industry-challenger | regulator-aligned | environmental-advocate | independent-research | customer-perspective | labor-perspective | investor-perspective

Confidence guidance: use >=0.80 when the source's bias is unambiguous from its institutional identity (e.g. ICCT is unambiguously foundation-funded and independent-research; EUR-Lex is unambiguously government-funded and regulator-aligned). Use 0.65-0.79 when the bias is likely but the source could plausibly be assigned differently. Use <0.65 when you are uncertain; emit the tag at low confidence rather than omitting if you have substantive evidence.

Bias tags apply to external publisher sources only. Do not propose bias tags on sources whose institutional identity is too thin to ground any tag above 0.65; in that case emit an empty array for each dimension. Better to emit nothing than to invent bias.

ICCT worked example (operator-supplied): funding [{tag: "foundation-funded", confidence: 0.90}], methodology [{tag: "methodologically-transparent", confidence: 0.85}, {tag: "analytical-synthesis", confidence: 0.85}], stakeholder [{tag: "independent-research", confidence: 0.85}, {tag: "environmental-advocate", confidence: 0.80}].

Output the JSON object only. Example shape:
{"bias_tags":{"funding":[{"tag":"government-funded","confidence":0.95}],"methodology":[{"tag":"factual-reporting","confidence":0.85}],"stakeholder":[{"tag":"regulator-aligned","confidence":0.90}]}}`;

// -----------------------------------------------------------------------
// DB CONNECTION (mirrors scripts/phase-5-backfill.mjs pattern)
// -----------------------------------------------------------------------

function buildConnectionString() {
  const DB_PASSWORD = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
  const POOLER_URL = readFileSync(resolve(process.cwd(), "supabase/.temp/pooler-url"), "utf8").trim();
  const PROJECT_REF = readFileSync(resolve(process.cwd(), "supabase/.temp/project-ref"), "utf8").trim();
  const withPassword = POOLER_URL.replace(
    `postgres.${PROJECT_REF}@`,
    `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
  );
  return withPassword.replace(/:6543(\/|\?|$)/, ":5432$1");
}

function getAnthropicKey() {
  return readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .match(/^ANTHROPIC_API_KEY=(.*)$/m)?.[1]?.trim();
}

// -----------------------------------------------------------------------
// RESILIENCE: retry helpers (added 2026-05-20 per OBS-51)
//
// The Q4 sample run was clean at 20 sources; the full 776-source run failed
// at source 21 (Anthropic Request timed out) and source 22 (pg Connection
// terminated unexpectedly). Sample-scale validation does not exercise
// long-running batch failure modes; OBS-51 captures the discipline. These
// wrappers and the Pool switch make the script resilient against those two
// classes of failure without changing classification semantics.
// -----------------------------------------------------------------------

const MAX_ANTHROPIC_RETRIES = 3;
const MAX_DB_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];

// isAnthropicRetryable + isPgRetryable are imported from
// scripts/lib/batch-primitives.mjs per the Batch-script resilience rule
// (sprint-followups-discipline 7th named rule). The inline predicates that
// previously lived here were the original Q4 resilience patch; v2 refactor
// (2026-05-20, feat/remediation-discipline-skill) consolidates the predicate
// shape with other batch scripts via the library.
const isTransientAnthropicError = isAnthropicRetryable;
const isTransientDbError = isPgRetryable;

async function withAnthropicRetry(fn, label) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_ANTHROPIC_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ANTHROPIC_RETRIES || !isTransientAnthropicError(err)) {
        throw err;
      }
      const backoff = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
      process.stdout.write(
        `\n    [retry ${attempt + 1}/${MAX_ANTHROPIC_RETRIES}] Anthropic ${label}: ${err.message}; backing off ${backoff}ms\n    `
      );
      RUN_STATS.anthropic_retries++;
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function withDbRetry(fn, label) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_DB_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_DB_RETRIES || !isTransientDbError(err)) {
        throw err;
      }
      const backoff = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
      process.stdout.write(
        `\n    [retry ${attempt + 1}/${MAX_DB_RETRIES}] DB ${label}: ${err.message}; backing off ${backoff}ms\n    `
      );
      RUN_STATS.db_retries++;
      await sleep(backoff);
      // pg.Pool auto-creates fresh connections when the prior one is dead;
      // no manual reconnect needed. The next fn() invocation will check out
      // a healthy connection.
    }
  }
  throw lastErr;
}

// Module-level counters surfaced in the run summary. Initialized here so
// the retry wrappers can increment without threading state through every
// function call.
const RUN_STATS = {
  anthropic_retries: 0,
  db_retries: 0,
};

// -----------------------------------------------------------------------
// CORE: classify one source
// -----------------------------------------------------------------------

function buildUserMessage(source) {
  return `Classify the bias of this source.

Name: ${source.name}
URL: ${source.url || "(none)"}
Description: ${source.description || "(none)"}
Source role: ${source.source_role || "(none)"}
Category: ${source.category || "(none)"}
Base tier: ${source.base_tier ?? "(none)"}

Output the JSON object only.`;
}

function validateBiasTags(value) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  for (const k of Object.keys(value)) {
    if (!["funding", "methodology", "stakeholder"].includes(k)) return false;
  }
  for (const dim of ["funding", "methodology", "stakeholder"]) {
    const arr = value[dim];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) return false;
    for (const entry of arr) {
      if (!entry || typeof entry !== "object") return false;
      if (typeof entry.tag !== "string" || !BIAS_TAG_VOCAB[dim].includes(entry.tag)) return false;
      if (typeof entry.confidence !== "number" || entry.confidence < 0 || entry.confidence > 1) return false;
    }
  }
  return true;
}

async function classifyOne(client, source) {
  const resp = await withAnthropicRetry(
    () => client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(source) }],
    }),
    `messages.create source=${source.id}`
  );
  const text = resp.content.filter(b => b.type === "text").map(b => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`No JSON object in model output for source ${source.id}`);
  const obj = JSON.parse(m[0]);
  const bt = obj.bias_tags;
  if (!validateBiasTags(bt)) throw new Error(`Malformed bias_tags for source ${source.id}: ${JSON.stringify(bt)}`);
  return {
    bias_tags: bt,
    usage: {
      input_tokens: resp.usage?.input_tokens ?? PRICING.est_input_tokens,
      output_tokens: resp.usage?.output_tokens ?? PRICING.est_output_tokens,
    },
  };
}

// -----------------------------------------------------------------------
// CORE: write assignments to source_bias_tags
// -----------------------------------------------------------------------

function bucketByConfidence(biasTags) {
  // Returns { auto: [{dimension,tag,confidence}], review: [...], discarded: [...] }
  // Per-dimension auto threshold: funding/stakeholder >= 0.75; methodology >= 0.80
  // (D1 Option B; see HIGH_CONFIDENCE_THRESHOLDS).
  const out = { auto: [], review: [], discarded: [] };
  for (const dim of ["funding", "methodology", "stakeholder"]) {
    const autoThreshold = autoThresholdFor(dim);
    const arr = biasTags[dim] || [];
    for (const { tag, confidence } of arr) {
      const row = { dimension: dim, tag, confidence };
      if (confidence >= autoThreshold) out.auto.push(row);
      else if (confidence >= REVIEW_QUEUE_THRESHOLD) out.review.push(row);
      else out.discarded.push(row);
    }
  }
  return out;
}

async function writeAssignments(pgc, sourceId, buckets, dryRun) {
  const rows = [
    ...buckets.auto.map(r => ({ ...r, assignment_source: "haiku_auto_high_confidence" })),
    ...buckets.review.map(r => ({ ...r, assignment_source: "haiku_proposed_low_confidence" })),
  ];
  if (rows.length === 0) return 0;
  if (dryRun) return rows.length;
  // Bulk INSERT; ON CONFLICT DO NOTHING handles re-runs against existing
  // (source_id, dimension, tag) tuples (idempotent per the UNIQUE
  // constraint). Re-runs do not overwrite confidence on previously-written
  // rows; the rationale is that confidence-only churn from re-classifying
  // the same source against the same prompt isn't worth the audit noise.
  // If we want re-classifier-driven confidence updates we revisit this
  // with an explicit --refresh flag and an UPDATE path.
  const values = [];
  const placeholders = [];
  rows.forEach((r, i) => {
    const off = i * 5;
    placeholders.push(`($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5})`);
    values.push(sourceId, r.dimension, r.tag, r.confidence, r.assignment_source);
  });
  const sql = `
    INSERT INTO public.source_bias_tags (source_id, dimension, tag, confidence, assignment_source)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (source_id, dimension, tag) DO NOTHING
  `;
  const res = await withDbRetry(
    () => pgc.query(sql, values),
    `INSERT source_bias_tags source=${sourceId}`
  );
  return res.rowCount;
}

// -----------------------------------------------------------------------
// CORE: per-source flow
// -----------------------------------------------------------------------

async function loadSources(pgc, limit) {
  // Pull sources that do NOT already carry operator_* tags; those are
  // operator judgment and the batch must not touch them. ORDER BY id gives
  // a deterministic sample across runs (vs ORDER BY random()).
  const sql = `
    SELECT s.id, s.name, s.url, s.description, s.source_role, s.category, s.base_tier
      FROM public.sources s
     WHERE NOT EXISTS (
       SELECT 1 FROM public.source_bias_tags sbt
        WHERE sbt.source_id = s.id
          AND sbt.assignment_source IN ('operator_confirmed', 'operator_set')
     )
     ORDER BY s.id
     ${limit ? `LIMIT ${limit}` : ""}
  `;
  const r = await withDbRetry(() => pgc.query(sql), `loadSources limit=${limit ?? "none"}`);
  return r.rows;
}

async function loadTotalEligible(pgc) {
  const r = await withDbRetry(
    () => pgc.query(`
      SELECT COUNT(*)::int AS n FROM public.sources s
      WHERE NOT EXISTS (
        SELECT 1 FROM public.source_bias_tags sbt
          WHERE sbt.source_id = s.id
            AND sbt.assignment_source IN ('operator_confirmed', 'operator_set')
      )
    `),
    "loadTotalEligible"
  );
  return r.rows[0].n;
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// -----------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  // --dry-run and --limit are flag modifiers that combine with the
  // primary mode. Primary mode: --full | sample (default). Flag modifiers:
  // --dry-run (skip DB writes), --limit <n> (bound slice size to n; defaults
  // to SAMPLE_SIZE if not present and mode is sample).
  const isFull = args.includes("--full");
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const limitVal = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;
  if (limitIdx >= 0 && (!Number.isFinite(limitVal) || limitVal <= 0)) {
    throw new Error("--limit requires a positive integer");
  }
  const mode = isFull ? "full" : dryRun ? "dry-run" : limitVal != null ? "limit" : "sample";
  const intervalIdx = args.indexOf("--interval-ms");
  const intervalMs = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1], 10) : DEFAULT_INTERVAL_MS;

  const conn = buildConnectionString();
  const apiKey = getAnthropicKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not in .env.local");

  // pg.Pool replaces the single pg.Client used previously. Rationale per
  // OBS-51: the long-running full-batch run failed at source 22 with
  // "Connection terminated unexpectedly" because the single Client cannot
  // recover from a pooler-side disconnect. pg.Pool transparently creates
  // fresh connections; combined with withDbRetry() this survives idle
  // disconnects from the Supabase pooler over multi-hour runs.
  //
  // idleTimeoutMillis: 30000 - close idle clients after 30s so the pool
  //   doesn't hold connections during the inter-call 1.2s sleep AND so
  //   the pool sheds dead idle connections quickly.
  // connectionTimeoutMillis: 10000 - fail fast on initial connection so
  //   the retry wrapper can kick in rather than hanging.
  // max: 2 - this script is strictly sequential; one active query at a
  //   time. Keep the pool small.
  const pgc = new pg.Pool({
    connectionString: conn,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    max: 2,
  });
  // Surface pool-level errors that fire outside an in-flight query. The
  // pool emits 'error' on idle-client disconnects; logging keeps them
  // visible without crashing the process (default Node behavior on
  // unhandled EventEmitter 'error' is to crash).
  pgc.on("error", (err) => {
    process.stderr.write(`\n[pool error] ${err.message}\n`);
  });
  // Anthropic SDK: configure a generous per-request timeout so the SDK
  // surfaces transient timeouts as catchable errors (rather than the
  // process hanging on a stuck socket). The retry wrapper handles the
  // recovery loop.
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 0 });

  console.log(`Mode: ${mode}${limitVal != null ? ` (limit=${limitVal})` : ""}${dryRun && mode !== "dry-run" ? " (dry-run: no DB writes)" : ""}`);
  console.log(`Interval between Haiku calls: ${intervalMs}ms`);

  const totalEligible = await loadTotalEligible(pgc);
  console.log(`Total eligible sources (no operator_* tags): ${totalEligible}`);

  let sliceLimit;
  if (mode === "full") sliceLimit = null;
  else if (limitVal != null) sliceLimit = limitVal;
  else sliceLimit = SAMPLE_SIZE;
  const sources = await loadSources(pgc, sliceLimit);
  console.log(`Processing ${sources.length} source(s).\n`);

  const summary = {
    classified: 0,
    failed: 0,
    auto_rows_written: 0,
    review_rows_written: 0,
    discarded_count: 0,
    actual_input_tokens: 0,
    actual_output_tokens: 0,
    confidence_buckets: { "0.80-1.00": 0, "0.65-0.79": 0, "0.00-0.64": 0 },
    tag_frequency: {},
    per_source: [],
  };

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    process.stdout.write(`[${i + 1}/${sources.length}] ${s.name.slice(0, 60).padEnd(60)} `);
    try {
      const result = await classifyOne(client, s);
      const buckets = bucketByConfidence(result.bias_tags);
      const written = await writeAssignments(pgc, s.id, buckets, dryRun);

      summary.classified++;
      summary.auto_rows_written += buckets.auto.length;
      summary.review_rows_written += buckets.review.length;
      summary.discarded_count += buckets.discarded.length;
      summary.actual_input_tokens += result.usage.input_tokens;
      summary.actual_output_tokens += result.usage.output_tokens;

      for (const list of [buckets.auto, buckets.review, buckets.discarded]) {
        for (const r of list) {
          const key = `${r.dimension}/${r.tag}`;
          summary.tag_frequency[key] = (summary.tag_frequency[key] || 0) + 1;
          if (r.confidence >= 0.80) summary.confidence_buckets["0.80-1.00"]++;
          else if (r.confidence >= 0.65) summary.confidence_buckets["0.65-0.79"]++;
          else summary.confidence_buckets["0.00-0.64"]++;
        }
      }

      summary.per_source.push({
        id: s.id,
        name: s.name,
        auto: buckets.auto,
        review: buckets.review,
        discarded: buckets.discarded,
        rows_written: written,
      });

      process.stdout.write(`auto=${buckets.auto.length} review=${buckets.review.length} discard=${buckets.discarded.length}\n`);
    } catch (err) {
      // Per-source error isolation: log the failed source's id + name +
      // error, then CONTINUE to the next source. This is the OBS-51
      // guarantee — one source's failure (Anthropic timeout exhausted
      // after 3 retries, pg disconnect that did not recover after 3
      // retries, malformed model output, anything) does NOT crash the
      // whole batch. The summary.failed counter tracks the skipped
      // sources for operator review.
      summary.failed++;
      summary.per_source.push({ id: s.id, name: s.name, error: err.message });
      process.stdout.write(`FAILED (source ${s.id}): ${err.message}\n`);
    }
    if (i < sources.length - 1) await sleep(intervalMs);
  }

  console.log("\n=== Summary ===");
  console.log(`Classified: ${summary.classified}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Anthropic retries triggered: ${RUN_STATS.anthropic_retries}`);
  console.log(`DB retries triggered: ${RUN_STATS.db_retries}`);
  console.log(`Auto-applied rows (haiku_auto_high_confidence): ${summary.auto_rows_written}`);
  console.log(`Review-queue rows (haiku_proposed_low_confidence): ${summary.review_rows_written}`);
  console.log(`Discarded (<0.65 confidence): ${summary.discarded_count}`);
  console.log(`Actual input tokens: ${summary.actual_input_tokens}`);
  console.log(`Actual output tokens: ${summary.actual_output_tokens}`);

  const sampleCallCost = (summary.actual_input_tokens / 1e6) * PRICING.input_per_mtok
                       + (summary.actual_output_tokens / 1e6) * PRICING.output_per_mtok;
  const perCallCost = summary.classified > 0 ? sampleCallCost / summary.classified : 0;
  console.log(`Sample-batch total cost: $${sampleCallCost.toFixed(4)}`);
  console.log(`Per-call cost (actual): $${perCallCost.toFixed(4)}`);

  console.log("\n=== Confidence distribution ===");
  for (const [k, v] of Object.entries(summary.confidence_buckets)) {
    console.log(`  ${k}: ${v} tag-assignments`);
  }

  console.log("\n=== Tag frequency (sample) ===");
  const sortedTags = Object.entries(summary.tag_frequency).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sortedTags) {
    console.log(`  ${k.padEnd(45)} ${v}`);
  }

  console.log("\n=== Per-source detail ===");
  for (const ps of summary.per_source) {
    console.log(`- ${ps.name}`);
    if (ps.error) {
      console.log(`    ERROR: ${ps.error}`);
      continue;
    }
    if (ps.auto.length) {
      console.log(`    AUTO (>=0.80): ${ps.auto.map(r => `${r.dimension}/${r.tag}@${r.confidence}`).join(", ")}`);
    }
    if (ps.review.length) {
      console.log(`    REVIEW (0.65-0.79): ${ps.review.map(r => `${r.dimension}/${r.tag}@${r.confidence}`).join(", ")}`);
    }
    if (ps.discarded.length) {
      console.log(`    DISCARD (<0.65): ${ps.discarded.map(r => `${r.dimension}/${r.tag}@${r.confidence}`).join(", ")}`);
    }
    console.log(`    rows_written: ${ps.rows_written}`);
  }

  if (mode === "sample" || mode === "dry-run") {
    const projectedCost = perCallCost * totalEligible;
    const projectedTimeSec = (totalEligible * intervalMs) / 1000;
    console.log("\n=== Full-batch projection ===");
    console.log(`Eligible sources: ${totalEligible}`);
    console.log(`Estimated full-batch cost (actual per-call * total eligible): $${projectedCost.toFixed(2)}`);
    console.log(`Estimated full-batch wall time (at ${intervalMs}ms interval): ${Math.round(projectedTimeSec / 60)} minutes (${Math.round(projectedTimeSec)} seconds)`);
    console.log("\nFull batch is NOT scheduled automatically. To run:");
    console.log("  node scripts/q4-bias-batch-assign.mjs --full");
  }

  await pgc.end();
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
