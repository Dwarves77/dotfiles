#!/usr/bin/env node
// research-walker.mjs -- lane L7 (2026-10-02). Spec 03 section 8 (the free intake and credibility
// stack): OpenAlex as the spine, plus the named grey-literature research-role sources (IEA, ICCT, a
// named university transport institute). R14 lift criterion 8: "research-role source registration
// exists and the research walker has fired at least twice by explicit dispatch, logged to
// harness_runs."
//
// CORRECTION TO THE BRIEF (recorded here, not silently fixed): brief-l7.md's READ FIRST item 1 and its
// "exact write set" both say the mint chokepoint to reuse lives in `canonical-pipeline.ts`. It does not
// -- that file is the BRIEF-GENERATION pipeline (groundBrief/sectionBrief/generateBrief), not the mint
// site. The actual "ONE sanctioned INSERT site" for `intelligence_items` is
// `src/lib/intake/mint-item.ts`'s `mintIntelligenceItem` (its own header: "THE shared mint chokepoint
// ... the ONE sanctioned INSERT site, enforced by the single-mint-chokepoint fitness function F13").
// Confirmed by grep (`grep -rn "THE single INSERT" src/lib`) and by reading the function itself (below).
// This lane reuses THAT chokepoint, never canonical-pipeline.ts, and never a second write path.
//
// RULE 16 (build mode holds the scrape cadence off). This file adds NO cron, NO workflow `schedule:`
// block, NO GitHub Actions schedule trigger anywhere. `--dispatch` is the only way any write-shaped path
// below can even be considered, and even then it fails closed without the runtime kill switch AND real
// DB credentials (see decideApply below) -- neither of which exists in a lane worktree
// (lane-common-contract: "No DB credentials exist in your worktree"), so every run this lane can
// actually execute here is DRY.
//
// RULE 17 (nothing runs alone). A dry mint call returns BEFORE mint-item.ts's single INSERT, so none of
// its post-insert flywheel steps (rule-16(a) connection discovery, rule-16(b) forward-event extraction,
// rule-16(e) entity linking, rule-16(f) timeline backfill) execute during a dry run -- there is nothing
// to disable; they are simply unreached code in dry mode, the same as every other dry mint proof in this
// repo (mint-dryrun-equivalence.npmtest.mjs's own "dryRun never INSERTs" assertion). In a live --dispatch
// apply run (not exercised by this lane; no DB credentials available here), every one of those hops
// fires UNCONDITIONALLY inside mintIntelligenceItem itself -- this lane does not need to re-wire them,
// only to call the chokepoint that already carries them. Named honestly per-hop in this lane's report.
//
// RULE 18 (rate the source through the institution class table, never hand-type a tier). The 3 named
// grey-lit sources are resolved through `scripts/lib/rate-source-by-class.mjs`'s existing
// `rateSourceByInstitutionClass`, which asks `host-authority.ts`'s `classTierForHost` -- the SAME
// resolver `state-cost-facts-producer.mjs` and `carrier-ets-surcharge-producer.mjs` already reuse. No
// tier is ever hand-typed in this file.
//
// R14, three-gate shape, same pattern as `research-assessment-producer.mjs` (read in full before this
// file was written): (1) ENABLED below (reviewed-code gate); (2) the runtime kill switch
// RESEARCH_WALKER_ENABLED, default OFF; (3) --dispatch on the CLI. Dry by default; the two required
// proof runs for R14 lift criterion 8 are BOTH dry (fixture candidates, zero network, zero DB
// credential) -- this lane does not run live or apply anywhere; a live dispatch is the coordinator's
// call, separately authorized, after this lane merges.
//
// TEST WHAT YOU BUILD. The default CLI run (no --live) reads the committed fixtures
// (fixtures/research-walker-fixtures.mjs), runs every candidate through the REAL mint chokepoint in
// dryRun mode (via mint-item.ts's own gates: idempotency, congruence, dedup, relevance, domain,
// source-link), and writes this family's own harness-run artifact.

import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hostOf } from "../../src/lib/sources/institution.ts";
import { isMainModule } from "../lib/is-main.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { rateSourceByInstitutionClass } from "../lib/rate-source-by-class.mjs";
import {
  claimRunId,
  writeRunArtifact,
  buildRunArtifactEnvelope,
  hashHarnessVersion,
} from "../lib/run-artifact.mjs";
import { writeProducerSummary } from "../producers/lib/producer-summary.mjs";
import {
  FIXTURE_GREY_LIT_SOURCES,
  FIXTURE_OPENALEX_CANDIDATES,
  FIXTURE_NOW,
} from "./fixtures/research-walker-fixtures.mjs";

loadLocalEnvFile();

export const WALKER_NAME = "research-walker";
export const HARNESS_FAMILY = "research-walker";

// Gate 1 (ADR-023 section 4 shape). Reviewed at authorship; flipping a DIFFERENT lane's live-arming
// posture is not this lane's call.
export const ENABLED = true;
const KILL_SWITCH_ENV = "RESEARCH_WALKER_ENABLED"; // Gate 2, default OFF.

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolvePath(HERE, "../..");
const DEFAULT_HARNESS_RUNS_DIR = resolvePath(FSI_ROOT, "scripts/harness-runs", HARNESS_FAMILY);

const GOVERNING_FILES = ["scripts/research/research-walker.mjs"];

const CITE = {
  skill: "environmental-policy-and-innovation",
  reason:
    "Lane L7 (spec 03 section 8, R14 lift criterion 8): registering the 3 named research-role grey-" +
    "literature sources (IEA, ICCT, a university transport institute) through the institution class " +
    "table (rule 18) so the research walker's candidate items can resolve the source-link invariant.",
};

// ── OpenAlex (spec 03S8's spine) ──────────────────────────────────────────────────────────────────────

/** Pure: narrow one OpenAlex "work" JSON object into this walker's candidate shape. Returns null when
 *  the work has no title or no resolvable URL (a real OpenAlex work can lack both a landing page and a
 *  DOI) -- a candidate with no URL can never pass the source-link invariant, so it is dropped here
 *  rather than handed to the chokepoint only to be rejected. */
export function normalizeOpenAlexWork(work) {
  const url = work?.primary_location?.landing_page_url || work?.doi || null;
  if (!url || !work?.title) return null;
  return {
    title: work.title,
    sourceUrl: url,
    publishedDate: work.publication_date ?? null,
    openAlexId: work.id ?? null,
  };
}

const OPENALEX_WORKS_URL = "https://api.openalex.org/works";

/** Minimal free OpenAlex works client (no key; polite-pool by `mailto`). Deliberately thin: this lane
 *  needs only a works-search read, not the full OpenAlex surface (authors/institutions/topics are L3's
 *  authority-score job, not this one) -- per the brief, built fresh because L3's openalex-client.mjs had
 *  not landed when this lane started; NAMED DUPLICATION RISK for the coordinator to reconcile: if L3
 *  lands its own OpenAlex works reader, this function and that one should be reconciled to one shared
 *  client rather than carried as two. `fetchFn` is injected so no caller of this file's exported
 *  functions ever reaches the real network by accident -- the default CLI run never calls this. */
export async function fetchOpenAlexWorks({ query, perPage = 10, mailto } = {}, { fetchFn = fetch } = {}) {
  const params = new URLSearchParams({ search: query, per_page: String(perPage) });
  if (mailto) params.set("mailto", mailto);
  const res = await fetchFn(`${OPENALEX_WORKS_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`OpenAlex works fetch failed: ${res.status} ${res.statusText}`);
  const body = await res.json();
  return (body?.results ?? []).map(normalizeOpenAlexWork).filter(Boolean);
}

// ── Grey-literature source registration (rule 18) ────────────────────────────────────────────────────

/** Resolve + (apply mode only) register one named grey-lit source through the institution class table.
 *  Dry mode never touches the DB (rateSourceByInstitutionClass's own contract) -- a deterministic
 *  `preview:<host>` id so this lane's dry runs are reproducible without a database. */
export async function resolveGreyLitSource({ name, url }, { mode, registerSourceFn } = {}) {
  return rateSourceByInstitutionClass({ url, name }, { mode, registerSourceFn, cite: CITE });
}

// ── Candidate -> MintPlan seed ────────────────────────────────────────────────────────────────────────

/** Pure: build the intelligence_items seed (MintPlan.seed shape, mint-item.ts) for one normalized
 *  candidate. `domain: 7` is `domainForItemType("research_finding")`'s own fixed value (confirmed by
 *  reading src/lib/domains.ts) -- mint-item.ts's own canonicalDomainOverride would correct a wrong value
 *  anyway (research_finding is in its UNCONDITIONAL_DOMAIN_TYPES set), so this is a courtesy, not a gap
 *  if it drifted. `source_id` is passed through only when the grey-lit resolution step above produced
 *  one; an OpenAlex candidate with no registered publisher host is left without one ON PURPOSE -- the
 *  chokepoint's own source-link invariant then honestly rejects it as `unsourced` rather than this file
 *  guessing a source. */
export function buildMintSeed(candidate, { sourceId = null } = {}) {
  const seed = {
    title: candidate.title,
    source_url: candidate.sourceUrl,
    item_type: "research_finding",
    domain: 7,
  };
  if (candidate.publishedDate) seed.added_date = candidate.publishedDate;
  if (sourceId) seed.source_id = sourceId;
  return seed;
}

// ── Fixture Supabase client for the dry CLI run ──────────────────────────────────────────────────────

/** Fixture-backed fake Supabase client, same four-method surface mint-item.ts's own gates call
 *  (select/eq/in/limit/maybeSingle/single/insert/upsert/then) -- mirrors
 *  mint-dryrun-equivalence.npmtest.mjs's `fakeClient()` exactly (read in full before this file was
 *  written), parameterized by the sources this run has already resolved so the source-link gate runs
 *  for real against them, never a hand-waved "assume it passes." */
export function buildFixtureSbClient({ registeredSources = [], corpus = [] } = {}) {
  let insertedSeed = null;
  return {
    insertedSeed: () => insertedSeed,
    from(table) {
      let inValues = null; // captured by the `in` method below; `limit()` then filters `registeredSources`
      // by it, so a candidate whose host was never registered genuinely misses (the real bug this fixture
      // client had before: returning the WHOLE registeredSources array regardless of the queried values,
      // which would have matched every candidate against the FIRST registered source, hollow-passing the
      // source-link invariant this file exists to exercise honestly).
      const q = {
        select() { return this; },
        eq() { return this; },
        in(_col, values) { inValues = values; return this; },
        limit() {
          if (table !== "sources") return Promise.resolve({ data: [], error: null });
          const data = inValues ? registeredSources.filter((s) => inValues.includes(s.url)) : registeredSources;
          return Promise.resolve({ data, error: null });
        },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: { id: "fixture-new-1" }, error: null }),
        insert(seed) {
          if (table === "intelligence_items") insertedSeed = seed;
          return q;
        },
        upsert() { return { then: (r) => Promise.resolve().then(r) }; },
        then(res) {
          return Promise.resolve({ data: table === "intelligence_items" ? corpus : [], error: null }).then(res);
        },
      };
      return q;
    },
  };
}

/** Call the ONE sanctioned mint chokepoint (src/lib/intake/mint-item.ts's mintIntelligenceItem) via
 *  jiti+alias -- the same resolution npmtest files already use for this exact file (its own
 *  `@/lib/...` imports are unresolvable by plain Node outside the Next.js/jiti context). Dynamic import,
 *  never a top-level one: this keeps research-walker.mjs's own static import graph free of jiti, so a
 *  no-npm test importing this module's PURE exports (normalizeOpenAlexWork, buildMintSeed,
 *  buildFixtureSbClient, decideApply) never transitively pulls in an npm package. The actual mint-gate
 *  proof against jiti lives in research-walker.npmtest.mjs, named per the lane-common-contract's own
 *  rule for exactly this shape ("anything that needs jiti ... is a *.npmtest.mjs"). */
export async function mintCandidateDryRun(sb, seed, { origin = "first_fetch" } = {}) {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolvePath(FSI_ROOT, "src") } });
  const { mintIntelligenceItem } = await jiti.import("../../src/lib/intake/mint-item.ts");
  return mintIntelligenceItem(sb, { seed, origin }, { dryRun: true });
}

// ── R14 gate ───────────────────────────────────────────────────────────────────────────────────────────

export function decideApply({ dispatch, enabled, killSwitchOn, hasCreds }) {
  if (!dispatch) return { canWrite: false, reason: "dry run (no --dispatch) -- fetch/plan + mint-gate dry-run only, nothing written" };
  if (!enabled) {
    return { canWrite: false, reason: "REFUSING -- the source-level ENABLED constant is false. Arming is a later, separate, reviewed commit." };
  }
  if (!killSwitchOn) {
    return { canWrite: false, reason: `REFUSING -- kill switch ${KILL_SWITCH_ENV} is OFF (set it to "1" to arm this walker)` };
  }
  if (!hasCreds) {
    return { canWrite: false, reason: "REFUSING -- a live apply requires DB creds (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) -- none found" };
  }
  return { canWrite: true, reason: "all gates satisfied" };
}

// ── CLI orchestration ────────────────────────────────────────────────────────────────────────────────

async function runWalk({ greyLitSources, openAlexCandidates, mode }) {
  const perItem = [];
  const greyLitResults = [];
  const registeredSources = [];

  for (const src of greyLitSources) {
    const resolved = await resolveGreyLitSource(src, { mode: "dry" }); // registration itself is always
    // previewed in this lane (no DB creds exist in a lane worktree to ever reach "apply" here); see
    // decideApply above for why a real --dispatch apply can never complete in this worktree.
    greyLitResults.push({ name: src.name, url: src.url, ...resolved });
    if (resolved.ok) {
      registeredSources.push({ id: resolved.source_id, url: src.url });
      perItem.push({ id: src.url, outcome: `source-resolved (tier ${resolved.tier})`, verdict: null, error: null });
    } else {
      perItem.push({ id: src.url, outcome: "source-resolution-failed", verdict: resolved.reason, error: resolved.reason });
    }
  }

  const candidates = [
    ...greyLitSources.map((src, i) => ({
      title: `Candidate from ${src.name}: ${src.url.split("/").pop()}`,
      sourceUrl: src.url,
      publishedDate: null,
      sourceHost: hostOf(src.url),
      _greyLitIndex: i,
    })),
    ...openAlexCandidates,
  ];

  const sb = buildFixtureSbClient({ registeredSources, corpus: [] });
  const mintOutcomes = [];
  for (const candidate of candidates) {
    const matchedSource = registeredSources.find((s) => s.url === candidate.sourceUrl);
    const seed = buildMintSeed(candidate, { sourceId: matchedSource?.id ?? null });
    const result = await mintCandidateDryRun(sb, seed);
    mintOutcomes.push({ candidate, seed, result });
    // House style (rule 022) forbids em/en dashes in authored prose, including in a committed run
    // artifact; mint-item.ts's own error text (verbatim, not ours to edit) uses one, so it is
    // normalized to a comma here ONLY for the artifact/report record -- the console log above (and the
    // real `result.error` every test asserts on) keeps mint-item.ts's exact string.
    const sanitize = (s) => (typeof s === "string" ? s.replace(/[—–]/g, ",") : s); // glyph:verbatim
    perItem.push({
      id: candidate.sourceUrl,
      outcome: result.ok ? `would_mint:${result.action}` : `rejected:${result.action}`,
      verdict: sanitize(result.error) ?? null,
      error: result.ok ? null : sanitize(result.error) ?? "rejected",
    });
  }

  const wouldMint = mintOutcomes.filter((o) => o.result.ok).length;
  const rejected = mintOutcomes.length - wouldMint;

  return {
    perItem,
    metrics: {
      grey_lit_sources: greyLitSources.length,
      grey_lit_resolved: greyLitResults.filter((r) => r.ok).length,
      candidates: candidates.length,
      would_mint: wouldMint,
      rejected_unsourced: rejected,
      mode,
    },
    greyLitResults,
    mintOutcomes,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dispatch = args.includes("--dispatch");
  const live = args.includes("--live");

  const decision = decideApply({
    dispatch,
    enabled: ENABLED,
    killSwitchOn: process.env[KILL_SWITCH_ENV] === "1",
    hasCreds: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
  if (dispatch && !decision.canWrite) {
    console.log(`${WALKER_NAME}: ${decision.reason}`);
  }

  const startedAt = new Date().toISOString();

  if (live) {
    console.error(`${WALKER_NAME}: --live requires a real network fetch and (for apply) DB creds; ` +
      "not exercised by this lane's own CLI runs (no DB credentials exist in this worktree). " +
      "A live dispatch is a separately-authorized coordinator action after this lane merges.");
  }

  console.log(`${WALKER_NAME}: fixture run (no --live), mode=dry -- zero network, zero DB credential.`);
  const result = await runWalk({
    greyLitSources: FIXTURE_GREY_LIT_SOURCES,
    openAlexCandidates: FIXTURE_OPENALEX_CANDIDATES.map(normalizeOpenAlexWork).filter(Boolean),
    mode: "dry",
  });

  console.log(`${WALKER_NAME}: metrics ${JSON.stringify(result.metrics)}`);
  for (const item of result.perItem) {
    console.log(`  ${item.id}: ${item.outcome}${item.error ? ` -- ${item.error}` : ""}`);
  }

  const harnessVersion = hashHarnessVersion(GOVERNING_FILES, FSI_ROOT);
  const runId = claimRunId(DEFAULT_HARNESS_RUNS_DIR, HARNESS_FAMILY);
  const artifact = buildRunArtifactEnvelope({
    family: HARNESS_FAMILY,
    harnessVersion,
    runId,
    startedAt,
    config: { mode: "dry", source: "fixtures/research-walker-fixtures.mjs", dispatch },
    inputsRef: ["scripts/research/fixtures/research-walker-fixtures.mjs"],
    perItem: result.perItem,
    metrics: result.metrics,
    defectsFound: [],
    fullTraceRefs: ["scripts/research/fixtures/research-walker-fixtures.mjs"],
    proposerNotes:
      "research-walker's run artifact (lane L7, 2026-10-02, R14 lift criterion 8). Dry/fixture run: " +
      "resolves the 3 named grey-lit sources through the institution class table (rule 18), then runs " +
      "every candidate (grey-lit + OpenAlex-fixture) through the real mint chokepoint " +
      "(mint-item.ts's mintIntelligenceItem) in dryRun mode. An OpenAlex candidate whose publisher host " +
      "is not one of the 3 named registered sources is correctly rejected `unsourced` by the chokepoint's " +
      "own source-link invariant -- this lane registers only the 3 named sources, not every OpenAlex " +
      "publisher host (out of scope; that is an L3/authority-score-scale concern, not this lane's). " +
      "Zero flywheel post-insert hops fire in dry mode (mint-item.ts returns before its single INSERT); " +
      "a live --dispatch apply run (not exercised here, no DB credentials in this worktree) would run " +
      "every one of them unconditionally inside the same chokepoint.",
  });
  const artifactPath = writeRunArtifact(DEFAULT_HARNESS_RUNS_DIR, artifact);
  console.log(`${WALKER_NAME}: wrote harness artifact ${artifactPath}`);

  writeProducerSummary({
    producer: WALKER_NAME,
    status: "ok",
    rows_changed: 0,
    counts: result.metrics,
  });
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
