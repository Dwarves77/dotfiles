#!/usr/bin/env node
// finish-staged-updates.mjs -- MAINT step for task 7.5 item 2 of the W9 brief-chain build plan, Part 7
// (ADR-030 rider / RD-20, 2026-09-12). Live fact named in the dispatch [CONFIRMED by the coordinator,
// 2026-09-12]: `staged_updates` has 33 rows with status='approved' and materialized_at IS NULL (April
// to July) -- the legacy human-approval flow set status='approved' before the machine-gated mint
// chokepoint (Unit 0c-2, run-intake-cycle.ts) existed, and nothing ever ran them through it.
//
// THE RULE (task 7.5, verbatim): "The 33 approved staged_updates go through the mint chokepoint
// (materialize) or are rejected with a reason by the same machine gates a fresh staged row meets;
// none stays approved." RD-20 / ADR-012's own doctrine (CLAUDE.md, "Constraints"): staged_updates is
// TRANSIT-ONLY -- a row resolves to materialized / rejected-with-reason / routed-to-the-flag-resolver
// and MUST NOT park past its max-age; a materialization failure ages into the flag resolver, never a
// parked approved-unmaterialized orphan (the P1#5 defect this step retires for the 33 rows still in
// it).
//
// THE SAME MACHINE GATES A FRESH ROW MEETS. `applyStagedUpdate` (src/lib/intake/apply-staged-update.ts)
// is the ONE materialization chokepoint every live caller already uses -- run-intake-cycle.ts's own
// STAGE->MINT step for a brand-new row, and drainChangeSweepUpdates for a change-sweep-originated
// update_item row. This step is a THIRD caller of the SAME function, for the population of rows that
// predate BOTH of those callers (status already 'approved' from the retired human-approve handler,
// never run through the chokepoint at all). No second gate is written here: for `new_item`,
// applyStagedUpdate itself runs the entity-gate (portal-root source_url refused) then
// mintIntelligenceItem (congruence 1a/1b + subject-existence dedup + the relevance floor + the ONE
// INSERT); for `update_item`/`status_change`/`new_source`/`archive_item` it applies the same
// fixed-shape UPDATE/INSERT those types always use. dryRun threads straight through (F6).
//
// WRITE SHAPE ON SUCCESS mirrors run-intake-cycle.ts's OWN convention exactly (read in full before
// writing this file): a materialized row keeps status='approved' (that IS the RD-20 resolved state
// for this table -- see run-intake-cycle.ts's own comment, "materialized (RD-20 resolved state --
// status=approved + materialized_at, the mint chokepoint's ticket)") and stamps
// materialized_at/materialized_item_id/materialization_error=null. This step does NOT invent a new
// vocabulary value; it runs the SAME rows the retired human-approve handler already stamped
// status='approved' through the chokepoint those two live callers already use, and stamps the SAME
// three columns those callers stamp.
//
// WRITE SHAPE ON FAILURE: status='rejected', materialization_error=<applyStagedUpdate's own reason,
// verbatim>, reviewed_at=now, reviewed_by=this step's name. Never left 'approved'.
//
// THE SCRAPE-HOLD CLAUSE (task 7.5, verbatim): "If the materialization needs a fetch and the scrape
// hold is engaged, report 'held' per row, never bypass." [CONFIRMED, full read of the entire call
// graph applyStagedUpdate reaches for every one of the five update_types -- mintIntelligenceItem
// (src/lib/intake/mint-item.ts), participateInFlywheel's runDiscoveryStep / runForwardEventsStep
// (src/lib/intake/flywheel-steps.mjs), syncComplianceDeadlineForItem
// (src/lib/forward-events/compliance-deadline-sync.mjs), linkItemEntities
// (src/lib/entities/link-item-entities.mjs)]: NONE of these perform an external fetch -- every one is
// a Supabase read/derive/write over rows already in the database. grep across that call graph for
// `fetch(`, `browserless`, `Browserless`, `canonical-fetch` returns zero hits. The scrape-hold clause
// therefore does not currently bind ANY row `finish-staged-updates` processes -- materialize here is
// the MINT step only (the write of the row itself), never the separate GROUND step
// (generateBriefWorkflow, which DOES fetch and IS gated by SCRAPE_HOLD) that run-intake-cycle.ts runs
// as its own, later step for a brand-new candidate. Grounding an item this step mints into a full
// brief is the research-or-erase / quarantine-disposition concern task 7.3 already owns (a
// freshly-materialized `new_item` row with no brief is a record-grade stub, an ordinary, expected
// live state -- CLAUDE.md's agent-architecture section names record-grade items explicitly), not a
// second job for this step to take on silently. The hold is still CHECKED and reported (never
// silently assumed forever): `deps.holdEngaged()` is read once per run and threaded into the summary
// as `scrape_hold_engaged_at_run_time`, so a future change to apply-staged-update.ts's call graph that
// DOES introduce a fetch is visible in this step's own dry output before it would ever run live.
//
// $0, no LLM call, no fetch. DRY BY DEFAULT: `main(opts, deps)` never writes without `mode: "apply"`.
//
// NO LIVE VERIFICATION IN THIS SESSION [CONFIRMED per dispatch brief facts, NOT independently
// re-verified here -- no DB credentials in this worktree]. The 33-row count is the coordinator's own
// live read; this script's own dry mode reconfirms it at dispatch time before any apply.
import { readAll, guardedUpdate } from "../lib/db.mjs";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { resolve } from "node:path";

export const CITE = Object.freeze({
  skill: "brief-chain-build-plan-2026-09-11 Part 7 task 7.5 item 2",
  reason:
    "Run every approved-never-materialized staged_updates row through the SAME mint chokepoint " +
    "(applyStagedUpdate) a fresh staged row already meets: materialize (status=approved stays, " +
    "materialized_at + materialized_item_id stamped) or reject-with-reason (status=rejected, " +
    "materialization_error stamped) -- RD-20's transit-only doctrine, never a parked orphan.",
});

export const RESOLVED_BY = "finish-staged-updates";

const STAGED_COLUMNS =
  "id, update_type, proposed_changes, reason, source_url, item_id, source_id, status, materialized_at, materialized_item_id, materialization_error, batch_id";

// ---------------------------------------------------------------------------------------------------
// Pure decision logic (unit-tested with no I/O). The actual materialization call
// (deps.applyStagedUpdate) is NOT pure -- it is the real chokepoint, dependency-injected so this
// step's orchestration is testable with a fake without touching a database.
// ---------------------------------------------------------------------------------------------------

/**
 * The write patch for one row's outcome. Pure given the chokepoint's own result shape (`applied`) --
 * never re-derives what applyStagedUpdate already decided.
 * @param {{ success: boolean, itemId?: string|null, error?: string }} applied
 * @param {string} nowIso @param {string} resolvedBy
 */
export function buildOutcomePatch(applied, nowIso, resolvedBy) {
  if (applied.success) {
    return {
      action: "materialized",
      patch: {
        status: "approved",
        materialized_at: nowIso,
        materialized_item_id: applied.itemId ?? null,
        materialization_error: null,
        reviewed_by: resolvedBy,
        reviewed_at: nowIso,
      },
    };
  }
  return {
    action: "rejected",
    patch: {
      status: "rejected",
      materialization_error: applied.error ?? "machine-rejected (no reason returned)",
      reviewed_by: resolvedBy,
      reviewed_at: nowIso,
    },
  };
}

/** One human-readable summary line per row, for the dry sample / apply per-row log. Pure. */
export function describeOutcome(row, action, applied) {
  const label = row.item_id ? `staged:${row.id} (item ${row.item_id})` : `staged:${row.id} (${row.update_type})`;
  if (action === "materialized") {
    return `${label} -> materialized${applied.itemId ? ` (item ${applied.itemId})` : ""}${applied.flags?.length ? ` [${applied.flags.join(",")}]` : ""}`;
  }
  return `${label} -> rejected: ${applied.error ?? "machine-rejected"}`;
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   readApprovedUnmaterialized: () => Promise<Array>,
 *   applyStagedUpdate: (row:object, opts:{dryRun:boolean}) => Promise<{success:boolean, itemId?:string|null, error?:string, flags?:string[], action?:string}>,
 *   writeOutcome: (id:string, patch:object) => Promise<void>,
 *   holdEngaged: () => boolean,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = {
    step: "finish-staged-updates",
    mode,
    scrape_hold_engaged_at_run_time: deps.holdEngaged(),
    counts: { materialized: 0, rejected: 0 },
    by_update_type: {},
    samples: { materialized: [], rejected: [] },
    applied: 0,
    read_back: {},
    exitCode: 0,
  };

  const rows = await deps.readApprovedUnmaterialized();
  const nowIso = new Date().toISOString();

  for (const row of rows) {
    const applied = await deps.applyStagedUpdate(row, { dryRun: !apply });
    const { action, patch } = buildOutcomePatch(applied, nowIso, RESOLVED_BY);
    const bucket = action === "materialized" ? "materialized" : "rejected";
    summary.counts[bucket] += 1;
    summary.by_update_type[row.update_type] = summary.by_update_type[row.update_type] ?? { materialized: 0, rejected: 0 };
    summary.by_update_type[row.update_type][bucket] += 1;
    const line = describeOutcome(row, action, applied);
    if (summary.samples[bucket].length < 20) summary.samples[bucket].push(line);
    if (apply) await deps.writeOutcome(row.id, patch);
  }

  if (!apply) {
    summary.note =
      `DRY -- ${rows.length} approved-never-materialized staged_updates row(s). Scrape hold ` +
      `${summary.scrape_hold_engaged_at_run_time ? "ENGAGED (checked but not currently load-bearing -- " +
        "see this file's header: the mint chokepoint's call graph performs no fetch for any of the " +
        "five update_types)" : "lifted"}. Would materialize ${summary.counts.materialized}, reject ` +
      `${summary.counts.rejected}. Nothing written.`;
    return summary;
  }

  summary.applied = summary.counts.materialized + summary.counts.rejected;
  summary.note = `Resolved ${summary.applied}/${rows.length} approved-never-materialized staged_updates row(s): ${summary.counts.materialized} materialized, ${summary.counts.rejected} rejected. None left approved-unmaterialized.`;

  const remaining = await deps.readApprovedUnmaterialized();
  summary.read_back = { approved_unmaterialized_remaining: remaining.length };

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "finish-staged-updates",
    main,
    needsDb: true,
    buildDeps: async () => {
      // applyStagedUpdate (src/lib/intake/apply-staged-update.ts) imports mintIntelligenceItem,
      // classifySourceRole, and other `@/lib/...`-aliased modules transitively -- the same
      // alias-resolution constraint backfill-format-type.mjs's own header documents for
      // extract-registry.ts. Loaded lazily via jiti, inside buildDeps only, never at module top
      // level, so this file's own test (finish-staged-updates.test.mjs, in the no-npm glob) never
      // needs jiti or a real Supabase client.
      const { createJiti } = await import("jiti");
      const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(fsiRoot(), "src") } });
      const { applyStagedUpdate } = await jiti.import("../../src/lib/intake/apply-staged-update.ts");
      const { holdEngaged } = await jiti.import("../../src/lib/sources/fetch-hold.mjs");
      // applyStagedUpdate is a src/lib chokepoint that takes a RAW Supabase client and writes through
      // it directly (the same shape run-intake-cycle.ts's own caller already uses) -- it is not itself
      // a scripts/lib/db.mjs guardedX consumer, so this step builds the client the SAME way
      // scripts/turns/apply-record-briefs.mjs's own lazy-client precedent does. runCli's own `needsDb`
      // check (above this file's IS_MAIN block) has already confirmed both env vars are present before
      // buildDeps runs.
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      return {
        holdEngaged,
        readApprovedUnmaterialized: () =>
          readAll("staged_updates", STAGED_COLUMNS, {
            match: (q) => q.eq("status", "approved").is("materialized_at", null),
          }),
        applyStagedUpdate: (row, opts) => applyStagedUpdate(sb, row, opts),
        writeOutcome: (id, patch) => guardedUpdate("staged_updates", (q) => q.eq("id", id), patch, { cite: CITE }),
      };
    },
  });
}
