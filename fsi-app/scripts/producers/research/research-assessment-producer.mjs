#!/usr/bin/env node
// research-assessment-producer.mjs -- lane W2-R (RESEARCH-ASSESSMENT-MODEL, 2026-10-01). Operator
// ruling 2026-10-01, verbatim: "Why is research have a design but not a build? Fix this." This overrides
// decision 4 of 2026-09-25 (design now, build after the four-question structure). R14: the producer that
// computes assessments IS the core deliverable; the surface renders what it produces.
//
// WHAT THIS DOES. Reads candidate items already admitted to the Research surface (surfaceOf() ->
// 'research': research_finding, plus technology/innovation items under the domain=7 rule -- see
// src/lib/research/surface-candidate.mjs), narrows each into an AssessmentInput
// (src/lib/research/assess.mjs), runs the PURE assess.mjs ladder (no LLM, no fetch, $0), and plans a
// migration-336 research_assessments row per item: INSERT when the item has no current row yet, or
// SUPERSEDE (flip the old row's is_current to false, insert a new row with `supersedes` pointing at it)
// when the newly-computed row differs from the current one. An unchanged read writes nothing -- this
// producer is idempotent on a re-run over the same corpus state, matching every other producer's own
// upsert-is-a-no-op-when-unchanged contract in this repo.
//
// DRY BY DEFAULT, --apply GATED (lane-common-contract section 0: "every script you build is DRY BY DEFAULT and
// takes --apply"). Three gates, ADR-023's own shape: (1) ENABLED below -- the reviewed-code-change gate;
// armed true at authorship because the operator's own 2026-10-01 ruling IS that review (same posture
// eurostat-lc-lci-lev-producer.mjs records for its own arming) -- the underlying migration 336 is itself
// gated on the coordinator applying its DDL first (two-track policy), so an --apply run against a
// database that has not yet run migration 336 fails closed at the guarded write (relation does not
// exist), never silently. (2) the runtime env kill switch RESEARCH_ASSESSMENT_PRODUCER_ENABLED, default
// OFF. (3) --apply on the command line. Writes go through scripts/lib/db.mjs's guardedInsert (never a
// bare INSERT) -- rule 015.
//
// NO LLM CALL. assess.mjs is pure; this producer's own I/O (reading intelligence_items/sources/
// item_forward_events, writing research_assessments) is the only side effect it performs.
//
// TEST WHAT YOU BUILD. This file's default CLI run (no --live) reads the committed fixture candidates
// (fixtures/research-assessment-fixtures.mjs) -- never the network, never a DB credential -- runs the
// real ladder, prints the plan, and writes this family's own harness-run artifact
// (scripts/harness-runs/research-assessment/). The coordinator runs the live --live --apply pass after
// migration 336 is applied and this file merges.

import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assessItem } from "../../../src/lib/research/assess.mjs";
import { isMainModule } from "../../lib/is-main.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";
import {
  claimRunId,
  writeRunArtifact,
  buildRunArtifactEnvelope,
  hashHarnessVersion,
} from "../../lib/run-artifact.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";
import { FIXTURE_CANDIDATES, FIXTURE_NOW } from "./fixtures/research-assessment-fixtures.mjs";

loadLocalEnvFile();

export const PRODUCER_NAME = "research-assessment-producer";
export const HARNESS_FAMILY = "research-assessment";
export const COMPUTED_BY = `${PRODUCER_NAME}@1`;

// Gate 1 (ADR-023 section 4). Armed true at authorship -- the operator's 2026-10-01 ruling ("Research is built
// now") IS the review. The dependent migration 336 is still DDL-sketch-only (two-track policy); an
// --apply run against a database where it has not landed fails closed at the guarded INSERT.
export const ENABLED = true;
const KILL_SWITCH_ENV = "RESEARCH_ASSESSMENT_PRODUCER_ENABLED"; // Gate 2, default OFF.

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolvePath(HERE, "../../..");
const DEFAULT_HARNESS_RUNS_DIR = resolvePath(FSI_ROOT, "scripts/harness-runs", HARNESS_FAMILY);

const GOVERNING_FILES = [
  "src/lib/research/assess.mjs",
  "scripts/producers/research/research-assessment-producer.mjs",
];

const CITE = {
  skill: "environmental-policy-and-innovation",
  reason:
    "Lane W2-R (operator ruling 2026-10-01, 'Why is research have a design but not a build? Fix this.'): " +
    "the research_assessments row is computed deterministically from the item's own recorded facts, " +
    "forward events, and source tier (assess.mjs, pure, no LLM) and written through the guarded path per " +
    "docs/specs/03-research.md's assessment model.",
};

/**
 * Narrow a DB item row (plus its joined signals) into assess.mjs's AssessmentInput shape. Exported so a
 * test can exercise the narrowing without a live query.
 * @param {object} row
 * @returns {import("../../../src/lib/research/assess.mjs").AssessmentInput}
 */
export function toAssessmentInput(row) {
  return {
    id: row.id,
    itemType: row.item_type,
    addedDate: row.added_date ?? null,
    text: [row.title, row.what_is_it, row.why_matters, row.full_brief].filter(Boolean).join(" "),
    sourceTier: typeof row.source_base_tier === "number" ? row.source_base_tier : null,
    citationCount: typeof row.citation_count === "number" ? row.citation_count : null,
    biasTags: row.bias_tags ?? [],
    forwardEvents: row.forward_events ?? [],
  };
}

/**
 * Compare a freshly-computed assessment against the item's current row (if any). Returns true when a
 * new row must be written (first assessment, or any scored field differs) -- false when the current row
 * already reflects exactly this read, so the producer writes nothing (idempotent re-run).
 * @param {object | null} current research_assessments_current row shape, or null
 * @param {ReturnType<typeof assessItem>} computed
 * @returns {boolean}
 */
export function hasChanged(current, computed) {
  if (!current) return true;
  const tm = computed.technicalMaturity;
  const cm = computed.commercialMaturity;
  const h = computed.horizon;
  return (
    current.technical_maturity_low !== (tm?.low ?? null) ||
    current.technical_maturity_high !== (tm?.high ?? null) ||
    current.commercial_maturity_low !== (cm?.low ?? null) ||
    current.commercial_maturity_high !== (cm?.high ?? null) ||
    current.horizon_band !== (h?.band ?? null) ||
    current.horizon_rule !== (h?.rule ?? null) ||
    current.horizon_kind !== (h?.kind ?? null) ||
    current.refusal_reason !== (computed.refusalReason ?? null) ||
    current.credibility_evidence_score !== (computed.credibilityEvidenceScore ?? null) ||
    current.status_token !== computed.statusToken
  );
}

/** Build the migration-336 row shape (DB column names) from assess.mjs's output. */
export function toRow(computed, { supersedes = null } = {}) {
  const tm = computed.technicalMaturity;
  const cm = computed.commercialMaturity;
  const h = computed.horizon;
  return {
    item_id: computed.itemId,
    supersedes,
    is_current: true,
    technical_maturity_low: tm?.low ?? null,
    technical_maturity_high: tm?.high ?? null,
    technical_maturity_method: tm?.method ?? null,
    technical_maturity_evidence_ids: tm?.evidenceIds ?? [],
    commercial_maturity_low: cm?.low ?? null,
    commercial_maturity_high: cm?.high ?? null,
    commercial_maturity_method: cm?.method ?? null,
    commercial_maturity_evidence_ids: cm?.evidenceIds ?? [],
    horizon_kind: h?.kind ?? null,
    horizon_band: h?.band ?? null,
    horizon_rule: h?.rule ?? null,
    horizon_confidence: h?.confidence ?? null,
    horizon_trigger_note: h?.triggerNote ?? null,
    refusal_reason: computed.refusalReason,
    credibility_evidence_score: computed.credibilityEvidenceScore,
    credibility_authority_score: computed.credibilityAuthorityScore,
    computed_by: COMPUTED_BY,
    status_token: computed.statusToken,
  };
}

/**
 * Run the producer over an explicit set of candidate AssessmentInputs and their current rows (never a
 * hidden corpus scan -- every candidate is named by the caller). Pure orchestration: `mode` controls only
 * whether the caller's `deps.writeFn` is invoked for real; this function itself performs no I/O.
 *
 * @param {{
 *   candidates: Array<import("../../../src/lib/research/assess.mjs").AssessmentInput>,
 *   currentByItemId: Map<string, object>,
 *   mode: "dry" | "apply",
 *   now?: Date,
 *   deps?: { writeFn?: (row: object, currentId: string|null) => Promise<void> },
 * }} config
 */
export async function runResearchAssessmentProducer({ candidates, currentByItemId, mode, now, deps = {} }) {
  const perItem = [];
  let written = 0;
  let unchanged = 0;
  const plan = [];

  for (const input of candidates) {
    const computed = assessItem(input, { now });
    const current = currentByItemId.get(input.id) ?? null;
    if (!hasChanged(current, computed)) {
      unchanged += 1;
      perItem.push({ id: input.id, outcome: "unchanged", verdict: null, error: null });
      continue;
    }
    const row = toRow(computed, { supersedes: current?.id ?? null });
    plan.push(row);
    const outcome = computed.horizon
      ? `assessed (${computed.horizon.rule}, ${computed.horizon.band}, ${computed.statusToken})`
      : `refused (${computed.statusToken})`;
    perItem.push({ id: input.id, outcome, verdict: computed.refusalReason, error: null });
    if (mode === "apply" && deps.writeFn) {
      await deps.writeFn(row, current?.id ?? null);
      written += 1;
    }
  }

  return {
    perItem,
    plan,
    metrics: {
      candidates: candidates.length,
      unchanged,
      planned: plan.length,
      written: mode === "apply" ? written : 0,
    },
  };
}

// ── CLI orchestration ──────────────────────────────────────────────────────────────────────────────────

function decideApply({ apply, enabled, killSwitchOn, hasCreds }) {
  if (!apply) return { canWrite: false, reason: "dry run (no --apply) -- parse + plan only, nothing written" };
  if (!enabled) {
    return {
      canWrite: false,
      reason: "REFUSING -- the source-level ENABLED constant is false. Arming is a later, separate, reviewed commit.",
    };
  }
  if (!killSwitchOn) {
    return { canWrite: false, reason: `REFUSING -- kill switch ${KILL_SWITCH_ENV} is OFF (set it to "1" to arm this producer)` };
  }
  if (!hasCreds) {
    return { canWrite: false, reason: "REFUSING -- --apply requires DB creds (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) -- none found" };
  }
  return { canWrite: true, reason: "all gates satisfied" };
}

export { decideApply };

/** Live narrowing: fetch candidate items + their joined signals from Supabase. Only called under --live;
 *  the default CLI run never reaches this function, so it carries no test obligation of its own beyond
 *  the pure toAssessmentInput() narrowing above, which IS tested. */
async function fetchLiveCandidates() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { isResearchCandidate, RESEARCH_CANDIDATE_OR } = await import("../../../src/lib/research/surface-candidate.mjs");

  const { data: items, error } = await sb
    .from("intelligence_items")
    .select("id,item_type,domain,added_date,title,what_is_it,why_matters,full_brief,source_id")
    .or(RESEARCH_CANDIDATE_OR)
    .eq("is_archived", false)
    .eq("provenance_status", "verified");
  if (error) throw new Error(`fetchLiveCandidates: ${error.message}`);
  const admitted = (items ?? []).filter((r) => isResearchCandidate(r.item_type, r.domain));

  // F39 (IN-CHUNK, 2026-09-06): both reads below route through readAllByIds (scripts/lib/db.mjs),
  // which chunks any id list before it ever reaches a single .in() call -- never a raw .in() sized to
  // a runtime list, regardless of how large the research-candidate population grows.
  const { readAllByIds } = await import("../../lib/db.mjs");

  const sourceIds = [...new Set(admitted.map((r) => r.source_id).filter(Boolean))];
  const sources = sourceIds.length
    ? await readAllByIds("sources", "id,base_tier", sourceIds, { idColumn: "id", client: sb })
    : [];
  const tierBySource = new Map((sources ?? []).map((s) => [s.id, s.base_tier]));

  const itemIds = admitted.map((r) => r.id);
  const events = itemIds.length
    ? await readAllByIds(
        "item_forward_events",
        "id,item_id,kind,event_date,obligation_text,source_citation",
        itemIds,
        { idColumn: "item_id", client: sb },
      )
    : [];
  const eventsByItem = new Map();
  for (const ev of events ?? []) {
    if (!eventsByItem.has(ev.item_id)) eventsByItem.set(ev.item_id, []);
    eventsByItem.get(ev.item_id).push(ev);
  }

  return admitted.map((row) =>
    toAssessmentInput({
      ...row,
      source_base_tier: tierBySource.get(row.source_id) ?? null,
      forward_events: eventsByItem.get(row.id) ?? [],
    }),
  );
}

async function fetchLiveCurrentByItemId(itemIds) {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!itemIds.length) return new Map();
  // F39: readAllByIds chunks the id list (never a raw .in() sized to a runtime list) -- same reasoning
  // as fetchLiveCandidates above. One row per item_id (the view's own unique-current-row guarantee,
  // migration 336's partial unique index), so manyPerId:false.
  const { readAllByIds } = await import("../../lib/db.mjs");
  const rows = await readAllByIds("research_assessments_current", "*", itemIds, {
    idColumn: "item_id",
    manyPerId: false,
    client: sb,
  });
  return new Map((rows ?? []).map((r) => [r.item_id, r]));
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const live = args.includes("--live");

  const decision = decideApply({
    apply,
    enabled: ENABLED,
    killSwitchOn: process.env[KILL_SWITCH_ENV] === "1",
    hasCreds: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
  if (apply && !decision.canWrite) {
    console.error(`${PRODUCER_NAME}: ${decision.reason}`);
    process.exit(decision.reason.includes("DB creds") ? 2 : 1);
  }

  const startedAt = new Date().toISOString();
  let candidates;
  let currentByItemId;
  let now;
  if (live) {
    candidates = await fetchLiveCandidates();
    currentByItemId = await fetchLiveCurrentByItemId(candidates.map((c) => c.id));
    now = new Date();
  } else {
    console.log(`${PRODUCER_NAME}: --live not passed -- running against committed fixtures, no DB credential of any kind.`);
    candidates = FIXTURE_CANDIDATES;
    currentByItemId = new Map();
    now = FIXTURE_NOW;
  }

  let writeFn;
  if (decision.canWrite) {
    const { guardedInsert, guardedUpdateByIds } = await import("../../lib/db.mjs");
    writeFn = async (row, currentId) => {
      if (currentId) {
        await guardedUpdateByIds("research_assessments", [currentId], { is_current: false }, { cite: CITE });
      }
      await guardedInsert("research_assessments", row, { cite: CITE });
    };
  }

  const result = await runResearchAssessmentProducer({
    candidates,
    currentByItemId,
    mode: decision.canWrite ? "apply" : "dry",
    now,
    deps: { writeFn },
  });

  console.log(`${PRODUCER_NAME}: ${live ? "live" : "fixture"} run, mode=${decision.canWrite ? "apply" : "dry"}`);
  console.log(`${PRODUCER_NAME}: metrics ${JSON.stringify(result.metrics)}`);
  for (const item of result.perItem) {
    console.log(`  ${item.id}: ${item.outcome}${item.verdict ? ` -- ${item.verdict}` : ""}`);
  }

  const harnessVersion = hashHarnessVersion(GOVERNING_FILES, FSI_ROOT);
  const runId = claimRunId(DEFAULT_HARNESS_RUNS_DIR, HARNESS_FAMILY);
  const artifact = buildRunArtifactEnvelope({
    family: HARNESS_FAMILY,
    harnessVersion,
    runId,
    startedAt,
    config: { mode: decision.canWrite ? "apply" : "dry", source: live ? "live" : "fixtures/research-assessment-fixtures.mjs" },
    inputsRef: [live ? "intelligence_items (research candidates)" : "scripts/producers/research/fixtures/research-assessment-fixtures.mjs"],
    perItem: result.perItem,
    metrics: result.metrics,
    defectsFound: [],
    fullTraceRefs: [live ? "intelligence_items (research candidates)" : "scripts/producers/research/fixtures/research-assessment-fixtures.mjs"],
    proposerNotes:
      "research-assessment-producer's first run artifact (lane W2-R, 2026-10-01). Fixture/dry runs prove " +
      "the ladder end to end offline; the coordinator runs --live --apply after migration 336 lands.",
  });
  const artifactPath = writeRunArtifact(DEFAULT_HARNESS_RUNS_DIR, artifact);
  console.log(`${PRODUCER_NAME}: wrote harness artifact ${artifactPath}`);

  writeProducerSummary({
    producer: PRODUCER_NAME,
    status: "ok",
    rows_changed: result.metrics.written,
    counts: result.metrics,
  });
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
