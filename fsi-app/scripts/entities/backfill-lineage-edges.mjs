#!/usr/bin/env node
// backfill-lineage-edges.mjs — WO-28 PHASE D. Feeds the typed-lineage-edge capability that PR #481
// shipped (entity-resolve.mjs's classifyRelationship + planLinkWrites, item_cross_references.relationship
// in {implements, amends, depends_on, ...} + integrity_flags category='coverage_gap',
// created_by='lineage-gap:absent-parent') but never connected to a producer that runs unmetered: the ONLY
// caller of linkItems is src/workflows/generate-brief.ts:295 (linkStep), which fires only during metered
// brief regeneration. Verified live 2026-08-29 (coordinator): 0 rows in item_cross_references carry a
// relationship other than 'related'. The capability shipped with nothing to feed it — this is the $0
// backfill that feeds it, over the WHOLE corpus, once, without spending anything.
//
// SAME PLANNER AS THE RUNTIME, NO REIMPLEMENTATION: every item is run through planLinkWrites — the exact
// pure function linkItems calls — so a backfilled edge and a runtime-produced edge can never diverge in
// how they're typed. This file (and lineage-backfill.mjs) contain ZERO typing logic of their own.
//
// ── CONTENT SOURCE: DELIBERATE DEVIATION FROM link-items.ts, DOCUMENTED ──
// linkItems assembles its content argument from intelligence_items.full_brief + the concatenation of
// agent_run_searches.result_content for that item — the METERED grounding-search pool captured during that
// item's OWN generation run. A $0, whole-corpus backfill has no generation run to piggyback on, and
// re-fetching/re-running search for every existing item to reconstruct that pool would not be $0 — it would
// be the metered spend this script exists specifically to avoid. So instead this script reads WO-7's
// precedent that every item's content is already durably stored, at rest, in intelligence_item_sections:
// content_md is what the item's own detail pages already render (avg ~6,589 chars/item — WO-7 measurement),
// concatenated per item in section_order. That plus intelligence_items.full_brief (the summary paragraph
// generation writes ALONGSIDE the sections, not inside them) is the same LOGICAL corpus linkItems reads —
// "this item's own generated content" — just sourced from the table that holds it at rest instead of the
// ephemeral per-run search pool a backfill has no way to reconstruct without spending. Exactly like
// linkItems, an item whose assembled content is under 20 chars is skipped, not force-fed to the planner.
//
// ── RESOLUTION CORPUS mirrors link-items.ts EXACTLY ──
// id, title, instrument_identifier WHERE is_archived = false — NO provenance_status filter (link-items.ts
// does not filter on it either; an unverified item can still be a valid lineage-mention TARGET). Paginated
// past PostgREST's 1000-row cap (scripts/lib/db.mjs's readAll / the same fetchAllRows contract link-items.ts
// uses via src/lib/db/paginate.mjs).
//
// ── EDGE WRITES: ORIGIN OWNERSHIP (never clobber a foreign-origin edge) ──
// item_cross_references is unique on (source_item_id, target_item_id) — one row per pair, shared across
// origins manual / agent_semantic / entity_extraction / provenance_discovery (migration 252's CHECK). This
// backfill (like the linkStep runtime) writes ONLY origin='entity_extraction'. Applying write-edges.mjs's
// ORIGIN OWNERSHIP discipline (src/lib/connections/write-edges.mjs) to this origin instead of
// provenance_discovery: existing edges are read ONCE up front; a pair already entity_extraction is UPGRADED
// (relationship+basis — turning an earlier untyped 'related' entity-extraction edge into its typed
// relationship IS the whole point of WO-28); a pair owned by any OTHER origin is SKIPPED and counted, never
// touched; an absent pair is INSERTED. The decision itself (insert/upgrade/skip/unchanged) is pure and
// unit-tested without a DB in src/lib/entities/lineage-backfill.mjs (partitionLineageWrites) — this script
// only loads rows, calls it, and executes the result.
//
// ── FLAG WRITES ──
// One-open-flag dedup per (subject_ref, created_by), identical posture to link-items.ts: the ambiguous/
// unknown-standard surface flag ('intake-entity-link') and the WO-28 lineage-gap flag
// ('lineage-gap:absent-parent') are separate namespaces, each gets its own open-flag check.
//
// ── GUARDED WRITE PATH (rule 015) ──
// ALL writes here route through scripts/lib/db.mjs (guardedInsertMany / guardedInsert / guardedUpdate) with
// a CITE naming this WO. This is a deliberate departure from write-edges.mjs, which writes with a raw client
// because it IS the sanctioned src/-layer writer for its origin (backfill-edges.mjs's header explains why:
// "the write genuinely living in the src/ layer, not by a bypass trailer"). This script has no such src/
// writer of its own to delegate to — it is a scripts/-level orchestrator — so the guarded path is the
// correct rule-015 home here, not a bypass of the pattern those two files establish.
// rule-015 prior-state snapshot: before any write, the CURRENT item_cross_references table is read in full
// and reduced to a row count + md5 digest, printed BEFORE the run proceeds — the reversibility record.
//
// ── SAFETY POSTURE ──
// --dry is the DEFAULT (a deliberately SAFER default than backfill-edges.mjs's write-by-default): this
// script touches every non-archived item in the corpus rather than a scoped, already-verified subset, so
// requiring an explicit --apply to write is the appropriate extra guard for a first run at this scope.
//   --dry        (default) compute + report everything, write nothing
//   --apply      required to actually write
//   --limit N    scan at most N items from the corpus (pilot runs)
//   --item <uuid> scan exactly one item (pilot runs)
// Exit 0 done · 2 no DB creds (self-skip, never crash — the sibling-audit contract).

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedInsertMany, guardedInsert, guardedUpdate } from "../lib/db.mjs";
import { planLinkWrites } from "../../src/lib/entities/entity-resolve.mjs";
import { partitionLineageWrites } from "../../src/lib/entities/lineage-backfill.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("backfill-lineage-edges: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DRY = !APPLY; // --dry is the DEFAULT here — the inverse of backfill-edges.mjs's posture, deliberately
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : null;
const ONLY_ITEM = args.includes("--item") ? args[args.indexOf("--item") + 1] : null;

const CITE = {
  skill: "WO-28-phase-D-lineage-backfill",
  reason: "WO-28 phase D: feed the typed-lineage-edge capability (PR #481, classifyRelationship/planLinkWrites) that shipped with 0 live typed edges — $0 backfill over intelligence_item_sections content, no metered fetch, no LLM.",
};

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

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
  let totalSkippedForeign = 0, totalUnchanged = 0;
  let flagsOpened = 0, flagsAlreadyOpen = 0;

  for (const item of targetItems) {
    scanned++;
    const content = assembleContent(item.id, fullBriefById, sectionsByItem);
    if (content.length < 20) { skippedShort++; continue; }
    withContent++;

    // THE SAME pure planner the runtime calls — no reimplemented typing.
    const writes = planLinkWrites(content, corpus, item.id);

    const { inserts, upgrades, skippedForeign, unchanged } = partitionLineageWrites(writes, existingEdgesByPair);
    for (const r of inserts) { relationshipCounts[r.relationship] = (relationshipCounts[r.relationship] || 0) + 1; allInsertRows.push(r); }
    for (const u of upgrades) { relationshipCounts[u.relationship] = (relationshipCounts[u.relationship] || 0) + 1; allUpgrades.push(u); }
    totalSkippedForeign += skippedForeign.length;
    totalUnchanged += unchanged.length;

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
  console.log(`[lineage-backfill] edges: ${allInsertRows.length} to insert, ${allUpgrades.length} to upgrade, ${totalSkippedForeign} skipped (foreign origin, never touched), ${totalUnchanged} already correct (no-op)`);
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

main().catch((e) => {
  console.error(`[lineage-backfill] FATAL: ${e.message}`);
  process.exit(1);
});
