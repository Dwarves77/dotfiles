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
// read it... a runtime that ends without triggering its downstream is a defect in the runtime"). The
// ENTITY-SPINE connection every other jurisdiction-bearing table gets (backfill-entities.mjs's JURISDICTION
// kind, "every occurrence becomes an entity_refs row on the table it came from"): this producer mints/links
// a jurisdiction entity for every state_code its run WRITES, through the SAME planJurisdictionEntities /
// planJurisdictionRefs planners the region-level backfill uses (src/lib/entities/entity-plan.mjs), scoped
// to `ref_table: "state_cost_facts"`. The wage-versus-automation derived value this producer once also
// authored was retired by ADR-043 (operator ruling 2026-10-03); the wage and energy facts themselves stay.

import { readAll, guardedInsert, guardedUpdate, guardedInsertMany, registerSource } from "../../lib/db.mjs";
import { groundCandidate, buildStateCostFactRow, planUpsert, naturalKey } from "../../../src/lib/regional/state-cost-facts-envelope.mjs";
import { makeResolveSource } from "../../lib/rate-source-by-class.mjs";
import { r14ApplyRefusalMessage, buildR14HeldRunArtifact, runR14HeldFixtureCli } from "../../lib/r14-held-producer-cli.mjs";
import { planJurisdictionEntities, planJurisdictionRefs } from "../../../src/lib/entities/entity-plan.mjs";
import { existingEntityIdSet, existingIdentifierKeySet, existingRefKeySet } from "../../entities/backfill-entities.mjs";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../../harness-runs/governing-files.mjs";
import { isMainModule } from "../../lib/is-main.mjs";
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
  // byCode (state_code -> jurisdiction entity_id) is returned for the caller's own use.
  return { ...counts, byCode };
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

    if (mode === "apply") {
      for (const row of plan.toInsert) {
        // guardedInsert (rule-015 path) returns { inserted: <the row read back via .single()>, snapshot }
        //, `inserted` IS the row object here, never a boolean/count (see scripts/lib/db.mjs).
        const res = await guardedInsertFn("state_cost_facts", row, { cite: CITE });
        if (res.inserted) {
          inserted += 1;
          if (res.inserted.id) writtenRows.push({ id: res.inserted.id, state_code: row.state_code });
        }
      }
      for (const { id, patch } of plan.toUpdate) {
        const res = await guardedUpdateFn("state_cost_facts", (qb) => qb.eq("id", id), patch, { cite: CITE });
        updated += res.updated ?? 0;
        const existingRow = existing.find((e) => e.id === id);
        if (existingRow) writtenRows.push({ id, state_code: existingRow.state_code });
      }
      entityCounts = await authorJurisdictionEntitiesForStates(writtenRows, "apply", entityDeps);
    } else {
      // Dry preview of the downstream trigger over what WOULD be written: a synthetic, readable preview id
      // (never a real DB id, nothing is written).
      const previewRows = built.map((row) => ({ id: `preview:${naturalKey(row)}`, state_code: row.state_code }));
      entityCounts = await authorJurisdictionEntitiesForStates(previewRows, "dry", entityDeps);
    }
  }

  // entityCounts.byCode is a Map (state_code -> jurisdiction entity_id), kept off the JSON-serialized
  // metrics object (a Map stringifies as "{}").
  const { byCode: _byCode, ...entityMetrics } = entityCounts;

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
    },
    plan,
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
    metrics: result?.metrics ?? {},
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
