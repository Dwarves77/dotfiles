#!/usr/bin/env node
// backfill-themes.mjs - Haiku classification backfill for research_finding rows with theme IS NULL
// (Lane L8, 2026-10-02). Spec 03's own-finding (docs/specs/03-research.md section 10, "Theme
// rendering"): a finding matching no theme regex is counted in the ledger's tiles (total/band counts,
// ResearchLedger.tsx) but rendered in ZERO theme cards - verified content silently invisible. This
// backfill closes the existing null rows (write side); ResearchThemeCards.tsx's new Unclassified band
// (same lane) keeps a future classification miss visible rather than invisible again (the spec's own
// design intent: a permanent safety net, not a one-time cleanup artifact).
//
// MANDATORY FIRST STEP (coordinator ruling, 2026-10-02, this lane's report): the plan's own carried
// count ("47 of 36 research_finding rows... have null theme") is arithmetically impossible as written
// (47 cannot be a subset of 36) - CLAUDE.md rule 14, a finding is a hypothesis until verified. The
// DB-executor re-verified counts (read-only SELECT, 2026-10-02): research_finding total = 49, themed =
// 2, unthemed = 47 - the plan's "47" numerator was right, its "36" denominator was stale; the real
// denominator is 49. See this lane's session-log addendum for the `[CONFIRMED - DB executor read]`
// figures; this script's own fixture set (fixtures/backfill-themes-fixtures.mjs) is sized to 47 to
// match.
//
// WHY HAIKU, NOT taxonomy.mjs's REGEX FALLBACK: a backfill classification is a REAL call against the
// item's own text, scored against the closed DB vocabulary (metadata-vocab.ts DB_THEME_VALUE_LIST  - 
// the single home, migration 102's CHECK constraint), never a default guess and never a silent
// first-enum-value fallback (CLAUDE.md rule 2). A genuinely ambiguous item gets `unclassified`
// (this script's own sentinel outcome, banked to intelligence_items.theme_candidate per migration
// 136's capture-not-null convention - the DB `theme` column itself stays NULL, never force-fit to one
// of the 7 real values).
//
// PRIOR ART READ FIRST (lane-common-contract section 6): `scripts/_archive/_wave-alpha/backfill-themes.mjs`
// (SUPERSEDED - a deterministic topic-tag-candidate map over a disjoint population and a different
// mechanism; its guardedUpdate + read-back-verify shape is the pattern this script's own --apply arm
// would reuse when the coordinator authorizes it, its matching logic is not reused). The classification
// SCHEMA/prompt shape below (JSON-object-only system prompt, regex JSON extraction, shape validation)
// mirrors `src/app/admin/sources/recommend-classification/route.ts` and `bulk-classify/route.ts`; the
// TRANSPORT does not - those routes call the Anthropic SDK package directly (CLAUDE.md AGENT ARCHITECTURE
// permits that only inside the listed routes/wrappers). A script instead routes through the ONE
// canonical script-side call site, `streamMessagesText` (`src/lib/agent/anthropic-stream.mjs`;
// discipline rule 016, "Canonical Anthropic path") - plain ESM / node-builtins-only (its own import
// graph is just `./anthropic-error.mjs`, zero further imports), so this stays portable to the no-npm
// discipline glob (`.discipline/run-test-suite.sh`) without a `*.npmtest.mjs` carve-out.
//
// R14 three-gate shape: `ENABLED` (reviewed-code kill switch, false below - this lane does not run the
// live pass), a runtime check mirroring it, and `--apply` recognised only to refuse it explicitly
// (`r14ApplyRefusalMessage`, `scripts/lib/r14-held-producer-cli.mjs`). Dry by default: classifies
// against the fixtures module and reports what it WOULD write. No live LLM call, no DB credential, in
// the fixture/dry path ever. The live `--apply` pass (real Haiku calls + guardedUpdateByIds writes) is
// a separate, explicitly-authorized coordinator dispatch - this script recognizes the flag only to say
// so, consistent with "tools before data" (R14).
//
// HARNESS/FLYWHEEL (rule 17): the coordinator's directive (2026-10-02, mid-lane) overruled this
// script's own earlier "registers no harness family" judgment - see record-harness-run.mjs's
// recordDryHarnessRun() below. A "theme-backfill" harness family IS registered
// (scripts/harness-runs/theme-backfill/family.json) and fired once via --fire-harness, proving the
// downstream Research theme-facet data path recomputes correctly from this run's output, not only that
// the classification call succeeded. See this lane's session-log addendum, Confirmation 1, for the
// full reasoning (including why the earlier "likely not needed" judgment was corrected in place rather
// than silently dropped, per CLAUDE.md rule 13's corollary).
//
// USAGE:
//   node scripts/research/backfill-themes.mjs                 # dry: fixtures only, reports
//   node scripts/research/backfill-themes.mjs --fixtures <path>  # dry against a different fixture module
//   node scripts/research/backfill-themes.mjs --apply          # recognised, refused, exit 0 (R14 hold)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DB_THEME_VALUE_LIST } from "../../src/lib/agent/metadata-vocab.ts";
// HAIKU_MODEL - the shared model-id config every other Haiku caller in this repo reads from
// (recommend-classification/route.ts, bulk-classify/route.ts, first-fetch-classify.ts's own copy, and
// haiku-classify.ts, which now re-exports this same value - see src/lib/llm/model-ids.mjs's header).
// Plain-ESM, zero npm dependency, so importing it here never pulls the Anthropic SDK package into this
// script's (or its test's) import graph. Never a hardcoded literal at the call site below.
import { HAIKU_MODEL } from "../../src/lib/llm/model-ids.mjs";
// streamMessagesText - the ONE canonical script-side call site for a Claude API call (discipline rule
// 016; CLAUDE.md AGENT ARCHITECTURE "permitted routes"). Its own URL-building is the single home F46
// (external-host-home) requires; a script never builds that URL itself. Its import graph is just
// ./anthropic-error.mjs (zero further imports), so this stays portable to the no-npm discipline glob.
import { streamMessagesText } from "../../src/lib/agent/anthropic-stream.mjs";
import { r14ApplyRefusalMessage } from "../lib/r14-held-producer-cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { claimRunId, hashHarnessVersion, writeRunArtifact, buildRunArtifactEnvelope } from "../lib/run-artifact.mjs";
import { recordHarnessRun } from "../lib/record-harness-run.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Reviewed-code kill switch (R14): false while this lane holds the live pass for a separate,
 *  explicitly-authorized coordinator dispatch. Flip only alongside that authorization - never as part
 *  of this lane's own commit (lane-common-contract: no code-only "enablement" sleight of hand). */
export const ENABLED = false;

/** The honest "matches none of the seven well" outcome - never a guessed default (CLAUDE.md rule 2). */
export const UNCLASSIFIED = "unclassified";

export const CITE = Object.freeze({
  skill: "environmental-policy-and-innovation",
  reason:
    "Lane L8 (2026-10-02): backfill intelligence_items.theme for research_finding rows where theme IS " +
    "NULL, via a real Haiku classification against the item's own text, scored against the closed " +
    "DB_THEME_VALUE_LIST vocabulary (metadata-vocab.ts). A genuinely ambiguous item is left theme=NULL " +
    "with theme_candidate='unclassified' (migration 136 capture-not-null), never a forced pick - the " +
    "Unclassified band (ResearchThemeCards.tsx) is the honest render of this state, not a workaround.",
});

const SYSTEM_PROMPT = `You classify a research finding's theme for a freight sustainability intelligence platform's Research surface. Your output is a single JSON object - no prose, no markdown, no code fences.

Schema:
  theme: one of ${JSON.stringify(DB_THEME_VALUE_LIST)}, OR the literal string "unclassified" when the finding genuinely matches none of them well.
  confidence: number 0.00-1.00.
  rationale: string, 1 sentence, citing the specific phrase or concept that drove the classification (or the absence of one, for "unclassified").

Theme definitions:
  emissions_accounting - Methodology shifts that change how a workspace reports Scope 3 freight emissions (GHG Protocol, lifecycle accounting, CO2/CO2e measurement methods).
  fuels_saf - Sustainable aviation fuel, hydrogen, ammonia, biofuel, marine fuel: production capacity, feedstock constraints, price trajectory.
  packaging_circular - Packaging, PPWR, reusable/returnable crates, PFAS, recyclability, circular-economy materials.
  carbon_markets - EU ETS, CBAM, carbon pricing, carbon allowances, carbon trading mechanisms.
  cold_chain_art - Cold-chain logistics, climate-controlled transport, fine-art handling and conservation.
  last_mile_electrification - EV cargo capacity, charging infrastructure rollout, zero-emission delivery/urban freight.
  disclosure_regimes - CSRD, ISSB S2, SFDR, TCFD and other corporate sustainability disclosure/reporting frameworks.

Never force a pick. "unclassified" is the honest, correct answer for a finding about freight sustainability that does not substantively concern any of the seven themes above - it is not a defect to return it.

Output JSON only. Example: {"theme":"fuels_saf","confidence":0.88,"rationale":"Discusses SAF feedstock supply constraints driving 2026 price trajectory."}`;

/**
 * One classification call, through the canonical `streamMessagesText` path (discipline rule 016 - no
 * script builds its own Anthropic request). `streamFn` defaults to `streamMessagesText` itself; the
 * dry/test path always injects a fixture-backed fake, so no network call and no API key are ever
 * required outside a live --apply run (which this lane does not perform).
 * @param {{ id: string, title: string, text: string }} item
 * @param {{ apiKey: string, streamFn?: typeof streamMessagesText }} opts
 * @returns {Promise<{ theme: string, confidence: number, rationale: string }>}
 */
export async function classifyOne(item, { apiKey, streamFn = streamMessagesText } = {}) {
  const userMessage = `Classify this research finding.\n\nTitle: ${item.title}\n\nText: ${item.text || "(no body text)"}\n\nOutput the JSON object only.`;
  const { text } = await streamFn({
    apiKey,
    body: {
      model: HAIKU_MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    },
  });
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("backfill-themes: no JSON object in model output");
  const rec = JSON.parse(m[0]);
  const validTheme = rec.theme === UNCLASSIFIED || DB_THEME_VALUE_LIST.includes(rec.theme);
  if (!validTheme || typeof rec.confidence !== "number" || typeof rec.rationale !== "string") {
    throw new Error(`backfill-themes: malformed classification shape (${JSON.stringify(rec)})`);
  }
  return rec;
}

/**
 * Pure: classify a batch given an injectable `classifyFn` (tests supply a fixture-backed fake; the CLI
 * path below supplies `classifyOne` bound to the dry fetch fake). Never throws - a per-item failure
 * becomes an `"error"` outcome so one bad row cannot abort the batch.
 * @param {Array<{id:string, title:string, text:string}>} items
 * @param {(item: object) => Promise<object>} classifyFn
 */
export async function classifyBatch(items, classifyFn) {
  const results = [];
  for (const item of items) {
    try {
      const rec = await classifyFn(item);
      results.push({ id: item.id, title: item.title, outcome: "classified", ...rec });
    } catch (err) {
      results.push({ id: item.id, title: item.title, outcome: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/** Build the guardedUpdate patch for one classified row: either a DB-valid `theme` (candidate
 *  cleared), or `theme` left null with `theme_candidate` banked as "unclassified" - never both, never
 *  a forced non-null theme on an honest "unclassified" outcome. Pure; the live --apply path (not built
 *  in this lane) would thread this through guardedUpdateByIds exactly as
 *  scripts/_archive/_wave-alpha/backfill-themes.mjs's superseded version did for its own population. */
export function patchFor(rec) {
  if (rec.theme === UNCLASSIFIED) return { theme: null, theme_candidate: UNCLASSIFIED };
  return { theme: rec.theme, theme_candidate: null };
}

/**
 * The DOWNSTREAM this backfill connects to (rule 17, "nothing in this build runs alone"): the Research
 * theme facet data path - the SAME bucketing ResearchLedger.tsx's live `themeCards` `useMemo` (lines
 * 164-181) and this lane's new `unclassifiedCount` derivation perform over real rows, run here over
 * this batch's classification results instead. Proves the backfill's output is the shape the surface
 * actually consumes, not only that the classification call itself succeeded. Pure.
 * @param {Array<{outcome:string, theme?:string}>} results
 * @returns {{themed: Record<string, number>, unclassifiedCount: number}}
 */
export function themeCardsFromResults(results) {
  const themed = {};
  let unclassifiedCount = 0;
  for (const r of results) {
    if (r.outcome !== "classified") continue;
    if (r.theme === UNCLASSIFIED) unclassifiedCount += 1;
    else themed[r.theme] = (themed[r.theme] ?? 0) + 1;
  }
  return { themed, unclassifiedCount };
}

/** A fake harness_runs insert client (no real DB write - this worktree holds no credential): proves
 *  record-harness-run.mjs's recordHarnessRun() integration fires end-to-end (builds the row, attempts
 *  the insert, logs the outcome) without needing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY. */
function dryHarnessClient(log) {
  return {
    from(table) {
      return {
        insert: async (row) => {
          log(
            `theme-backfill: DRY harness_runs client - would INSERT into ${table} (run_id=${row.run_id}); ` +
              `no real DB write (no credential in this worktree).`,
          );
          return { error: null };
        },
      };
    },
  };
}

/**
 * Fires the harness-run recording (rule 17's first confirmation: "the backfill records a harness_runs
 * row via record-harness-run.mjs and triggers its downstream") for one classification batch. Writes a
 * real run artifact to disk (scripts/harness-runs/theme-backfill/), calls `recordHarnessRun` against a
 * dry/fake client (or a deps-injected real one), and computes+logs the downstream theme-facet
 * recomputation. Every I/O dependency is overridable so this is unit-testable without touching the real
 * harness-runs directory.
 * @param {Array} results classifyBatch's output
 * @param {object} [deps]
 */
export async function recordDryHarnessRun(results, deps = {}) {
  const {
    harnessRunsDir = `${HERE}/../harness-runs/theme-backfill`,
    fsiRoot = `${HERE}/../..`,
    log = (m) => console.log(m),
    claimRunIdFn = claimRunId,
    hashHarnessVersionFn = hashHarnessVersion,
    writeRunArtifactFn = writeRunArtifact,
    recordHarnessRunFn = recordHarnessRun,
    mkdirSyncFn = mkdirSync,
    writeFileSyncFn = writeFileSync,
    sb = dryHarnessClient(log),
    readAllFn = async () => [],
  } = deps;

  const startedAt = new Date().toISOString();
  const runId = claimRunIdFn(harnessRunsDir, "theme-backfill");
  const harnessVersion = hashHarnessVersionFn(
    ["scripts/research/backfill-themes.mjs", "src/lib/agent/metadata-vocab.ts"],
    fsiRoot,
  );
  const tracesDir = `${harnessRunsDir}/traces`;
  mkdirSyncFn(tracesDir, { recursive: true });
  const tracePath = `${tracesDir}/${runId}.result.json`;
  writeFileSyncFn(tracePath, JSON.stringify(results, null, 2) + "\n", "utf8");

  const downstream = themeCardsFromResults(results);
  const errors = results.filter((r) => r.outcome === "error");

  const artifact = buildRunArtifactEnvelope({
    family: "theme-backfill",
    harnessVersion,
    runId,
    startedAt,
    config: { mode: "dry", apply: false },
    inputsRef: ["scripts/research/fixtures/backfill-themes-fixtures.mjs"],
    perItem: results.map((r) => ({ id: r.id, outcome: r.outcome, evidence_refs: [] })),
    metrics: {
      classified: results.length - errors.length,
      errors: errors.length,
      themed_total: Object.values(downstream.themed).reduce((a, b) => a + b, 0),
      unclassified: downstream.unclassifiedCount,
      downstream_theme_cards: downstream.themed,
      downstream_unclassified_count: downstream.unclassifiedCount,
    },
    defectsFound: errors.map((e) => ({ description: `${e.id}: ${e.error}`, root_cause: e.error ?? "", fix_ref: null })),
    fullTraceRefs: [tracePath],
    proposerNotes:
      "Lane L8 dry fire: this run's classifications recomputed through the SAME themeCardsFromResults " +
      "bucketing ResearchLedger.tsx's live themeCards/unclassifiedCount derivation uses, proving the " +
      "downstream data path is connected (rule 17), not only that the classification call succeeded.",
  });

  const artifactPath = writeRunArtifactFn(harnessRunsDir, artifact);
  log(`theme-backfill: wrote run artifact ${artifactPath}`);

  const outcome = await recordHarnessRunFn(sb, artifact, { log, readAllFn });
  log(
    outcome.ok
      ? `theme-backfill: harness_runs row recorded (${outcome.run_id}${outcome.renumbered ? ", renumbered" : ""})`
      : `theme-backfill: harness_runs record FAILED: ${outcome.error}`,
  );
  log(
    `theme-backfill: downstream fired - Research theme facet data path (ResearchThemeCards.tsx via ` +
      `ResearchLedger.tsx's themeCards/unclassifiedCount derivation) recomputed from this run: ` +
      `${JSON.stringify(downstream.themed)} themed, unclassifiedCount=${downstream.unclassifiedCount}.`,
  );

  return { artifactPath, outcome, downstream };
}

export async function main(argv, deps = {}) {
  const args = argv.slice(2);
  const refusal = r14ApplyRefusalMessage(args, "backfill-themes", ENABLED);
  if (refusal) {
    console.log(refusal);
    return { refused: true };
  }

  const fixturesFlagIdx = args.indexOf("--fixtures");
  const fixturesPath =
    fixturesFlagIdx !== -1 && args[fixturesFlagIdx + 1]
      ? args[fixturesFlagIdx + 1]
      : new URL("./fixtures/backfill-themes-fixtures.mjs", import.meta.url).href;
  const fixtures = deps.fixturesModule ?? (await import(fixturesPath));
  const items = fixtures.NULL_THEME_RESEARCH_FINDINGS ?? [];

  console.log(
    `backfill-themes: DRY RUN against ${items.length} fixture row(s) (ENABLED=${ENABLED}). ` +
      `No live LLM call, no DB credential.`,
  );
  const classifyFn =
    deps.classifyFn ?? ((item) => classifyOne(item, { apiKey: "FIXTURE-DRY-RUN-NO-KEY", streamFn: fixtures.fakeStream }));
  const results = await classifyBatch(items, classifyFn);
  for (const r of results) {
    if (r.outcome === "classified") {
      const themeOut = r.theme === UNCLASSIFIED ? "NULL (theme_candidate=unclassified)" : r.theme;
      console.log(`  WOULD WRITE ${r.id} "${String(r.title).slice(0, 60)}" -> theme=${themeOut} (confidence ${r.confidence})`);
    } else {
      console.log(`  ERROR ${r.id}: ${r.error}`);
    }
  }
  const classified = results.filter((r) => r.outcome === "classified").length;
  console.log(
    `backfill-themes: ${classified}/${items.length} dry-classified. Live --apply pass is a separate, ` +
      `explicitly-authorized coordinator dispatch (R14 hold; ENABLED=${ENABLED}).`,
  );

  // --fire-harness (rule 17, coordinator-directed 2026-10-02): records this run to harness_runs via
  // record-harness-run.mjs and fires the downstream theme-facet recomputation, once, on request - kept
  // OUT of the default dry path so a plain `node backfill-themes.mjs` (and every unit test that calls
  // main() without this flag) never touches the real scripts/harness-runs/theme-backfill/ directory.
  let harness = null;
  if (args.includes("--fire-harness") || deps.fireHarness) {
    harness = await (deps.recordDryHarnessRun ?? recordDryHarnessRun)(results, deps.harnessDeps ?? {});
  }

  return { results, harness };
}

if (isMainModule(import.meta.url)) {
  main(process.argv).catch((e) => {
    console.error(`backfill-themes: ${e?.message ?? e}`);
    process.exit(1);
  });
}
