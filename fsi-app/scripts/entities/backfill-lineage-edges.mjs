#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readAll, guardedInsertMany, guardedInsert, guardedUpdate } from "../lib/db.mjs";
import { planLinkWrites } from "../../src/lib/entities/entity-resolve.mjs";
// lane G5-READ: an adopted `standard` term is a named entity to the same planner the runtime calls.
import { adoptedTermsFromSupabase } from "../../src/lib/vocabulary/adopted-terms.mjs";
import { partitionLineageWrites } from "../../src/lib/entities/lineage-backfill.mjs";
// lane G7-CORR: an admin-removed connection (item_corrections tombstone, migration 356) is never re-created.
import { readAllCorrections, tombstonedPairKeys } from "../../src/lib/corrections/item-corrections.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";

loadLocalEnvFile();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DRY = !APPLY; // --dry is the DEFAULT here — the inverse of backfill-edges.mjs's posture, deliberately
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : null;
const ONLY_ITEM = args.includes("--item") ? args[args.indexOf("--item") + 1] : null;

const CITE = {
  skill: "WO-28-phase-D-lineage-backfill",
  reason: "WO-28 phase D: feed the typed-lineage-edge capability (PR #481, classifyRelationship/planLinkWrites) that shipped with 0 live typed edges — $0 backfill over intelligence_item_sections content, no metered fetch, no LLM.",
};

// Assigned inside the isMainModule guard at the bottom of this file (F44/F67): createClient() throws
// immediately on a missing URL/key, so it must never run at plain import time.
let sb;

// ── loads ────────────────────────────────────────────────────────────────

// Resolution corpus — mirrors link-items.ts's `linkItems` corpus query EXACTLY (columns + filter).
async function loadCorpus() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("intelligence_items").select("id,title,instrument_identifier")
      .eq("is_archived", false).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`corpus read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

// Bulk load (not per-item — the corpus can run to thousands of rows; N+1 queries here would be the same
// read-cap-adjacent cost mistake case-file 9 exists to prevent, just on the read-count axis instead of the
// row-count axis). Grouped/ordered in memory afterward.
async function loadFullBriefById() {
  const rows = await readAll("intelligence_items", "id,full_brief", { match: (q) => q.eq("is_archived", false) });
  return new Map(rows.map((r) => [r.id, r.full_brief || ""]));
}
async function loadSectionsByItem() {
  const rows = await readAll("intelligence_item_sections", "item_id,section_order,content_md");
  const byItem = new Map();
  for (const r of rows) {
    if (!byItem.has(r.item_id)) byItem.set(r.item_id, []);
    byItem.get(r.item_id).push(r);
  }
  for (const list of byItem.values()) list.sort((a, b) => a.section_order - b.section_order);
  return byItem;
}
async function loadExistingEdgesByPair() {
  const rows = await readAll("item_cross_references", "id,source_item_id,target_item_id,origin,relationship,basis");
  const m = new Map();
  for (const r of rows) m.set(`${r.source_item_id}|${r.target_item_id}`, r);
  return { byPair: m, rows };
}

function assembleContent(itemId, fullBriefById, sectionsByItem) {
  const brief = fullBriefById.get(itemId) || "";
  const sections = (sectionsByItem.get(itemId) || []).map((s) => s.content_md || "").join(" ");
  return `${brief} ${sections}`.trim();
}

// rule-015 prior-state snapshot: count + md5 of the LIVE edge set, taken and printed BEFORE any write —
// the reversibility record for this run.
function snapshotEdgeState(existingRows) {
  const lines = existingRows
    .map((r) => `${r.source_item_id}|${r.target_item_id}|${r.origin}|${r.relationship}`)
    .sort();
  const md5 = createHash("md5").update(lines.join("\n")).digest("hex");
  return { count: lines.length, md5 };
}

async function existingOpenFlag(itemId, createdBy) {
  const { data, error } = await sb.from("integrity_flags").select("id")
    .eq("subject_ref", itemId).eq("created_by", createdBy).eq("status", "open").maybeSingle();
  if (error) throw new Error(`integrity_flags open-check failed for ${itemId}/${createdBy}: ${error.message}`);
  return data || null;
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[lineage-backfill] mode = ${DRY ? "DRY-RUN (default)" : "APPLY"}${ONLY_ITEM ? ` item=${ONLY_ITEM}` : ""}${LIMIT ? ` limit=${LIMIT}` : ""}`);

  const corpus = await loadCorpus();
  console.log(`[lineage-backfill] resolution corpus: ${corpus.length} non-archived items (id,title,instrument_identifier — no provenance_status filter, mirrors link-items.ts)`);

  const [fullBriefById, sectionsByItem, { byPair: existingEdgesByPair, rows: existingEdgeRows }] = await Promise.all([
    loadFullBriefById(),
    loadSectionsByItem(),
    loadExistingEdgesByPair(),
  ]);

  const tombstones = tombstonedPairKeys(await readAllCorrections(sb));
  const adoptedTerms = await adoptedTermsFromSupabase(sb); // once per run, fail-closed to none
  const snap = snapshotEdgeState(existingEdgeRows);
  console.log(`[lineage-backfill] PRIOR STATE (rule-015 snapshot, before any write): ${snap.count} item_cross_references rows, md5=${snap.md5}`);
  const typedAlready = existingEdgeRows.filter((r) => r.relationship !== "related").length;
  console.log(`[lineage-backfill] of those, ${typedAlready} already carry a non-'related' relationship.`);

  let targetItems = corpus;
  if (ONLY_ITEM) targetItems = corpus.filter((c) => c.id === ONLY_ITEM);
  if (LIMIT) targetItems = targetItems.slice(0, LIMIT);

  let scanned = 0, withContent = 0, skippedShort = 0;
  const relationshipCounts = {};
  const allInsertRows = [];
  const allUpgrades = [];
  let totalSkippedForeign = 0, totalConflicts = 0, totalUnchanged = 0, totalSkippedTombstoned = 0;
  let flagsOpened = 0, flagsAlreadyOpen = 0;

  for (const item of targetItems) {
    scanned++;
    const content = assembleContent(item.id, fullBriefById, sectionsByItem);
    if (content.length < 20) { skippedShort++; continue; }
    withContent++;

    // THE SAME pure planner the runtime calls — no reimplemented typing.
    const writes = planLinkWrites(content, corpus, item.id, adoptedTerms);

    const { inserts, upgrades, skippedForeign, conflicts, unchanged, skippedTombstoned } = partitionLineageWrites(writes, existingEdgesByPair, tombstones);
    for (const r of inserts) { relationshipCounts[r.relationship] = (relationshipCounts[r.relationship] || 0) + 1; allInsertRows.push(r); }
    for (const u of upgrades) { relationshipCounts[u.relationship] = (relationshipCounts[u.relationship] || 0) + 1; allUpgrades.push(u); }
    totalSkippedForeign += skippedForeign.length;
    totalConflicts += conflicts.length;
    totalUnchanged += unchanged.length;
    totalSkippedTombstoned += skippedTombstoned.length;

    for (const w of writes) {
      if (w.table !== "integrity_flags") continue;
      const createdBy = w.row.created_by;
      const existing = await existingOpenFlag(item.id, createdBy);
      if (existing) { flagsAlreadyOpen++; continue; }
      flagsOpened++;
      if (APPLY) await guardedInsert("integrity_flags", w.row, { cite: CITE });
    }
  }

  console.log(`\n[lineage-backfill] items scanned: ${scanned}; with content (>=20 chars): ${withContent}; skipped (short/no content): ${skippedShort}`);
  console.log(`[lineage-backfill] typed edges by relationship (insert+upgrade combined): ${JSON.stringify(relationshipCounts)}`);
  console.log(`[lineage-backfill] edges: ${allInsertRows.length} to insert, ${allUpgrades.length} to upgrade, ${totalSkippedForeign} skipped (manual origin, or generic claim on a foreign row: never touched), ${totalConflicts} conflict(s) (foreign row already typed differently: reported, not written), ${totalUnchanged} already correct (no-op), ${totalSkippedTombstoned} skipped (admin-removed connection: never re-created)`);
  console.log(`[lineage-backfill] integrity_flags: ${flagsOpened} to open (surface + lineage-gap combined), ${flagsAlreadyOpen} already open`);
  console.log(`[lineage-backfill] prior-state snapshot: ${snap.count} rows, md5=${snap.md5}`);

  if (DRY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
    process.exit(0);
  }

  if (allInsertRows.length) {
    const res = await guardedInsertMany("item_cross_references", allInsertRows, { cite: CITE, select: "id" });
    console.log(`[lineage-backfill] inserted ${res.inserted} edge rows.`);
  } else {
    console.log("[lineage-backfill] no edge rows to insert.");
  }

  let upgradeOk = 0, upgradeFail = 0;
  for (const u of allUpgrades) {
    try {
      await guardedUpdate(
        "item_cross_references",
        (qb) => qb.eq("id", u.id),
        { relationship: u.relationship, basis: u.basis },
        { cite: CITE, select: "id,relationship" }
      );
      upgradeOk++;
    } catch (e) {
      console.error(`[lineage-backfill] upgrade FAIL edge ${u.id} (${u.source_item_id}->${u.target_item_id}): ${e.message}`);
      upgradeFail++;
    }
  }
  console.log(`[lineage-backfill] upgraded ${upgradeOk} edge rows${upgradeFail ? ` (${upgradeFail} FAILURES — see above)` : ""}.`);
  console.log(`[lineage-backfill] flags opened this run: ${flagsOpened}.`);
  console.log("[lineage-backfill] APPLY complete.");
  process.exit(upgradeFail ? 1 : 0);
}

// Guarded (F44/F67): the no-creds self-skip exit, the `sb` client, and main() all move inside
// isMainModule, so importing this module never exits the process or runs the backfill.
if (isMainModule(import.meta.url)) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("backfill-lineage-edges: no DB creds — cannot run here (exit 2)."); // glyph:verbatim (pre-existing message text, relocated unchanged)
    process.exit(2);
  }
  sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  main().catch((e) => {
    console.error(`[lineage-backfill] FATAL: ${e.message}`);
    process.exit(1);
  });
}
