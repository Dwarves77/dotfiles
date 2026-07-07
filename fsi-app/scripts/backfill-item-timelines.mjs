// scripts/backfill-item-timelines.mjs
//
// §14 TIMELINE BACKFILL (Phase-3b, DATE-AND-DEDUP-AUDIT DD-01/DD-02, operator-ruled block).
// The corpus audit: of 89 verified reg-family briefs carrying real compliance dates, exactly ONE
// had a correct complete timeline — ~85% had NO structured timeline (the dates live only in the
// brief prose, often in a fully-written §14 "Confirmed Regulatory Timeline"), and the few stored
// timelines were mostly WRONG (PPWR stored Aug-1 where the prose says 12 August 2026 ~8×).
// Root cause: item_timelines had NO production writer (one seed migration only).
//
// THIS SCRIPT re-harvests the STORED corpus MECHANICALLY — the dates are already in the briefs, so
// this is a zero-Sonnet, zero-Browserless parse (retrieval-before-generation: the model already did
// the reading; we harvest its output). The forward half (every future generation) is wired in
// canonical-pipeline sectionBrief. Same parser + normalizer both directions:
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
// correct timelines for when they recover). No spend of any kind.
//
// RUN:
//   node scripts/backfill-item-timelines.mjs             # dry-run: per-item counts + skipped tokens
//   node scripts/backfill-item-timelines.mjs --execute   # guarded replace
//   node scripts/backfill-item-timelines.mjs --item <uuid>  # single item (either mode)

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readAll, guardedDelete, guardedInsert } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may be preloaded */ }

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { extractRegulationSections } = await jiti.import("../src/lib/agent/extract-regulation-sections.ts");
const { buildTimelineRows } = await jiti.import("../src/lib/agent/timeline-harvest.mjs");

const EXECUTE = process.argv.includes("--execute");
const itemFlag = process.argv.indexOf("--item");
const ONLY_ITEM = itemFlag > -1 ? process.argv[itemFlag + 1] : null;

const REG_FAMILY = ["regulation", "directive", "standard", "guidance", "framework"];
const TODAY = new Date().toISOString().slice(0, 10);

const cite = {
  skill: "environmental-policy-and-innovation",
  reason: "Phase-3b timeline backfill (DD-01/DD-02): mechanical §14 harvest from stored briefs into item_timelines — the dates the model already extracted, structured; precision-honest, zero spend",
};

async function main() {
  console.log(`\nbackfill-item-timelines — ${EXECUTE ? "EXECUTE" : "DRY-RUN"} (today=${TODAY})\n`);

  const items = await readAll("intelligence_items", "id, legacy_id, title, item_type, provenance_status, full_brief", {
    match: (q) => {
      let qq = q.in("item_type", REG_FAMILY).not("full_brief", "is", null);
      if (ONLY_ITEM) qq = qq.eq("id", ONLY_ITEM);
      return qq;
    },
  });
  console.log(`scope: ${items.length} reg-family items with a full_brief\n`);

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
  if (heldItems.length) {
    console.log(`\nHELD (stored rows kept — fresh parse produced 0; investigate, never silently destroy): ${heldItems.length}`);
    for (const h of heldItems) console.log(`  - ${h}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
