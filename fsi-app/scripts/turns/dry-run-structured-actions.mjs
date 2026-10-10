#!/usr/bin/env node
/** DRY-RUN-STRUCTURED-ACTIONS -- read-only exercise of the structured-action extractor
 *  (src/lib/agent/extract-recommended-actions.mjs) over REAL stored briefs (lane STRUCTURED-ACTIONS,
 *  2026-09-28; docs/plans/build-plan-2026-09-25.md workstream 6, merged with M4; docs/plans/
 *  data-machine-tool-gaps-2026-09-25.md "Produce" row "Structured-action extraction").
 *
 *  WHAT THIS IS. READS live `intelligence_items` rows (id, item_type, full_brief) via the read-only
 *  `readAll`/`readClient()` guard (scripts/lib/db.mjs -- `.insert/.update/.delete/.upsert` throw on
 *  this client by construction, rule 015), runs the pure extractor over every row's full_brief, and
 *  reports counts. IT WRITES NOTHING TO intelligence_items, ever, under any flag -- there is no
 *  `--apply` mode. This is deliberate, not a placeholder: no destination column for a structured
 *  action exists anywhere in the live schema (verified 2026-09-28: `select column_name from
 *  information_schema.columns where table_name='intelligence_items' and column_name ilike
 *  '%action%'` returns zero rows -- the ONLY `recommended_actions` column in the whole schema lives
 *  on the UNRELATED `integrity_flags` table, migration 048, a different shape: internal admin-
 *  remediation actions `{action, rationale}`, not a customer-facing "do now" task). See this lane's
 *  session-log entry for the STOP-AND-ASK this leaves the coordinator: where the extracted actions
 *  should land is a schema/design decision this lane does not have authority to make alone.
 *
 *  HARNESS RECORD (rule 17's harness half; R14/hard-rule posture matches lane QUARANTINE-DISPOSITION's
 *  own precedent, docs/plans/data-machine-tool-gaps-2026-09-25.md "Produce" table row 2, 2026-09-28):
 *  every run writes this family's own run artifact (scripts/harness-runs/structured-actions/) and
 *  best-effort records it to the `harness_runs` table via scripts/lib/record-harness-run.mjs -- that
 *  insert is operational metadata, never customer data, so it needs no R14 authorization; it is
 *  ALSO best-effort by that module's own design (logs and returns {ok:false} rather than throwing) so
 *  a worktree with no DB credentials (the lane-common-contract's stated posture -- "No DB credentials
 *  exist in your worktree") still completes the run and writes its own artifact JSON to disk, which is
 *  this run's durable local record regardless of whether the table write landed.
 *
 *  Usage:
 *    node scripts/turns/dry-run-structured-actions.mjs [--limit N] [--sample N]
 *  --limit caps how many intelligence_items rows are read (default: all rows with full_brief set).
 *  --sample caps how many extracted actions are printed in the per_item preview (default: 20).
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { extractRecommendedActions } from "../../src/lib/agent/extract-recommended-actions.mjs";
import { writeRunArtifact, buildRunArtifactEnvelope, claimRunId, hashHarnessVersion } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";

export const FAMILY = "structured-actions";

/**
 * Run the dry-run extraction pass over pre-fetched item rows. Pure -- no I/O -- so it is directly
 * unit-testable without a database (the same "pure core + thin CLI shell" split every other
 * scripts/*.mjs harness in this repo uses).
 * @param {{items: Array<{id:string, item_type:string, full_brief:string|null}>}} args
 * @returns {{perItem: object[], metrics: object, sampleActions: object[]}}
 */
export function runExtractionPass({ items }) {
  const perItem = [];
  const byItemType = {};
  const byVerb = {};
  let itemsWithBrief = 0;
  let itemsWithActions = 0;
  let totalActions = 0;
  let actionsWithTimeframe = 0;
  let actionsWithOwner = 0;
  let actionsWithDueDate = 0;
  const sampleActions = [];

  for (const item of items) {
    if (item.full_brief) itemsWithBrief += 1;
    const actions = extractRecommendedActions(item.full_brief, item.item_type);
    if (actions.length > 0) {
      itemsWithActions += 1;
      totalActions += actions.length;
      byItemType[item.item_type] = (byItemType[item.item_type] ?? 0) + actions.length;
      for (const a of actions) {
        byVerb[a.verb] = (byVerb[a.verb] ?? 0) + 1;
        if (a.timeframe_days != null) actionsWithTimeframe += 1;
        if (a.owner != null) actionsWithOwner += 1;
        if (a.due_date != null) actionsWithDueDate += 1;
        if (sampleActions.length < 20) {
          sampleActions.push({ item_id: item.id, item_type: item.item_type, ...a });
        }
      }
    }
    perItem.push({
      id: item.id,
      outcome: actions.length > 0 ? "actions_extracted" : "no_actions",
      verdict: `count=${actions.length}`,
      evidence_refs: [],
      error: null,
    });
  }

  const metrics = {
    items_scanned: items.length,
    items_with_brief: itemsWithBrief,
    items_with_actions: itemsWithActions,
    total_actions: totalActions,
    actions_by_item_type: byItemType,
    actions_by_verb: byVerb,
    actions_with_timeframe_days: actionsWithTimeframe,
    actions_with_owner: actionsWithOwner,
    actions_with_due_date: actionsWithDueDate,
  };

  return { perItem, metrics, sampleActions };
}

/** Live-DB orchestration: read-only fetch + extraction pass + harness-run artifact write. */
// familyDir / harnessRunsClient are injectable so the artifact-name-equals-ledger-id behaviour is provable on
// fixtures (lane HARNESS-1, 2026-10-10); the CLI supplies neither.
export async function runDryRun({ limit } = {}, { readAllFn = readAll, sb, log = () => {}, familyDir: familyDirOverride = null, harnessRunsClient = null } = {}) {
  const startedAt = new Date().toISOString();
  log(`\n===== DRY-RUN-STRUCTURED-ACTIONS (read-only; no destination column exists -- extraction preview only) =====`);

  const rows = await readAllFn("intelligence_items", "id, item_type, full_brief", { client: sb, orderBy: "id" });
  const items = (limit ? rows.slice(0, limit) : rows).filter((r) => r.full_brief);
  log(`intelligence_items rows read (full_brief IS NOT NULL, after --limit): ${items.length} of ${rows.length} total`);

  const { perItem, metrics, sampleActions } = runExtractionPass({ items });
  log(`metrics: ${JSON.stringify(metrics)}`);

  const fsiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const familyDir = familyDirOverride ?? resolve(fsiRoot, "scripts/harness-runs", FAMILY);
  const harnessVersion = hashHarnessVersion(GOVERNING_FILES[FAMILY], fsiRoot);
  const runId = claimRunId(familyDir, FAMILY);

  const defectsFound = [];
  if (metrics.items_with_brief > 0 && metrics.items_with_actions === 0) {
    defectsFound.push({
      description: "Zero items produced any extracted action across the whole scanned population, despite items_with_brief > 0.",
      root_cause: "Either the corpus genuinely has no live do-now action lines this pass, or the section-heading match is missing a real heading variant -- worth a second look before trusting a zero.",
      fix_ref: null,
    });
  }

  const config = {
    mode: "dry",
    write_status: "no destination column exists on intelligence_items for a structured action; this run extracts and reports only, it writes nothing to any customer-data table under any flag",
  };

  const proposerNotes =
    "STOP-AND-ASK for the coordinator (lane STRUCTURED-ACTIONS, 2026-09-28): docs/specs/07-page-walkthrough.md:56 is the only spec defining a structured-action shape (\"a task with an owner and a due date\"), and it is scoped to the Regulations obligation card only -- specs 02/03/04 (Market/Research/Operations) name no such shape. Live schema has no recommended_actions/action/task column on intelligence_items (confirmed via information_schema, 2026-09-28); the only recommended_actions column in the schema is integrity_flags' unrelated internal-remediation shape (migration 048). This run proves the EXTRACTION half works against real stored briefs; the WRITE half needs a coordinator decision: which table/column receives structured actions, and whether the non-regulatory formats (which have no do-now section named in system-prompt.ts) get one invented for them or stay out of scope.";

  const artifact = buildRunArtifactEnvelope({
    family: FAMILY,
    harnessVersion,
    runId,
    startedAt,
    config,
    inputsRef: ["src/lib/agent/extract-recommended-actions.mjs", "src/lib/agent/extract-sections.ts"],
    perItem,
    metrics,
    defectsFound,
    fullTraceRefs: [
      "docs/plans/build-plan-2026-09-25.md",
      "docs/plans/data-machine-tool-gaps-2026-09-25.md",
      "docs/specs/07-page-walkthrough.md",
    ],
    proposerNotes,
  });

  const artifactPath = writeRunArtifact(familyDir, artifact);
  log(`wrote ${artifactPath}`);

  let harnessRunRow = null;
  try {
    let client = harnessRunsClient;
    if (!client) {
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set");
      client = createClient(url, key, { auth: { persistSession: false } });
    }
    const { recordHarnessRun } = await import("../lib/record-harness-run.mjs");
    // artifactPath: the recorder renames the file to the id the ledger row lands under, so the artifact is
    // always findable from the ledger row (lane HARNESS-1, 2026-10-10).
    harnessRunRow = await recordHarnessRun(client, artifact, { log, artifactPath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`record-harness-run: not recorded this run (best-effort, no worktree DB credentials expected): ${msg}`);
    harnessRunRow = { ok: false, error: msg };
  }

  const landedPath = harnessRunRow?.artifact_path ?? artifactPath;
  return { runId: harnessRunRow?.ok ? harnessRunRow.run_id : runId, artifactPath: landedPath, metrics, sampleActions, harnessRunRow };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  loadLocalEnvFile();
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number.parseInt(process.argv[limitIdx + 1], 10) : undefined;
  const sb = readClient();
  const r = await runDryRun({ limit }, { sb, log: console.log });
  console.log(`\ndry-run-structured-actions: run_id=${r.runId} metrics=${JSON.stringify(r.metrics)}`);
  console.log(`sample actions (up to 20): ${JSON.stringify(r.sampleActions, null, 2)}`);
  if (r.harnessRunRow) console.log(`harness_runs: ${JSON.stringify(r.harnessRunRow)}`);
  process.exit(0);
}
