#!/usr/bin/env node
// state-cost-facts-producer.mjs, lane STATE-COST-PRODUCER (docs/plans/data-machine-tool-gaps-2026-09-25.md
// "Collect" row: "state_cost_facts producer", operator ruling 2026-09-25 "build the producer"). Builds
// the ONE producer for `state_cost_facts` (migration 152, 0 live rows, PENDING-by-design), read by
// src/app/api/ask/route.ts:245 and src/lib/supabase-server.ts:3507, a table with a read dependency and
// NO producer, ever, until this lane.
//
// R14 HOLD (operator, 2026-09-25: "we are NOT updating the data on the site, we are building the tools
// that manage that data first"): ZERO LIVE ROWS may be written by this lane. Enforced THREE ways, not
// one:
//   1. Kill switch below, same convention as bls-oews-producer.mjs / eurostat-nrg-pc-205-producer.mjs, //      ENABLED=false. A reviewed, dated code change is required to ever flip it, exactly the mechanism
//      those producers document (their own ENABLED history is the precedent this lane follows).
//   2. This lane's own tests exercise ONLY the fixture/dry path (runStateCostFactsProducer with
//      mode:"dry" and injected fixture deps), no test calls the real DB-backed default deps.
//   3. main() below checks ENABLED before doing anything, exit 0 no-op, EVEN IF a future caller passes
//      --apply, the kill switch is checked before the mode flag is ever read.
//
// SOURCES THROUGH THE REGISTRY, TIER FROM THE INSTITUTION CLASS TABLE (CLAUDE.md rule 18: "the source is
// found and rated, never the figure refused... tier from the institution class table, never hand-
// typed"). `classTierForHost` (src/lib/sources/host-authority.ts, SC-13's deterministic
// register-at-grounding class table) computes the tier BEFORE `registerSource` (scripts/lib/db.mjs) ever
// writes a row, so a brand-new source is never born with a hand-typed or guessed tier. A host the class
// table cannot classify is NOT silently defaulted (registerSource's own `?? 7` fallback is never reached
// from this producer), it is refused with a named reason, `refused_unrated_source`, surfaced in the run
// artifact's defects_found for registry review, matching rule 18's own "find the source and rate it"
// mandate (a follow-up classification action, not a hand-typed tier here).
//
// GROUNDING (CLAUDE.md rule 18 / ADR-016; see state-cost-facts-envelope.mjs's own header for the exact
// citation, the same verbatim-span requirement validate_item_provenance criterion 3 applies to a
// regulatory FACT's source_span). A candidate with no span, or a span that is not verbatim in its
// capture, is refused (`refused_ungrounded`), never written with an invented or paraphrased grounding.
//
// DOWNSTREAM TRIGGER (rule 17: "an analysis is not done until its result is written where the surfaces
// read it... a runtime that ends without triggering its downstream is a defect in the runtime"). What
// the EXISTING regional_data_facts producers trigger is DAG authorship for the automate_vs_hire method
// (run-envelope-producer.mjs's authorAutomateVsHireForRegions), investigated and found NOT reusable
// here without a schema/method change (see this lane's report: automate-vs-hire.ts's own
// findFactByDimension hard-codes `ref.table !== "regional_data_facts"`, and state_cost_facts has no
// `value_numeric` column for the method to read even if the table check were widened). What IS
// mechanically reusable, unmodified, is the ENTITY-SPINE connection every other jurisdiction-bearing
// table gets (backfill-entities.mjs's JURISDICTION kind, "every occurrence becomes an entity_refs row on
// the table it came from", state_cost_facts was not yet a covered table). This producer mints/links a
// jurisdiction entity for every state_code its run WRITES, through the SAME planJurisdictionEntities /
// planJurisdictionRefs planners the region-level backfill uses (src/lib/entities/entity-plan.mjs),
// scoped to `ref_table: "state_cost_facts"`. This is the downstream trigger this lane proves on fixtures;
// automate-vs-hire-shaped DAG authorship at state grain is named as an OPEN QUESTION for the coordinator
// (see report), not invented here.

import { readAll, guardedInsert, guardedUpdate, guardedInsertMany, registerSource } from "../../lib/db.mjs";
import { groundCandidate, buildStateCostFactRow, planUpsert, naturalKey } from "../../../src/lib/regional/state-cost-facts-envelope.mjs";
import { makeResolveSource } from "../../lib/rate-source-by-class.mjs";
import { r14ApplyRefusalMessage, buildR14HeldRunArtifact, runR14HeldFixtureCli } from "../../lib/r14-held-producer-cli.mjs";
import { planJurisdictionEntities, planJurisdictionRefs } from "../../../src/lib/entities/entity-plan.mjs";
import { existingEntityIdSet, existingIdentifierKeySet, existingRefKeySet } from "../../entities/backfill-entities.mjs";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../../harness-runs/governing-files.mjs";
import { isMainModule } from "../../lib/is-main.mjs";
import { authorEdges } from "../../../src/lib/propagation/author-edges.mjs";
import { getMethod } from "../../../src/lib/propagation/methods/index.ts";
import { isHourlyWageUnit } from "../../../src/lib/operations/automate-vs-hire.mjs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// KILL SWITCH, default OFF (R14 hold). See file header point 1. Flipping this is a reviewed, dated
// change, same discipline as bls-oews-producer.mjs's ENABLED history, it is NOT flipped by this lane.
export const ENABLED = false;

export const PRODUCER_NAME = "state-cost-facts";
export const HARNESS_FAMILY = "state-cost";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolvePath(HERE, "../../..");
const DEFAULT_HARNESS_RUNS_DIR = resolvePath(FSI_ROOT, "scripts/harness-runs", HARNESS_FAMILY);

// GOVERNING FILES for this family's harness_version hash come from GOVERNING_FILES["state-cost"]
// (scripts/harness-runs/governing-files.mjs), itself derived from scripts/harness-runs/state-cost/
// family.json, never a second hand-maintained literal array here (governing-files.test.mjs's repo-wide
// sweep fails CI on exactly that duplication).

const CITE = {
  skill: "environmental-policy-and-innovation",
  reason:
    "Lane STATE-COST-PRODUCER (2026-09-25 operator ruling 'build the producer'): state_cost_facts had a " +
    "read dependency (api/ask/route.ts, supabase-server.ts) and zero producers since migration 152 " +
    "(2026-07). Sources resolved through the registry (classTierForHost, never hand-typed), grounded " +
    "verbatim per candidate span, row built and upserted on the live (state_code, dimension, fact_label) " +
    "key. R14 holds live rows, this cite is exercised only when a future reviewed change flips ENABLED.",
};

const REGION_ENTITY_CITE = {
  skill: "remediation-discipline",
  reason:
    "Lane STATE-COST-PRODUCER: mint/link a jurisdiction entity for every state_code a state_cost_facts " +
    "producer run wrote, through the SAME entity-plan machinery (planJurisdictionEntities/" +
    "planJurisdictionRefs, src/lib/entities/entity-plan.mjs) the region-level backfill already uses, " +
    "this is the entity-spine downstream connection (rule 17), never a second minting implementation.",
};

/**
 * Resolve region_code -> live regions.id, throwing (never guessing) on any missing code. Injectable via
 * deps.readAllFn for tests.
 */
async function resolveRegionIds(regionCodes, readAllFn) {
  const rows = await readAllFn("regions", "id, code");
  const byCode = new Map(rows.map((r) => [r.code, r.id]));
  const missing = regionCodes.filter((c) => !byCode.has(c));
  if (missing.length) {
    throw new Error(`state-cost-facts-producer: region code(s) not found in live \`regions\` table: ${missing.join(", ")}`);
  }
  return byCode;
}

// Resolve one candidate's source: tier from classTierForHost (the institution class table), THEN
// register (real DB) or preview (dry). Never falls back to a hand-typed tier, an unclassifiable host is
// reported as unrated, not guessed. Built by the shared makeResolveSource factory
// (scripts/lib/rate-source-by-class.mjs, coordinator directive 2026-09-28, F45 duplicate-code follow-up):
// this producer's own contribution is only its config (candidate field names, cite), never a
// hand-written wrapper body.
const resolveSource = makeResolveSource({
  urlField: "source_url",
  nameField: "source_name",
  cite: CITE,
});

/**
 * Mint/link jurisdiction entities for every state_code touched by this run's WRITTEN rows (downstream
 * trigger, see file header). Dry mode returns a preview count only, no writes. Injectable deps mirror
 * backfill-entities.mjs's own exported helpers (reused directly, never re-implemented).
 */
async function authorJurisdictionEntitiesForStates(writtenRows, mode, deps) {
  const counts = { planned_entities: 0, planned_identifiers: 0, planned_refs: 0, written: false };
  if (!writtenRows.length) return { ...counts, byCode: new Map() };

  const existingEntityIds = mode === "apply" ? await deps.existingEntityIdSetFn() : new Set();
  const existingIdentifierKeys = mode === "apply" ? await deps.existingIdentifierKeySetFn() : new Set();
  const existingRefKeys = mode === "apply" ? await deps.existingRefKeySetFn() : new Set();

  const codes = [...new Set(writtenRows.map((r) => r.state_code))];
  const { entities, identifiers, byCode } = deps.planJurisdictionEntitiesFn(codes, existingEntityIds, existingIdentifierKeys);
  const refRows = writtenRows.map((r) => ({ id: r.id, jurisdiction_iso: [r.state_code] }));
  const refs = deps.planJurisdictionRefsFn("state_cost_facts", refRows, byCode, existingRefKeys);

  counts.planned_entities = entities.length;
  counts.planned_identifiers = identifiers.length;
  counts.planned_refs = refs.length;

  if (mode === "apply") {
    if (entities.length) await deps.guardedInsertManyFn("entities", entities, { cite: REGION_ENTITY_CITE });
    if (identifiers.length) await deps.guardedInsertManyFn("entity_identifiers", identifiers, { cite: REGION_ENTITY_CITE });
    if (refs.length) await deps.guardedInsertManyFn("entity_refs", refs, { cite: REGION_ENTITY_CITE });
    counts.written = true;
  }
  // byCode (state_code -> jurisdiction entity_id) is returned so the DAG-authorship step below can stamp
  // the same jurisdiction entity onto a derived_values row it authors for that state, never a second,
  // independently-computed entity id.
  return { ...counts, byCode };
}

const AUTOMATE_VS_HIRE_METHOD = { id: "automate_vs_hire", version: "1.0.0" };

/** A fake PostgREST-shaped query builder that always resolves to an empty, error-free result, the safe
 *  "nothing has been authored yet" default a PREVIEW uses in place of a real derivation_edges/
 *  derived_values read (see authorAutomateVsHireForStates's own header for why this is honest, not a
 *  guess: a dry run over fixtures has no live rows to check by construction, R14). Chainable on every
 *  method hasBeenAuthored (author-edges.mjs) calls (.select/.eq/.in/.limit), and awaitable (implements
 *  `.then` so `await` resolves it directly without a real network round trip). */
function fakePreviewQuery() {
  const q = {
    select: () => q,
    eq: () => q,
    in: () => q,
    limit: () => q,
    then: (resolve) => resolve({ data: [], error: null }),
  };
  return q;
}

/**
 * State-grain automate_vs_hire DAG authorship (migration 332/333, lane STATE-COST-DAG 2026-09-27; rule 17
 * downstream trigger, upgraded from the entity-spine-only connection lane STATE-COST-PRODUCER shipped).
 * Groups `builtRows` (this run's own candidate rows, in memory, never a DB re-read) by state_code; for
 * every state whose rows complete an hourly labor_markets + operational_cost pair, authors (apply) or
 * PREVIEWS (dry) one automate_vs_hire derived_values row through the EXISTING register_derived_value path
 * (author-edges.mjs::authorEdges -> methods/index.ts::getMethod -> register-derivation.ts, never a second
 * write mechanism).
 *
 * DRY MODE IS A TRUE PREVIEW, not a no-op (unlike run-envelope-producer.mjs's region-grain twin
 * authorAutomateVsHireForRegions, which returns zeroed counts for dry, see that function's own header).
 * `resolveInputs` and `registerDerivedValue` are injected FAKES that read the wage/energy rows straight
 * out of `builtRows` and never touch a database; `getMethod` is the REAL registered method
 * (methods/index.ts's side-effect-registered METHODS map), so the actual NPV computation
 * (automateVsHire, wage + energy -> NPV) runs for real and the preview is not a guess. `hasBeenAuthored`'s
 * own derivation_edges/derived_values reads go through `fakePreviewQuery()` (see its own header), the
 * honest "nothing authored yet" default for a fixture-only preview.
 *
 * APPLY mode (unreachable while R14 holds; ENABLED stays false, see file header) would instead pass the
 * real `deps.sb`, the real `resolveInputs` (drain.ts), and the real `registerDerivedValue`
 * (register-derivation.ts) so the write goes through the actual guarded RPC path, not this preview's fakes.
 *
 * @param {Array<object>} builtRows rows shaped like buildStateCostFactRow() output, each carrying an `id`
 *   (a real row id in apply mode, a synthetic preview id in dry mode, see the caller)
 * @param {"dry"|"apply"} mode
 * @param {Map<string,string>} byCode state_code -> jurisdiction entity_id (from
 *   authorJurisdictionEntitiesForStates's own return), so the SAME entity stamps this derived value
 * @param {{getMethodFn?: typeof getMethod, authorEdgesFn?: typeof authorEdges, sb?: object}} [deps]
 * @returns {Promise<{pairs_found: number, authored: number, previewed: number, skipped_incomplete: number, edges: Array<object>}>}
 */
export async function authorAutomateVsHireForStates(builtRows, mode, byCode, deps = {}) {
  const counts = { pairs_found: 0, authored: 0, previewed: 0, skipped_incomplete: 0 };
  const edges = [];
  if (!builtRows.length) return { ...counts, edges };

  const getMethodFn = deps.getMethodFn ?? getMethod;
  const authorEdgesFn = deps.authorEdgesFn ?? authorEdges;

  const byState = new Map();
  for (const row of builtRows) {
    if (!byState.has(row.state_code)) byState.set(row.state_code, []);
    byState.get(row.state_code).push(row);
  }

  for (const [stateCode, rows] of byState) {
    const wage = rows.find(
      (r) => r.dimension === "labor_markets" && isHourlyWageUnit(r.unit) && typeof r.value_numeric === "number" && Number.isFinite(r.value_numeric),
    );
    const energy = rows.find(
      (r) => r.dimension === "operational_cost" && typeof r.value_numeric === "number" && Number.isFinite(r.value_numeric),
    );
    if (!wage || !energy) {
      counts.skipped_incomplete += 1;
      continue;
    }
    counts.pairs_found += 1;
    const entityId = byCode.get(stateCode) ?? null;
    const figure = {
      table: "state_cost_facts",
      id: wage.id,
      entity: entityId,
      method: AUTOMATE_VS_HIRE_METHOD,
      inputs: [
        { table: "state_cost_facts", pk: wage.id },
        { table: "state_cost_facts", pk: energy.id },
      ],
    };

    if (mode === "apply") {
      const result = await authorEdgesFn(deps.sb, figure, { getMethod: getMethodFn });
      if (result.ok && result.action === "authored") counts.authored += 1;
      edges.push({ state_code: stateCode, wage_id: wage.id, energy_id: energy.id, entity: entityId, ...result });
    } else {
      // TRUE PREVIEW, see this function's own header for why the fakes below are honest, not a guess.
      const rowsById = new Map([wage, energy].map((r) => [r.id, r]));
      const fakeResolveInputs = async (_sb, inputs) =>
        inputs.map((ref) => {
          const row = rowsById.get(ref.pk);
          return { table: ref.table, pk: ref.pk, version: null, row: row ? { dimension: row.dimension, value_numeric: row.value_numeric, unit: row.unit } : null };
        });
      let previewComputed = null;
      const fakeRegisterDerivedValue = async (_sb, args) => {
        previewComputed = args;
        return `preview:${AUTOMATE_VS_HIRE_METHOD.id}:${stateCode}`;
      };
      const fakeSb = { from: () => fakePreviewQuery() };
      const result = await authorEdgesFn(fakeSb, figure, {
        getMethod: getMethodFn,
        resolveInputs: fakeResolveInputs,
        registerDerivedValue: fakeRegisterDerivedValue,
      });
      if (result.ok && result.action === "authored") counts.previewed += 1;
      edges.push({
        state_code: stateCode,
        wage_id: wage.id,
        energy_id: energy.id,
        entity: entityId,
        ...result,
        preview_value: previewComputed
          ? { value: previewComputed.value, unit: previewComputed.unit, derivation: previewComputed.derivation, confidence: previewComputed.confidence }
          : null,
      });
    }
  }

  return { ...counts, edges };
}

/**
 * Run the producer over an explicit set of candidate facts (never a hidden corpus scan, every
 * candidate is named by the caller, matching the CLI's --fixtures contract).
 *
 * @param {{
 *   candidates: Array<object>,          // see state-cost-facts-envelope.mjs buildStateCostFactRow's doc
 *   fetchCapture: (url: string) => Promise<{text: string, retrieved_at: string} | null>,
 *   mode: "dry" | "apply",
 *   deps?: {
 *     readAllFn?: typeof readAll, guardedInsertFn?: typeof guardedInsert, guardedUpdateFn?: typeof guardedUpdate,
 *     guardedInsertManyFn?: typeof guardedInsertMany, registerSourceFn?: typeof registerSource,
 *     existingEntityIdSetFn?: typeof existingEntityIdSet, existingIdentifierKeySetFn?: typeof existingIdentifierKeySet,
 *     existingRefKeySetFn?: typeof existingRefKeySet, planJurisdictionEntitiesFn?: typeof planJurisdictionEntities,
 *     planJurisdictionRefsFn?: typeof planJurisdictionRefs,
 *   },
 * }} config
 */
export async function runStateCostFactsProducer({ candidates, fetchCapture, mode, deps = {} }) {
  const readAllFn = deps.readAllFn ?? readAll;
  const guardedInsertFn = deps.guardedInsertFn ?? guardedInsert;
  const guardedUpdateFn = deps.guardedUpdateFn ?? guardedUpdate;
  const guardedInsertManyFn = deps.guardedInsertManyFn ?? guardedInsertMany;
  const registerSourceFn = deps.registerSourceFn ?? registerSource;
  const entityDeps = {
    existingEntityIdSetFn: deps.existingEntityIdSetFn ?? existingEntityIdSet,
    existingIdentifierKeySetFn: deps.existingIdentifierKeySetFn ?? existingIdentifierKeySet,
    existingRefKeySetFn: deps.existingRefKeySetFn ?? existingRefKeySet,
    planJurisdictionEntitiesFn: deps.planJurisdictionEntitiesFn ?? planJurisdictionEntities,
    planJurisdictionRefsFn: deps.planJurisdictionRefsFn ?? planJurisdictionRefs,
    guardedInsertManyFn,
  };

  const perItem = [];
  const candidateRows = [];
  let refusedUngrounded = 0;
  let refusedUnratedSource = 0;

  for (const candidate of candidates) {
    const key = `${candidate.state_code}|${candidate.dimension}|${candidate.fact_label}`;
    const capture = await fetchCapture(candidate.source_url);
    const grounding = groundCandidate(candidate, capture?.text);
    if (!grounding.ok) {
      refusedUngrounded += 1;
      perItem.push({ id: key, outcome: "refused_ungrounded", verdict: grounding.reason, error: null });
      continue;
    }
    const source = await resolveSource(candidate, { mode, registerSourceFn });
    if (!source.ok) {
      refusedUnratedSource += 1;
      perItem.push({ id: key, outcome: "refused_unrated_source", verdict: source.reason, error: null });
      continue;
    }
    const regionId = candidate.region_code; // resolved to a real id below; kept as code until then
    candidateRows.push({ key, candidate, source, regionId });
  }

  let plan = { toInsert: [], toUpdate: [], unchanged: 0 };
  let inserted = 0;
  let updated = 0;
  let writtenRows = [];
  let entityCounts = { planned_entities: 0, planned_identifiers: 0, planned_refs: 0, written: false };
  let dagCounts = { pairs_found: 0, authored: 0, previewed: 0, skipped_incomplete: 0, edges: [] };

  if (candidateRows.length) {
    const regionCodes = [...new Set(candidateRows.map((c) => c.candidate.region_code))];
    const codeToId = await resolveRegionIds(regionCodes, readAllFn);
    const built = candidateRows.map(({ candidate, source }) =>
      buildStateCostFactRow(candidate, source, codeToId.get(candidate.region_code)),
    );

    const stateCodes = [...new Set(built.map((r) => r.state_code))];
    const existing = await readAllFn("state_cost_facts", "id,state_code,dimension,fact_label,value,value_numeric,unit,trend,source_id,statute_citation,effective_date,origin_class", {
      // fitness-allow: F39 (bounded, stateCodes is this run's own distinct ISO 3166-2 codes, from the CLI's named --fixtures set, real-world cardinality ~60)
      match: (qb) => qb.in("state_code", stateCodes),
    });
    plan = planUpsert(existing, built);

    for (const [i, key] of candidateRows.map((c) => c.key).entries()) {
      perItem.push({ id: key, outcome: "candidate_built", verdict: null, evidence_refs: [], error: null });
      void i;
    }

    // builtRowsWithIds: every candidate row this run touched, each carrying an `id` (real once written in
    // apply mode, a synthetic preview id in dry mode) plus its FULL shape (dimension/value_numeric/unit),
    // the one list BOTH downstream steps (entity-spine, DAG authorship) read, rather than two
    // differently-shaped lists that would have to agree by construction.
    let builtRowsWithIds = [];

    if (mode === "apply") {
      const idByNaturalKey = new Map(existing.map((e) => [naturalKey(e), e.id]));
      for (const row of plan.toInsert) {
        // guardedInsert (rule-015 path) returns { inserted: <the row read back via .single()>, snapshot }
        //, `inserted` IS the row object here, never a boolean/count (see scripts/lib/db.mjs).
        const res = await guardedInsertFn("state_cost_facts", row, { cite: CITE });
        if (res.inserted) {
          inserted += 1;
          if (res.inserted.id) {
            writtenRows.push({ id: res.inserted.id, state_code: row.state_code });
            idByNaturalKey.set(naturalKey(row), res.inserted.id);
          }
        }
      }
      for (const { id, patch } of plan.toUpdate) {
        const res = await guardedUpdateFn("state_cost_facts", (qb) => qb.eq("id", id), patch, { cite: CITE });
        updated += res.updated ?? 0;
        const existingRow = existing.find((e) => e.id === id);
        if (existingRow) writtenRows.push({ id, state_code: existingRow.state_code });
      }
      builtRowsWithIds = built
        .map((row) => ({ ...row, id: idByNaturalKey.get(naturalKey(row)) }))
        .filter((row) => row.id);
      entityCounts = await authorJurisdictionEntitiesForStates(writtenRows, "apply", entityDeps);
    } else {
      // Dry preview of BOTH downstream triggers, over what WOULD be written, a synthetic, readable
      // preview id (never a real DB id, nothing is written) so the DAG-authorship preview below has
      // something to key derivation_edges' from_pk on.
      builtRowsWithIds = built.map((row) => ({ ...row, id: `preview:${naturalKey(row)}` }));
      const previewRows = builtRowsWithIds.map((r) => ({ id: r.id, state_code: r.state_code }));
      entityCounts = await authorJurisdictionEntitiesForStates(previewRows, "dry", entityDeps);
    }

    dagCounts = await authorAutomateVsHireForStates(builtRowsWithIds, mode, entityCounts.byCode ?? new Map(), {
      sb: mode === "apply" ? deps.sb : undefined,
    });
  }

  // entityCounts.byCode is a Map (state_code -> jurisdiction entity_id), kept off the JSON-serialized
  // metrics object (a Map stringifies as "{}"), it is consumed directly above by
  // authorAutomateVsHireForStates, never surfaced in the artifact.
  const { byCode: _byCode, ...entityMetrics } = entityCounts;
  const { edges: dagEdges, ...dagMetrics } = dagCounts;

  return {
    perItem,
    metrics: {
      candidates: candidates.length,
      refused_ungrounded: refusedUngrounded,
      refused_unrated_source: refusedUnratedSource,
      to_insert: plan.toInsert.length,
      to_update: plan.toUpdate.length,
      unchanged: plan.unchanged,
      inserted,
      updated,
      ...entityMetrics,
      dag_pairs_found: dagMetrics.pairs_found,
      dag_authored: dagMetrics.authored,
      dag_previewed: dagMetrics.previewed,
      dag_skipped_incomplete: dagMetrics.skipped_incomplete,
    },
    plan,
    dagEdges,
  };
}

// ── CLI orchestration (harness artifact + kill switch) ────────────────────────────────────────────────

function buildRunArtifact({ runId, harnessVersion, startedAt, finishedAt, config, inputsRef, result, runError, fixturesPath }) {
  return buildR14HeldRunArtifact({
    harnessFamily: HARNESS_FAMILY,
    harnessVersion,
    runId,
    startedAt,
    finishedAt,
    config,
    inputsRef,
    perItem: result?.perItem,
    // dag_edges rides inside metrics (a free-form object per the harness-run schema) rather than as a new
    // top-level key: the edges (or edge previews) this run's automate_vs_hire DAG-authorship step
    // produced, per state, so a reader can see exactly what would be authored without opening the source.
    metrics: { ...(result?.metrics ?? {}), dag_edges: result?.dagEdges ?? [] },
    runError,
    fullTraceRefs: [fixturesPath],
    proposerNotes:
      "state-cost-facts-producer's first run artifact (lane STATE-COST-PRODUCER, 2026-09-25). R14 holds " +
      "live rows, every run this lane exercised was --fixtures/dry mode; ENABLED stays false until a " +
      "separate reviewed change lifts it, matching bls-oews-producer.mjs's own ENABLED history.",
  });
}

// CLI CONTRACT (R14): this entry point has EXACTLY ONE runnable path, fixture/dry, and it is the ONLY
// mode this lane ever exercises. `--apply` is recognised only to refuse it explicitly (never silently
// ignored): there is no code path from this main() to a real DB write, independent of and in addition to
// the ENABLED kill switch above. Lifting R14 requires BOTH flipping ENABLED in a reviewed change AND
// authoring a real `--apply` path here, neither exists today.
async function main() {
  const args = process.argv.slice(2);
  const applyRefusal = r14ApplyRefusalMessage(args, PRODUCER_NAME, ENABLED);
  if (applyRefusal) {
    console.log(applyRefusal);
    process.exit(0);
  }

  console.log(`${PRODUCER_NAME}: fixture/dry run (kill switch ${ENABLED ? "ON" : "OFF"}, irrelevant here, it only gates a --apply path that does not exist yet)`);

  const { result, runError, artifactPath, fixturesPath: _fixturesPath } = await runR14HeldFixtureCli({
    args,
    here: HERE,
    defaultFixturesRelPath: "fixtures/state-cost-facts-fixtures.mjs",
    defaultHarnessRunsDir: DEFAULT_HARNESS_RUNS_DIR,
    harnessFamily: HARNESS_FAMILY,
    fsiRoot: FSI_ROOT,
    governingFiles: GOVERNING_FILES,
    runFn: (fixtures) =>
      // Fully offline deps: the ONLY external read a dry run needs is `regions` (to resolve region_code ->
      // id for the row shape), answered from the fixture module's own FIXTURE_REGIONS, never the live DB.
      // No credential of any kind is read or required by this path.
      runStateCostFactsProducer({
        candidates: fixtures.FIXTURE_CANDIDATES,
        fetchCapture: fixtures.fixtureFetchCapture,
        mode: "dry",
        deps: {
          readAllFn: async (table) => {
            if (table === "regions") return fixtures.FIXTURE_REGIONS;
            if (table === "state_cost_facts") return [];
            throw new Error(`state-cost-facts-producer fixture run: no fixture reader for table "${table}"`);
          },
        },
      }),
    buildArtifactFn: (ctx) => buildRunArtifact({ ...ctx, config: { mode: "dry", fixtures: ctx.fixturesPath }, inputsRef: [ctx.fixturesPath] }),
  });

  console.log(`${PRODUCER_NAME}: wrote harness artifact ${artifactPath}`);
  console.log(`${PRODUCER_NAME}: metrics ${JSON.stringify(result?.metrics ?? {}, null, 2)}`);
  console.log(`${PRODUCER_NAME}: per_item ${JSON.stringify(result?.perItem ?? [], null, 2)}`);
  console.log(`${PRODUCER_NAME}: dag_edges (automate_vs_hire, state grain) ${JSON.stringify(result?.dagEdges ?? [], null, 2)}`);

  if (runError) {
    console.error(`${PRODUCER_NAME}: FAILED, ${runError.message}`);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}

export { resolveRegionIds, resolveSource, authorJurisdictionEntitiesForStates, buildRunArtifact, DEFAULT_HARNESS_RUNS_DIR, FSI_ROOT };
export { hashHarnessVersion, claimRunId, writeRunArtifact, GOVERNING_FILES };
