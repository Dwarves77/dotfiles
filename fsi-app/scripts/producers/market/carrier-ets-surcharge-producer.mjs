#!/usr/bin/env node

import { hostOf } from "../../../src/lib/sources/institution.ts";
import {
  groundCandidate,
  buildCarrierEtsSurchargeRow,
  buildEtsProxyBand,
} from "../../../src/lib/market/carrier-ets-surcharge-envelope.mjs";
import { planMarketSeriesUpsert } from "../../../src/lib/market/write-market-series.mjs";
import { producerFor } from "../../../src/lib/market/series-registry.mjs";
import { authorMarketSeriesDeltaEdges } from "./author-market-series-delta.mjs";
import { makeResolveSource } from "../../lib/rate-source-by-class.mjs";
import { r14ApplyRefusalMessage, buildR14HeldRunArtifact, runR14HeldFixtureCli } from "../../lib/r14-held-producer-cli.mjs";
import { GOVERNING_FILES } from "../../harness-runs/governing-files.mjs";
import { isMainModule } from "../../lib/is-main.mjs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

// Resolve one candidate's source: tier from classTierForHost (the institution class table) FIRST, then
// register (apply) or preview (dry/fixture) the source. Never falls back to a hand-typed tier. Built by
// the shared makeResolveSource factory (scripts/lib/rate-source-by-class.mjs, coordinator directive
// 2026-09-28, F45 duplicate-code follow-up): this producer's own contribution is only its config
// (candidate field names, cite, carrier-slug sourceKeyFor), never a hand-written wrapper body.
const resolveSource = makeResolveSource({
  urlField: "sourceUrl",
  nameField: "carrierName",
  cite: CITE,
  sourceKeyFor: (host) => `${host.replace(/\./g, "_")}_ets_notice`,
});

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
    runError,
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
