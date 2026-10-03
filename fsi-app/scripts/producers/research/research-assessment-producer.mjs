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
// migration-344 research_assessments row per item: INSERT when the item has no current row yet, or
// SUPERSEDE (flip the old row's is_current to false, insert a new row with `supersedes` pointing at it)
// when the newly-computed row differs from the current one. An unchanged read writes nothing -- this
// producer is idempotent on a re-run over the same corpus state, matching every other producer's own
// upsert-is-a-no-op-when-unchanged contract in this repo.
//
// DRY BY DEFAULT, --apply GATED (lane-common-contract section 0: "every script you build is DRY BY DEFAULT and
// takes --apply"). Three gates, ADR-023's own shape: (1) ENABLED below -- the reviewed-code-change gate;
// armed true at authorship because the operator's own 2026-10-01 ruling IS that review (same posture
// eurostat-lc-lci-lev-producer.mjs records for its own arming) -- the underlying migration 344 is itself
// gated on the coordinator applying its DDL first (two-track policy), so an --apply run against a
// database that has not yet run migration 344 fails closed at the guarded write (relation does not
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
// migration 344 is applied and this file merges.
//
// --live SCOPE (lane RA-WF, 2026-10-02, closing rule 17's half-slice finding: this producer had no
// workflow dispatching it, so it had never run against live candidates or landed a harness_runs row).
// --live reads the real research-surface candidate population, scoped to items with NO current
// research_assessments row yet (selectNeedingAssessment/fetchLiveCandidates below) -- never a corpus-
// wide re-score on the first dispatch. --limit N bounds that population further (unbounded if omitted).
// The dedicated dispatch workflow is .github/workflows/research-assessment.yml (`mode`, `live`, `limit`
// inputs), wired to this family's own harness-landing step already.

import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assessItem, extractDoiCandidate } from "../../../src/lib/research/assess.mjs";
import { fetchWorkByDoi } from "../../research/openalex-client.mjs";
import { isMainModule } from "../../lib/is-main.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";
import {
  claimRunId,
  writeRunArtifact,
  buildRunArtifactEnvelope,
  hashHarnessVersion,
} from "../../lib/run-artifact.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";
import {
  FIXTURE_CANDIDATES,
  FIXTURE_NOW,
  FIXTURE_OPENALEX_CANDIDATE,
  fixtureOpenAlexFetchStub,
} from "./fixtures/research-assessment-fixtures.mjs";

loadLocalEnvFile();

export const PRODUCER_NAME = "research-assessment-producer";
export const HARNESS_FAMILY = "research-assessment";
export const COMPUTED_BY = `${PRODUCER_NAME}@1`;

// Gate 1 (ADR-023 section 4). Armed true at authorship -- the operator's 2026-10-01 ruling ("Research is built
// now") IS the review. The dependent migration 344 is still DDL-sketch-only (two-track policy); an
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

/** Build the migration-344 row shape (DB column names) from assess.mjs's output. */
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
 * Lane L3 (2026-10-02), coordinator ruling: W2-R merged, wire the authority-score client in. Attempts
 * REAL OpenAlex resolution for one candidate, using only identity evidence already present in the item's
 * own text (a DOI it cites) -- never a network call when no DOI-shaped string exists (CLAUDE.md rule 2:
 * no identity, no fabricated resolution; `extractDoiCandidate` is the same syntax match assess.mjs's own
 * tests cover, reused here rather than re-matched). `deps.fetch` is injected so the fixture/dry CLI run
 * and every test stay fully offline; a `--live` run leaves it unset and `openalex-client.mjs` falls back
 * to the real global `fetch`.
 *
 * MAPS raw OpenAlex snake_case fields onto `authority-score.mjs`'s documented camelCase "resolved input"
 * shape. One mapping note, confirmed against a live fire during this lane's build (not assumed from
 * docs): `citation_normalized_percentile` is an OBJECT on the raw API response
 * (`{value, is_in_top_1_percent, is_in_top_10_percent}`), not a bare number -- `.value` is extracted
 * here, once, at this exact boundary, so `authority-score.mjs`'s own contract (a plain number or null)
 * never has to special-case it.
 * @param {import("../../../src/lib/research/assess.mjs").AssessmentInput} input
 * @param {{ fetch?: Function }} [deps]
 * @returns {Promise<Array<object>>} sourceRecords to attach to the input before `assessItem`, `[]` when nothing resolves
 */
export async function resolveOpenAlexSourceRecords(input, deps = {}) {
  const doi = extractDoiCandidate(input.text);
  if (!doi) return [];
  const work = await fetchWorkByDoi(doi, deps);
  if (!work) return [];
  const firstInstitution = work.authorships?.[0]?.institutions?.[0] ?? null;
  return [
    {
      sourceId: `doi:${doi}`,
      kind: "openalex",
      institution: firstInstitution
        ? { displayName: firstInstitution.display_name ?? null, type: firstInstitution.type ?? null }
        : null,
      work: {
        publicationDate: work.publication_date ?? null,
        citedByCount: typeof work.cited_by_count === "number" ? work.cited_by_count : null,
        fwci: typeof work.fwci === "number" ? work.fwci : null,
        citationNormalizedPercentile:
          typeof work.citation_normalized_percentile?.value === "number" ? work.citation_normalized_percentile.value : null,
        isRetracted: work.is_retracted === true,
      },
      // Funding/grants parsing (OpenAlex grants[]) is a documented future extension -- not resolved
      // here, so fundingIndependence reads 'unknown' for every DOI-resolved source, never a guessed
      // 'independent' (CLAUDE.md rule 2).
      funding: null,
    },
  ];
}

/**
 * Run the producer over an explicit set of candidate AssessmentInputs and their current rows (never a
 * hidden corpus scan -- every candidate is named by the caller). Pure orchestration apart from the one
 * real, deps-injected I/O step below (`resolveOpenAlexSourceRecords`): `mode` controls only whether the
 * caller's `deps.writeFn` is invoked for real.
 *
 * @param {{
 *   candidates: Array<import("../../../src/lib/research/assess.mjs").AssessmentInput>,
 *   currentByItemId: Map<string, object>,
 *   mode: "dry" | "apply",
 *   now?: Date,
 *   deps?: { writeFn?: (row: object, currentId: string|null) => Promise<void>, openAlexDeps?: { fetch?: Function } },
 * }} config
 */
export async function runResearchAssessmentProducer({ candidates, currentByItemId, mode, now, deps = {} }) {
  const perItem = [];
  let written = 0;
  let unchanged = 0;
  const plan = [];

  for (const input of candidates) {
    const sourceRecords = await resolveOpenAlexSourceRecords(input, deps.openAlexDeps ?? {});
    const enrichedInput = sourceRecords.length ? { ...input, sourceRecords } : input;
    const computed = assessItem(enrichedInput, { now });
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

/**
 * Pure. Narrows the admitted research-surface population down to the ones this live run must actually
 * score: items with NO current `research_assessments` row (`currentItemIdSet`, read from
 * `research_assessments_current` -- migration 344's own expression of "current", mirrored from
 * `read-assessments.mjs`'s `is_current`-scoped view), bounded by `limit`. Lane RA-WF (2026-10-02),
 * closing rule 17's half-slice finding: the first live dispatch deliberately scopes to NEW candidates
 * only, never a corpus-wide re-score, so cost and blast radius on the first real run are bounded and
 * named, not implicit in whatever the corpus happens to contain that day. An item that already has a
 * current row is re-assessed by a LATER pass once this scope is proven -- not silently skipped forever;
 * `hasChanged` already makes a re-score of an unchanged item a no-write no-op when that later pass runs.
 * Exported so this selection is tested without a database (CLAUDE.md B1 -- consumers next: `main()`'s
 * `--live` branch below is the only call site).
 * @param {Array<{id: string}>} admittedRows
 * @param {Set<string>} currentItemIdSet
 * @param {number|undefined} limit
 * @returns {Array<{id: string}>}
 */
export function selectNeedingAssessment(admittedRows, currentItemIdSet, limit) {
  const needing = admittedRows.filter((r) => !currentItemIdSet.has(r.id));
  return typeof limit === "number" && limit > 0 ? needing.slice(0, limit) : needing;
}

/** Live narrowing: fetch candidate items + their joined signals from Supabase, scoped to the ones
 *  `selectNeedingAssessment` says actually need a row (lacking a current one), bounded by `limit`. Only
 *  called under --live; the default CLI run never reaches this function. `deps.client` is the injection
 *  seam a test uses to run this against a fake Supabase client with no network or credential (lane
 *  RA-WF, 2026-10-02) -- `deps.client` omitted (the real CLI path) constructs the real client exactly as
 *  before.
 *  @param {{ limit?: number, client?: object }} [deps]
 */
export async function fetchLiveCandidates({ limit, client } = {}) {
  const sb = client ?? (await (async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  })());
  const { isResearchCandidate, RESEARCH_CANDIDATE_OR } = await import("../../../src/lib/research/surface-candidate.mjs");

  const { data: items, error } = await sb
    .from("intelligence_items")
    .select("id,item_type,domain,added_date,title,what_is_it,why_matters,full_brief,source_id")
    .or(RESEARCH_CANDIDATE_OR)
    .eq("is_archived", false)
    .eq("provenance_status", "verified");
  if (error) throw new Error(`fetchLiveCandidates: ${error.message}`);
  const allAdmitted = (items ?? []).filter((r) => isResearchCandidate(r.item_type, r.domain));

  // F39 (IN-CHUNK, 2026-09-06): every read below routes through readAllByIds (scripts/lib/db.mjs),
  // which chunks any id list before it ever reaches a single .in() call -- never a raw .in() sized to
  // a runtime list, regardless of how large the research-candidate population grows.
  const { readAllByIds } = await import("../../lib/db.mjs");

  // "Lacking a current row" (see this function's own docstring above): read research_assessments_current
  // for exactly the admitted ids, scoped to this run's candidate set only -- never the whole table.
  const allAdmittedIds = allAdmitted.map((r) => r.id);
  const currentRows = allAdmittedIds.length
    ? await readAllByIds("research_assessments_current", "item_id", allAdmittedIds, {
        idColumn: "item_id",
        manyPerId: false,
        client: sb,
      })
    : [];
  const currentItemIdSet = new Set((currentRows ?? []).map((r) => r.item_id));
  const admitted = selectNeedingAssessment(allAdmitted, currentItemIdSet, limit);

  const sourceIds = [...new Set(admitted.map((r) => r.source_id).filter(Boolean))];
  const sources = sourceIds.length
    ? await readAllByIds("sources", "id,base_tier", sourceIds, { idColumn: "id", client: sb })
    : [];
  const tierBySource = new Map((sources ?? []).map((s) => [s.id, s.base_tier]));

  // Coordinator-caught at push time (pagination-order-key-audit.test.mjs, the GATE-A-RESCAN crash
  // class): item_forward_events has no "item_id" or "kind" or "source_citation" column. The real
  // schema (migration 274) is intelligence_item_id / event_kind / obligation_text; there is no
  // citation-text column at all, so source_citation is honestly null here (the R3 roadmap-body regex
  // in assess.mjs already falls back to obligation_text alone, which is still exercised).
  const itemIds = admitted.map((r) => r.id);
  const rawEvents = itemIds.length
    ? await readAllByIds(
        "item_forward_events",
        "id,intelligence_item_id,event_date,event_kind,obligation_text",
        itemIds,
        { idColumn: "intelligence_item_id", client: sb },
      )
    : [];
  const eventsByItem = new Map();
  for (const raw of rawEvents ?? []) {
    const ev = { id: raw.id, kind: raw.event_kind, event_date: raw.event_date, obligation_text: raw.obligation_text, source_citation: null };
    if (!eventsByItem.has(raw.intelligence_item_id)) eventsByItem.set(raw.intelligence_item_id, []);
    eventsByItem.get(raw.intelligence_item_id).push(ev);
  }

  return admitted.map((row) =>
    toAssessmentInput({
      ...row,
      source_base_tier: tierBySource.get(row.source_id) ?? null,
      forward_events: eventsByItem.get(row.id) ?? [],
    }),
  );
}

/** Parses `--limit N` off argv. Returns undefined (unbounded) when absent, NaN, or <= 0. Exported for a
 *  direct unit test; also exercised indirectly through `main()`'s CLI parsing. */
export function parseLimitArg(args) {
  const idx = args.indexOf("--limit");
  if (idx === -1 || idx === args.length - 1) return undefined;
  const n = Number(args[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const live = args.includes("--live");
  const limit = parseLimitArg(args);

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
  let openAlexDeps;
  if (live) {
    candidates = await fetchLiveCandidates({ limit });
    // fetchLiveCandidates() already excludes every item that has a current row (selectNeedingAssessment
    // above) -- the set it returns is BY CONSTRUCTION the "no current row yet" population, so a second
    // live query to re-derive the same exclusion (the old fetchLiveCurrentByItemId call) would be dead
    // work. currentByItemId stays the empty map, which is exactly what hasChanged(null, computed) wants
    // for a first assessment. A LATER pass that re-scores already-assessed items for drift is a separate,
    // not-yet-built scope (see selectNeedingAssessment's own docstring) and will need its own current-row
    // read when it exists.
    currentByItemId = new Map();
    now = new Date();
    openAlexDeps = {}; // real global fetch (Node 24 native), no key, polite-pool email per openalex-client.mjs
  } else {
    console.log(`${PRODUCER_NAME}: --live not passed -- running against committed fixtures, no DB credential of any kind.`);
    // Lane L3 (2026-10-02): FIXTURE_OPENALEX_CANDIDATE exercises the real OpenAlex-resolution path (a
    // DOI in the item's own text, mapped through to assessAuthorityScore's real multi-component read)
    // against a RECORDED response via fixtureOpenAlexFetchStub -- zero real network from this default run.
    candidates = [...FIXTURE_CANDIDATES, FIXTURE_OPENALEX_CANDIDATE];
    currentByItemId = new Map();
    now = FIXTURE_NOW;
    openAlexDeps = { fetch: fixtureOpenAlexFetchStub() };
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
    deps: { writeFn, openAlexDeps },
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
    config: {
      mode: decision.canWrite ? "apply" : "dry",
      source: live ? "live" : "fixtures/research-assessment-fixtures.mjs",
      limit: limit ?? null,
    },
    inputsRef: [live ? "intelligence_items (research candidates)" : "scripts/producers/research/fixtures/research-assessment-fixtures.mjs"],
    perItem: result.perItem,
    metrics: result.metrics,
    defectsFound: [],
    fullTraceRefs: [live ? "intelligence_items (research candidates)" : "scripts/producers/research/fixtures/research-assessment-fixtures.mjs"],
    proposerNotes:
      "research-assessment-producer's first run artifact (lane W2-R, 2026-10-01). Fixture/dry runs prove " +
      "the ladder end to end offline; the coordinator runs --live --apply after migration 344 lands.",
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
