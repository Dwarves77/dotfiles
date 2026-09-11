// scripts/forward-events/dispatch-extraction.mjs — the corpus-wide forward-events BACKFILL dispatcher
// (DATECHAIN lane, 2026-09-11; runbook command 1 of docs/ops/runbooks/date-chain-2026-09-11.md).
//
// THE GAP: item_forward_events (migration 274) IS wired into the live flywheel — mint-item.ts extracts
// on every new mint, apply-staged-update.ts re-extracts on every substantive update (both via
// src/lib/forward-events/read-and-extract.mjs's readAndExtractForwardEvents). But that means only items
// minted or substantively updated SINCE the extractor shipped (2026-09-01) ever got a pass. Measured live
// 2026-09-11: 821 rows across 289 of 1,518 live items (19%) — the corpus that existed BEFORE the
// extractor and hasn't been substantively updated since has no rows and no path to get any without this
// dispatcher. This script is that path: run extractForwardEvents (via the same readAndExtractForwardEvents
// driver mint-item.ts and apply-staged-update.ts already use — ONE extraction implementation, no second
// copy) for every live item with ZERO existing item_forward_events rows, insert what it finds, and sync
// compliance_deadline from whatever compliance_deadline-kind events resulted (rule 16(b)/17 continued —
// see compliance-deadline-sync.mjs's own header for the pick rule this reuses, not re-derives).
//
// COST CLASS: PURE PARSER, $0. extractForwardEvents (src/lib/forward-events/extract-forward-events.mjs)
// is documented "Pure, deterministic, $0, no-LLM module" in its own header, and readAndExtractForwardEvents
// only reads section_claim_provenance / intelligence_item_sections / (conditionally) agent_run_searches —
// no model call, no Browserless fetch, nothing metered. This script calls no LLM and fetches nothing over
// the network beyond the Supabase reads/writes themselves.
//
// SCOPE: live items (is_archived=false) with NO existing item_forward_events row — items already covered
// are left untouched here (re-extraction for an item whose grounded content changed is
// apply-staged-update.ts's job at update time, not this dispatcher's; re-running this dispatcher over an
// already-covered item would be a correct no-op anyway since the migration-274 UNIQUE key still applies,
// but skipping covered items up front keeps each run's read volume proportional to the actual gap).
//
// BOUNDED AND RESUMABLE: --limit caps how many items this run processes (id-ordered); --after-id resumes
// past a prior run's last processed id (printed at the end of every run). Safe to run in batches or
// re-run after an interruption — a completed item is never revisited unless the corpus grows an item
// that still has zero forward-events rows and an id after --after-id.
//
// RUN:
//   node scripts/forward-events/dispatch-extraction.mjs                       # dry-run: counts only
//   node scripts/forward-events/dispatch-extraction.mjs --execute             # guarded insert + sync
//   node scripts/forward-events/dispatch-extraction.mjs --limit 200 --execute # bounded batch
//   node scripts/forward-events/dispatch-extraction.mjs --after-id <uuid> --execute  # resume

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readAll, readClient, guardedInsertMany, guardedUpdate } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be preloaded */ }

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readAndExtractForwardEvents } = await jiti.import("../../src/lib/forward-events/read-and-extract.mjs");
const { pickComplianceDeadline, COMPLIANCE_DEADLINE_EVENT_KIND } = await jiti.import(
  "../../src/lib/forward-events/compliance-deadline-sync.mjs"
);

const EXECUTE = process.argv.includes("--execute");
const limitFlag = process.argv.indexOf("--limit");
const LIMIT = limitFlag > -1 ? Number(process.argv[limitFlag + 1]) : null;
const afterFlag = process.argv.indexOf("--after-id");
const AFTER_ID = afterFlag > -1 ? process.argv[afterFlag + 1] : null;

const TODAY = new Date().toISOString().slice(0, 10);

const cite = {
  skill: "environmental-policy-and-innovation",
  reason: "DATECHAIN date-chain fix (2026-09-11), forward-events half: corpus backfill of item_forward_events for items minted/last-substantively-updated before the extractor shipped (2026-09-01) + the compliance_deadline sync those new rows feed — zero spend, pure parse over already-grounded content",
};

async function main() {
  console.log(`\ndispatch-extraction (forward-events backfill) — ${EXECUTE ? "EXECUTE" : "DRY-RUN"} (today=${TODAY})${LIMIT ? ` limit=${LIMIT}` : ""}${AFTER_ID ? ` after-id=${AFTER_ID}` : ""}\n`);

  const sb = readClient();

  // Items already covered — skip them (see header: re-extraction on change is apply-staged-update.ts's
  // job, not this dispatcher's).
  const coveredRows = await readAll("item_forward_events", "intelligence_item_id");
  const covered = new Set(coveredRows.map((r) => r.intelligence_item_id));

  let items = await readAll("intelligence_items", "id, title", {
    match: (q) => {
      let qq = q.eq("is_archived", false);
      if (AFTER_ID) qq = qq.gt("id", AFTER_ID);
      return qq;
    },
  });
  items = items.filter((it) => !covered.has(it.id));
  if (LIMIT) items = items.slice(0, LIMIT);
  console.log(`scope: ${items.length} live items with zero item_forward_events rows${LIMIT || AFTER_ID ? " (bounded)" : ""}\n`);

  let itemsWithEvents = 0, totalEvents = 0, itemsSyncedDeadline = 0, itemsFailed = 0;

  for (const it of items) {
    let events;
    try {
      ({ events } = await readAndExtractForwardEvents(sb, it.id));
    } catch (e) {
      itemsFailed += 1;
      console.warn(`  READ-ERR ${it.id} (${(it.title || "").slice(0, 50)}): ${e.message}`);
      continue;
    }
    if (!events.length) continue;

    itemsWithEvents += 1;
    totalEvents += events.length;
    console.log(`  ${EXECUTE ? "" : "would "}insert ${it.id.slice(0, 8)} ${String(events.length).padStart(2)} events  ${(it.title || "").slice(0, 60)}`);

    if (EXECUTE) {
      const rows = events.map((ev) => ({ intelligence_item_id: it.id, ...ev }));
      try {
        await guardedInsertMany("item_forward_events", rows, { cite, select: "id" });
      } catch (e) {
        // Migration-274's own UNIQUE key means a residual 23505 here is "already covered by a
        // concurrent writer" — zero-new, not a failure (same posture apply-staged-update.ts's own
        // dedupe-key comment documents for its own insert).
        if (!/23505|duplicate/i.test(e.message)) {
          itemsFailed += 1;
          console.warn(`  INSERT-ERR ${it.id}: ${e.message}`);
          continue;
        }
      }
    }

    // compliance_deadline sync — same pick rule compliance-deadline-sync.mjs's app-runtime caller uses,
    // reused (not re-derived) here; the write itself goes through guardedUpdate (scripts stay on the
    // guarded path — rule 015) rather than syncComplianceDeadlineForItem's own raw .update(), which is
    // the app-runtime (svc()) call shape, not the scripts one.
    const deadlineCandidates = events
      .filter((ev) => ev.event_kind === COMPLIANCE_DEADLINE_EVENT_KIND)
      .map((ev, i) => ({ ...ev, id: `pending-${i}` })); // no row id yet pre-insert; pure pick only needs date+kind+confidence
    const picked = pickComplianceDeadline(deadlineCandidates, TODAY);
    if (picked) {
      const { data: current, error: curErr } = await sb.from("intelligence_items").select("compliance_deadline").eq("id", it.id).single();
      if (curErr) {
        console.warn(`  DEADLINE-READ-ERR ${it.id}: ${curErr.message}`);
      } else if (current?.compliance_deadline !== picked) {
        if (EXECUTE) {
          await guardedUpdate("intelligence_items", (q) => q.eq("id", it.id), { compliance_deadline: picked }, { cite, select: "id" });
        }
        itemsSyncedDeadline += 1;
        console.log(`    ${EXECUTE ? "" : "would "}sync compliance_deadline -> ${picked}`);
      }
    }
  }

  console.log(`\n=== ${EXECUTE ? "DONE" : "DRY-RUN"} ===`);
  console.log(`items with new events: ${itemsWithEvents} · total events: ${totalEvents} · compliance_deadline synced: ${itemsSyncedDeadline} · failed: ${itemsFailed}`);
  if (items.length) console.log(`last id processed this run (for --after-id resume): ${items[items.length - 1].id}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
