#!/usr/bin/env node
// carrier-ets-surcharge-producer.mjs, lane ETS-PROXY. Builds the producer carbon-cost-per-feu.mjs has
// been waiting on: its own header names the gap plainly (GAP.NO_CARBON_PRICE, "market_series's eex-eua
// producer is an undocumented stub... zero live rows"). Decisions 1/2 (2026-09-24/25, build-plan-2026-09-25
// workstream 11; tool-gap-1 register row 66) rule the source this lane builds instead of EEX: "no
// freight-rate tracking; carbon cost per container/tonne from carrier-published ETS surcharges, per
// carrier/period/source, never blended without a range, client override labelled client-supplied, EEX
// licence deferred." EEX stays exactly as documented in series-registry.mjs (a licensed venue, no producer,
// not evaluated further), this producer is the ruled alternative, not a replacement attempt at EEX itself.
//
// R14 HOLD (operator, 2026-09-25: "we are NOT updating the data on the site, we are building the tools
// that manage that data first"). Same three-part enforcement as state-cost-facts-producer.mjs (the newest
// precedent for a brand-new producer under this hold):
//   1. ENABLED=false below. Flipping it is a later, separate, reviewed commit, never a runtime flag.
//   2. This lane's own tests and CLI exercise ONLY the fixture/dry path; no test or CLI invocation reaches
//      a real network fetch or a real DB credential.
//   3. main() below has NO live-write code path at all: --apply is recognised only to refuse it
//      explicitly, matching state-cost-facts-producer.mjs's own posture exactly.
//
// SOURCES THROUGH THE REGISTRY, TIER FROM THE INSTITUTION CLASS TABLE (CLAUDE.md rule 18). Every carrier
// host this producer touches resolves through `classTierForHost(host, name)` (src/lib/sources/
// host-authority.ts, SC-13's deterministic class table): a carrier's own corporate site, publishing its
// own surcharge notice, is the textbook `company` class (D14 ruling, "any host with a stored name and no
// earlier class match, since its own site is a primary only for its own announcements") -> T7. This is
// the HONEST rating rule 18 requires, never a hand-typed or guessed tier, and never a refusal on tier
// alone (market_series carries no per-item authority floor, unlike a regulatory FACT's grounding stamp).
// A host the class table genuinely cannot classify (e.g. malformed source_url) is refused, never guessed.
//
// GROUNDING (CLAUDE.md rule 18 / ADR-016). Every candidate's claimed surcharge figure must be a verbatim
// span in its own captured notice text (carrier-ets-surcharge-envelope.mjs's groundCandidate) or it is
// refused, never invented.
//
// NEVER BLENDED WITHOUT A RANGE (decision 1/2). This producer writes ONE market_series row PER CARRIER
// PER LANE PER PERIOD (series_key `carrier-ets:<carrier>[-<lane>]`) through the SAME idempotent upsert
// planner (`planMarketSeriesUpsert`, write-market-series.mjs) every other market_series producer already
// uses, reused, not reimplemented, per "reuse the existing market producers' pattern." It never averages
// carriers into a single row. `buildEtsProxyBand` (the envelope module) is the separate, explicit
// cross-carrier band a caller uses when it wants ONE representative figure for a period; this producer's
// fixture run demonstrates that band feeding carbon-cost-per-feu.mjs's `carbonPrice` input directly,
// closing GAP.NO_CARBON_PRICE (see runEtsProxyProducer's returned `proxyBand` and this lane's session log
// for the worked example).
//
// DOWNSTREAM TRIGGER (rule 17). The SAME market_series_delta DAG authorship every other market_series
// producer calls after its own write (`authorMarketSeriesDeltaEdges`, author-market-series-delta.mjs), // reused unmodified, never a second implementation. R14 holds this producer to fixture/dry mode, so the
// fixture CLI run below exercises the "apply" branch of that shared module against INJECTED, fully
// offline deps (no live DB contact, no credential of any kind), proving the wiring fires rather than
// merely asserting it exists (rule 15: execution over existence).

import { hostOf } from "../../../src/lib/sources/institution.ts";
import {
  groundCandidate,
  buildCarrierEtsSurchargeRow,
  buildEtsProxyBand,
} from "../../../src/lib/market/carrier-ets-surcharge-envelope.mjs";
import { planMarketSeriesUpsert } from "../../../src/lib/market/write-market-series.mjs";
import { producerFor } from "../../../src/lib/market/series-registry.mjs";
import { authorMarketSeriesDeltaEdges } from "./author-market-series-delta.mjs";
import { rateSourceByInstitutionClass } from "../../lib/rate-source-by-class.mjs";
import { r14ApplyRefusalMessage, buildDefectsFromRefusals, buildR14HeldRunArtifact, runR14HeldFixtureCli } from "../../lib/r14-held-producer-cli.mjs";
import { writeRunArtifact, hashHarnessVersion, claimRunId } from "../../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../../harness-runs/governing-files.mjs";
import { isMainModule } from "../../lib/is-main.mjs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

// KILL SWITCH, default OFF (R14 hold). Flipping this is a reviewed, dated change, matching
// state-cost-facts-producer.mjs's ENABLED history exactly; it is NOT flipped by this lane.
export const ENABLED = false;

export const PRODUCER_NAME = "carrier-ets-surcharge";
export const HARNESS_FAMILY = "carrier-ets-proxy";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolvePath(HERE, "../../..");
const DEFAULT_HARNESS_RUNS_DIR = resolvePath(FSI_ROOT, "scripts/harness-runs", HARNESS_FAMILY);

const REGISTRY_ENTRY = producerFor("carrier-ets");

const CITE = {
  skill: "environmental-policy-and-innovation",
  reason:
    "Lane ETS-PROXY (workstream 11, decisions 1/2, 2026-09-24/25): carbon-cost-per-feu.mjs's " +
    "GAP.NO_CARBON_PRICE named market_series' eex-eua stub (undocumented, no producer, licence not " +
    "evaluated) as the missing input. EEX itself stays licence-deferred; carrier-published ETS surcharge " +
    "notices are the ruled proxy. Each carrier host resolved through classTierForHost (never hand-typed), " +
    "each candidate grounded verbatim per its own capture, each carrier/period kept its own row (never " +
    "blended without a range).",
};

/**
 * Resolve one candidate's source: tier from classTierForHost (the institution class table) FIRST, then
 * register (apply) or preview (dry/fixture) the source. Never falls back to a hand-typed tier. Thin
 * wrapper over the shared `rateSourceByInstitutionClass` (scripts/lib/rate-source-by-class.mjs, extracted
 * from this function and state-cost-facts-producer.mjs's identical shape, F45 duplicate-code gate), * this producer's own contribution is just mapping ITS candidate field names (`sourceUrl`/`carrierName`)
 * and its own carrier-slug `sourceKeyFor`.
 * @returns {Promise<{ok: true, source_id: string, source_key: string|null, tier: number} | {ok: false, reason: string}>}
 */
async function resolveSource(candidate, { mode, registerSourceFn }) {
  return rateSourceByInstitutionClass(
    { url: candidate.sourceUrl, name: candidate.carrierName },
    { mode, registerSourceFn, cite: CITE, sourceKeyFor: (host) => `${host.replace(/\./g, "_")}_ets_notice` },
  );
}

/**
 * Run the producer over an explicit set of candidate surcharge notices (never a hidden corpus scan,
 * every candidate is named by the caller, matching the CLI's --fixtures contract).
 *
 * @param {{
 *   candidates: Array<object>,           // carrier-ets-surcharge-fixtures.mjs FIXTURE_CANDIDATES shape
 *   fetchCapture: (url: string) => Promise<{text: string, retrieved_at: string} | null>,
 *   existingRows: Array<{id:string, series_key:string, reference_period:string|null}>,
 *   mode: "dry" | "apply",
 *   deps?: { registerSourceFn?: Function, authorMarketSeriesDeltaEdgesFn?: Function, trace?: boolean },
 * }} config
 */
export async function runEtsProxyProducer({ candidates, fetchCapture, existingRows, mode, deps = {} }) {
  const authorFn = deps.authorMarketSeriesDeltaEdgesFn ?? authorMarketSeriesDeltaEdges;

  const perItem = [];
  const builtRows = [];
  let refusedUngrounded = 0;
  let refusedUnratedSource = 0;

  for (const candidate of candidates) {
    const key = `${candidate.carrierName}|${candidate.tradeLane ?? ""}|${candidate.effectivePeriod}`;
    const capture = await fetchCapture(candidate.sourceUrl);
    const grounding = groundCandidate(candidate, capture?.text);
    if (!grounding.ok) {
      refusedUngrounded += 1;
      perItem.push({ id: key, outcome: "refused_ungrounded", verdict: grounding.reason, error: null });
      continue;
    }
    const source = await resolveSource(candidate, { mode, registerSourceFn: deps.registerSourceFn });
    if (!source.ok) {
      refusedUnratedSource += 1;
      perItem.push({ id: key, outcome: "refused_unrated_source", verdict: source.reason, error: null });
      continue;
    }
    const row = buildCarrierEtsSurchargeRow(candidate, source);
    builtRows.push(row);
    perItem.push({ id: key, outcome: "candidate_built", verdict: null, evidence_refs: [row.series_key], error: null });
  }

  const { toCreate, toUpdate, skippedNoReferencePeriod } = planMarketSeriesUpsert(existingRows ?? [], builtRows);

  // NEVER BLENDED WITHOUT A RANGE. Group this run's built rows by reference_period and hand each group's
  // observed values (never invented) to buildEtsProxyBand. A period with fewer than 2 carrier rows is not
  // a cross-carrier proxy (buildEtsProxyBand returns null for it, never a fake band from one observation).
  const byPeriod = new Map();
  for (const row of builtRows) {
    if (!byPeriod.has(row.reference_period)) byPeriod.set(row.reference_period, []);
    byPeriod.get(row.reference_period).push(row);
  }
  const proxyBands = {};
  for (const [period, rows] of byPeriod) {
    const band = buildEtsProxyBand(rows);
    if (band) proxyBands[period] = band;
  }

  // DOWNSTREAM TRIGGER (rule 17), exercised for real against this run's own distinct series_keys, even in
  // fixture/dry mode, the caller (main() below) injects fully offline deps so "apply" mode's real branch
  // runs with zero live DB contact, proving the wiring rather than only asserting it (rule 15).
  const touchedSeriesKeys = new Set([...toCreate, ...toUpdate.map((u) => u.patch)].map((r) => r.series_key).filter(Boolean));
  const authorMode = mode === "apply" || deps.forceDownstreamTrigger ? "apply" : "dry";
  const authorCounts = await authorFn(touchedSeriesKeys, authorMode, { trace: deps.trace });

  return {
    perItem,
    plan: { toCreate, toUpdate, skippedNoReferencePeriod },
    proxyBands,
    authorCounts,
    metrics: {
      candidates: candidates.length,
      refused_ungrounded: refusedUngrounded,
      refused_unrated_source: refusedUnratedSource,
      to_create: toCreate.length,
      to_update: toUpdate.length,
      skipped_no_reference_period: skippedNoReferencePeriod.length,
      proxy_bands_built: Object.keys(proxyBands).length,
      ...authorCounts,
    },
  };
}

// ── CLI orchestration (harness artifact + kill switch) ────────────────────────────────────────────────

function buildRunArtifact({ runId, harnessVersion, startedAt, finishedAt, result, runError, fixturesPath }) {
  const defectsFound = buildDefectsFromRefusals(
    result?.perItem,
    { unratedOutcome: "refused_unrated_source", unratedRootCause: "host not present in the institution class table (host-authority.ts)" },
    runError,
  );
  return buildR14HeldRunArtifact({
    harnessFamily: HARNESS_FAMILY,
    harnessVersion,
    runId,
    startedAt,
    finishedAt,
    config: { mode: "dry", fixtures: fixturesPath },
    inputsRef: [fixturesPath],
    perItem: result?.perItem,
    metrics: result?.metrics,
    defectsFound,
    fullTraceRefs: [fixturesPath],
    proposerNotes:
      "carrier-ets-surcharge-producer's first run artifact (lane ETS-PROXY, 2026-09-28). R14 holds live " +
      "rows; this run is fixtures/dry, downstream DAG authorship exercised against injected offline deps " +
      "(never a live DB). ENABLED stays false until a separate reviewed change lifts it, matching " +
      "state-cost-facts-producer.mjs's own ENABLED history.",
  });
}

// Fully offline fixture deps for the downstream-authorship demonstration: NO live DB read/write. Every
// series_key this run touched gets 2 synthetic prior-week rows so market_series_delta's own
// insufficientHistory gate does not fire, and authorEdgesFn always reports a successful, idempotent
// authorship, exercising authorMarketSeriesDeltaEdges's real "apply" branch end to end offline.
function fixtureDownstreamDeps(trace) {
  const authored = new Set();
  return {
    trace,
    registerSourceFn: async (source, _opts) => ({
      source_id: `fixture-source:${source.url}`,
      source_key: `${hostOf(source.url).replace(/\./g, "_")}_ets_notice`,
    }),
    authorMarketSeriesDeltaEdgesFn: async (seriesKeys, mode, deps) => {
      const fakeReadAllFn = async (_table, _cols, { match } = {}) => {
        // Two rows one week apart, same unit/currency, so computeSeriesDeltas can compute a real delta.
        const rows = [
          { id: "fixture-row-1", series_key: "__placeholder__", reference_period: "2026-09-24", as_at_date: "2026-09-24", value_numeric: 200, unit: "USD/FEU", currency: "USD", origin_class: "official" },
          { id: "fixture-row-2", series_key: "__placeholder__", reference_period: "2026-10-01", as_at_date: "2026-10-01", value_numeric: 210, unit: "USD/FEU", currency: "USD", origin_class: "official" },
        ];
        void match;
        return rows;
      };
      const fakeAuthorEdgesFn = async (_sb, args) => {
        const naturalKey = `${args.table}:${args.id}:${args.method.id}`;
        if (authored.has(naturalKey)) return { ok: true, action: "skipped-already-authored" };
        authored.add(naturalKey);
        return { ok: true, action: "inserted", valueId: `fixture-value:${naturalKey}` };
      };
      return authorMarketSeriesDeltaEdges(seriesKeys, mode, {
        ...deps,
        readAllFn: fakeReadAllFn,
        authorEdgesFn: fakeAuthorEdgesFn,
        sb: {},
      });
    },
    forceDownstreamTrigger: true,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const applyRefusal = r14ApplyRefusalMessage(args, PRODUCER_NAME, ENABLED);
  if (applyRefusal) {
    console.log(applyRefusal);
    process.exit(0);
  }

  console.log(`${PRODUCER_NAME}: fixture/dry run (kill switch ${ENABLED ? "ON" : "OFF"}, irrelevant here, no --apply path exists yet)`);

  const { result, runError, artifactPath } = await runR14HeldFixtureCli({
    args,
    here: HERE,
    defaultFixturesRelPath: "fixtures/carrier-ets-surcharge-fixtures.mjs",
    defaultHarnessRunsDir: DEFAULT_HARNESS_RUNS_DIR,
    harnessFamily: HARNESS_FAMILY,
    fsiRoot: FSI_ROOT,
    governingFiles: GOVERNING_FILES,
    resolvePathFn: resolvePath,
    pathToFileURLFn: pathToFileURL,
    mkdirSyncFn: mkdirSync,
    claimRunIdFn: claimRunId,
    hashHarnessVersionFn: hashHarnessVersion,
    writeRunArtifactFn: writeRunArtifact,
    runFn: (fixtures, trace) =>
      runEtsProxyProducer({
        candidates: fixtures.FIXTURE_CANDIDATES,
        fetchCapture: fixtures.fixtureFetchCapture,
        existingRows: [],
        mode: "dry",
        deps: fixtureDownstreamDeps(trace),
      }),
    buildArtifactFn: buildRunArtifact,
  });

  console.log(`${PRODUCER_NAME}: wrote harness artifact ${artifactPath}`);
  console.log(`${PRODUCER_NAME}: metrics ${JSON.stringify(result?.metrics ?? {}, null, 2)}`);
  console.log(`${PRODUCER_NAME}: would create ${result?.plan?.toCreate?.length ?? 0} row(s):`);
  for (const r of result?.plan?.toCreate ?? []) {
    console.log(`  would create  ${r.series_key} @ ${r.reference_period}  ${r.value_numeric} ${r.unit}`);
  }
  console.log(`${PRODUCER_NAME}: proxy bands built (never blended without a range): ${JSON.stringify(result?.proxyBands ?? {}, null, 2)}`);
  console.log(
    `${PRODUCER_NAME}: to land this run's artifact in harness_runs, run ` +
      `\`node scripts/lib/record-harness-run.mjs --file ${artifactPath}\` (best-effort; no-ops cleanly ` +
      "with no SUPABASE_* creds set, exactly this lane's SELECT-only/R14 posture).",
  );

  if (runError) {
    console.error(`${PRODUCER_NAME}: FAILED, ${runError.message}`);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { resolveSource, buildRunArtifact, fixtureDownstreamDeps, DEFAULT_HARNESS_RUNS_DIR, FSI_ROOT, REGISTRY_ENTRY };
