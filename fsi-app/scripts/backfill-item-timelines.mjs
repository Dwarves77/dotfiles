// scripts/backfill-item-timelines.mjs
//
// §14 TIMELINE HARVEST — CORPUS SWEEP (Phase-3b, DATE-AND-DEDUP-AUDIT DD-01/DD-02, operator-ruled
// block; REVIVED from scripts/_archive/ by the DATECHAIN lane, 2026-09-11, as runbook command 2 of
// docs/ops/runbooks/date-chain-2026-09-11.md). The corpus audit: of 89 verified reg-family briefs
// carrying real compliance dates, exactly ONE had a correct complete timeline — ~85% had NO
// structured timeline (the dates live only in the brief prose, often in a fully-written §14
// "Confirmed Regulatory Timeline"), and the few stored timelines were mostly WRONG (PPWR stored
// Aug-1 where the prose says 12 August 2026 ~8×). Root cause: item_timelines had NO production
// writer (one seed migration only).
//
// WHY THIS WAS ARCHIVED, AND WHY REVIVING IT ALONE ISN'T THE FIX. This script always operated
// independently of canonical-pipeline's sectionBrief (it parses full_brief and writes item_timelines
// directly, never touching intelligence_item_sections) — the SAME table sectionBrief's F2 skip-if-
// verified guard used to gate. But this script was moved to _archive/ and never re-run, and nothing
// else wrote item_timelines for a verified item either (sectionBrief's guard blocked the harvest
// that lived inside it), so item_timelines went stale (last write 2026-07-30) with no writer of any
// kind reachable for the 1,434 of 1,518 live items that are verified (measured 2026-09-11). The real
// fix has two halves: canonical-pipeline.ts's harvestItemTimeline() is now UNLOCKED to run on every
// future (re-)generation regardless of provenance_status (see that function's own header); THIS
// script is the one-time sweep that catches the corpus up for items that won't regenerate on their
// own. Both use the exact same parser/normalizer pair, so neither can drift from the other:
//   extractRegulationSections (§14 display parser, reused) → buildTimelineRows (precision-honest:
//   a non-day token keeps its ORIGINAL form in the label; unparseable tokens are reported).
//
// REPLACE RULE: an item's rows are replaced ONLY when the fresh parse yields ≥1 row (guarded
// delete-then-insert, snapshots + read-back via scripts/lib/db.mjs). When the parse yields 0 rows,
// existing rows are LEFT and the item is reported — the script never destroys data it cannot
// reproduce. Wrong stored dates (DD-02) are corrected by the replace because the prose is the
// audited source of truth.
//
// SAFETY: DRY-RUN by default; --execute writes. Scope: reg-family items with a full_brief
// (any provenance — the timeline is display data derived from the brief; quarantined items get
// correct timelines for when they recover). PURE PARSE — extractRegulationSections and
// buildTimelineRows are zero-I/O string parsers over content already stored in full_brief; this
// script calls no LLM and no external fetch. $0 at any scale.
//
// BOUNDED AND RESUMABLE: --limit caps how many items get processed this run (order is by id, so a
// second run continues where a first stopped via --after-id); --after-id resumes past the last id
// a prior run reported. Neither is required for a full corpus pass (~1,500 items, one parse each,
// no per-item I/O beyond one delete+insert on --execute) but both are here so an interrupted or
// intentionally staged run can be split without redoing already-processed items.
//
// RUN:
//   node scripts/backfill-item-timelines.mjs                        # dry-run: per-item counts + skipped tokens
//   node scripts/backfill-item-timelines.mjs --execute               # guarded replace
//   node scripts/backfill-item-timelines.mjs --item <uuid>           # single item (either mode)
//   node scripts/backfill-item-timelines.mjs --limit 200 --execute   # bounded batch
//   node scripts/backfill-item-timelines.mjs --after-id <uuid> --execute  # resume past a prior batch

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readAll, guardedDelete, guardedInsert } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be preloaded */ }

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { extractRegulationSections } = await jiti.import("../src/lib/agent/extract-regulation-sections.ts");
const { buildTimelineRows } = await jiti.import("../src/lib/agent/timeline-harvest.mjs");
// itemTypes sourced from the format registry itself (regulationSpec.itemTypes), never a second
// hand-typed list that could drift from what sectionBrief actually treats as regulatory_fact_document.
const { regulationSpec } = await jiti.import("../src/lib/agent/formats/regulation.ts");
const REG_FAMILY = regulationSpec.itemTypes;

const EXECUTE = process.argv.includes("--execute");
const itemFlag = process.argv.indexOf("--item");
const ONLY_ITEM = itemFlag > -1 ? process.argv[itemFlag + 1] : null;
const limitFlag = process.argv.indexOf("--limit");
const LIMIT = limitFlag > -1 ? Number(process.argv[limitFlag + 1]) : null;
const afterFlag = process.argv.indexOf("--after-id");
const AFTER_ID = afterFlag > -1 ? process.argv[afterFlag + 1] : null;

const TODAY = new Date().toISOString().slice(0, 10);

const cite = {
  skill: "environmental-policy-and-innovation",
  reason: "DATECHAIN date-chain fix (2026-09-11), corpus sweep half: mechanical §14 harvest from stored briefs into item_timelines — the dates the model already extracted, structured; precision-honest, zero spend",
};

async function main() {
  console.log(`\nbackfill-item-timelines — ${EXECUTE ? "EXECUTE" : "DRY-RUN"} (today=${TODAY})${LIMIT ? ` limit=${LIMIT}` : ""}${AFTER_ID ? ` after-id=${AFTER_ID}` : ""}\n`);

  let items = await readAll("intelligence_items", "id, legacy_id, title, item_type, provenance_status, full_brief", {
    match: (q) => {
      let qq = q.in("item_type", REG_FAMILY).not("full_brief", "is", null);
      if (ONLY_ITEM) qq = qq.eq("id", ONLY_ITEM);
      if (AFTER_ID) qq = qq.gt("id", AFTER_ID);
      return qq;
    },
  });
  if (LIMIT) items = items.slice(0, LIMIT);
  console.log(`scope: ${items.length} reg-family items with a full_brief${LIMIT || AFTER_ID ? " (bounded)" : ""}\n`);

  const existing = await readAll("item_timelines", "id, item_id");
  const existingByItem = new Map();
  for (const r of existing) {
    if (!existingByItem.has(r.item_id)) existingByItem.set(r.item_id, []);
    existingByItem.get(r.item_id).push(r.id);
  }

  let replaced = 0, filled = 0, empty = 0, held = 0, totalRows = 0, totalSkipped = 0;
  const heldItems = [];

  for (const it of items) {
    let entries = [];
    try {
      const sec = extractRegulationSections(it.full_brief)["14"];
      entries = sec && sec.kind === "timeline" ? sec.entries : [];
    } catch (e) {
      console.warn(`  PARSE-ERR ${it.id} (${(it.title || "").slice(0, 50)}): ${e.message}`);
      continue;
    }
    const { rows, skipped } = buildTimelineRows(entries, TODAY);
    totalSkipped += skipped.length;
    const prior = existingByItem.get(it.id) || [];

    if (!rows.length) {
      if (prior.length) {
        // Parse can't reproduce the stored rows — HOLD (never destroy unverifiable data), report.
        held += 1;
        heldItems.push(`${it.id} (${(it.title || "").slice(0, 60)}) — ${prior.length} stored rows, fresh parse 0${skipped.length ? `, ${skipped.length} unparseable` : ""}`);
      } else {
        empty += 1; // legitimately date-free (advisory/institutional briefs per the audit)
      }
      continue;
    }

    totalRows += rows.length;
    if (EXECUTE) {
      if (prior.length) await guardedDelete("item_timelines", prior, { cite });
      for (const r of rows) await guardedInsert("item_timelines", { ...r, item_id: it.id }, { cite });
    }
    if (prior.length) replaced += 1; else filled += 1;
    const tag = prior.length ? "replace" : "fill  ";
    console.log(`  ${EXECUTE ? "" : "would "}${tag} ${it.id.slice(0, 8)} [${it.provenance_status}] ${String(rows.length).padStart(2)} rows${skipped.length ? ` (+${skipped.length} skipped)` : ""}  ${(it.title || "").slice(0, 60)}`);
  }

  console.log(`\n=== ${EXECUTE ? "DONE" : "DRY-RUN"} ===`);
  console.log(`filled (was empty): ${filled} · replaced (had rows): ${replaced} · timeline rows written: ${EXECUTE ? totalRows : `${totalRows} (would)`}`);
  console.log(`date-free briefs (no §14 rows, none stored): ${empty} · unparseable tokens skipped: ${totalSkipped}`);
  if (items.length) console.log(`last id processed this run (for --after-id resume): ${items[items.length - 1].id}`);
  if (heldItems.length) {
    console.log(`\nHELD (stored rows kept — fresh parse produced 0; investigate, never silently destroy): ${heldItems.length}`);
    for (const h of heldItems) console.log(`  - ${h}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
