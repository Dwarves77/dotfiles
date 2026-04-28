// Phase A.5.a — idempotent migration of legacy intelligence content
// into item_* tables. Mirrors supabase/migrations/010_migrate_legacy_to_item.sql
// in DML form, executed through the @supabase/supabase-js client because
// DDL/multi-statement SQL cannot be sent through the JS client and we
// don't have a database password configured for direct psql/CLI.
//
// Idempotent: re-running this script after it has fully landed produces
// zero inserts (every legacy row's natural key is matched against the
// existing item_* rows before insertion).
//
// Run:    node supabase/seed/apply-010-migration.mjs

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAIRS = [
  ["changelog", "item_changelog"],
  ["disputes", "item_disputes"],
  ["cross_references", "item_cross_references"],
  ["supersessions", "item_supersessions"],
  ["timelines", "item_timelines"],
];

async function counts() {
  const result = {};
  for (const [legacy, item] of PAIRS) {
    const [{ count: lc }, { count: ic }] = await Promise.all([
      supabase.from(legacy).select("*", { count: "exact", head: true }),
      supabase.from(item).select("*", { count: "exact", head: true }),
    ]);
    result[legacy] = lc;
    result[item] = ic;
  }
  return result;
}

function normalizeDate(s) {
  if (!s) return null;
  if (s.length === 7) return `${s}-01`;
  return s;
}

function impactLevel(impact) {
  if (!impact) return "MODERATE";
  const u = impact.toUpperCase();
  if (u.startsWith("CRITICAL")) return "CRITICAL";
  if (u.startsWith("HIGH")) return "HIGH";
  if (u.startsWith("LOW")) return "LOW";
  return "MODERATE";
}

const VALID_REL = new Set(["related", "supersedes", "implements", "conflicts", "amends", "depends_on"]);

function normalizeRelationship(rel) {
  if (rel === "references") return "related";
  if (VALID_REL.has(rel)) return rel;
  return "related";
}

const orphans = []; // { legacyTable, legacyId, resourceId } per missed JOIN

function recordOrphan(legacyTable, legacyId, resourceId) {
  orphans.push({ legacyTable, legacyId, resourceId });
}

// ── Pre-flight ──────────────────────────────────────────────────
console.log("\n── Pre-flight row counts ──");
const before = await counts();
for (const [legacy, item] of PAIRS) {
  console.log(`  ${legacy.padEnd(20)} ${String(before[legacy]).padStart(4)}    →    ${item.padEnd(28)} ${String(before[item]).padStart(4)}`);
}

// Build legacy_id → uuid map from intelligence_items
const { data: items } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id")
  .not("legacy_id", "is", null);
const legacyToUuid = new Map();
for (const it of items || []) legacyToUuid.set(it.legacy_id, it.id);
console.log(`\n  intelligence_items legacy_id map: ${legacyToUuid.size} entries`);


// ── 1. changelog → item_changelog ───────────────────────────────
console.log("\n── 1. changelog → item_changelog ──");
{
  const [{ data: legacy }, { data: existing }] = await Promise.all([
    supabase.from("changelog").select("*"),
    supabase.from("item_changelog").select("item_id, change_date, field"),
  ]);
  const existingKeys = new Set((existing || []).map((r) => `${r.item_id}|${r.change_date}|${r.field}`));
  const toInsert = [];
  for (const c of legacy || []) {
    const itemUuid = legacyToUuid.get(c.resource_id);
    if (!itemUuid) {
      recordOrphan("changelog", c.id, c.resource_id);
      continue;
    }
    const field = (c.fields && c.fields[0]) || "(unspecified)";
    const key = `${itemUuid}|${c.date}|${field}`;
    if (existingKeys.has(key)) continue;
    toInsert.push({
      item_id: itemUuid,
      change_date: c.date,
      change_type: c.type,
      field,
      previous_value: c.prev_value || "",
      new_value: c.now_value || "",
      impact: c.impact,
      impact_level: impactLevel(c.impact),
      created_at: c.created_at,
    });
  }
  if (toInsert.length) {
    const { error } = await supabase.from("item_changelog").insert(toInsert);
    if (error) throw new Error(`item_changelog insert: ${error.message}`);
    console.log(`  inserted: ${toInsert.length}`);
  } else {
    console.log("  inserted: 0 (already in sync)");
  }
}


// ── 2. disputes → item_disputes ─────────────────────────────────
console.log("\n── 2. disputes → item_disputes ──");
{
  const [{ data: legacy }, { data: existing }] = await Promise.all([
    supabase.from("disputes").select("*"),
    supabase.from("item_disputes").select("item_id, note"),
  ]);
  const existingKeys = new Set((existing || []).map((r) => `${r.item_id}|${r.note}`));
  const toInsert = [];
  for (const d of legacy || []) {
    const itemUuid = legacyToUuid.get(d.resource_id);
    if (!itemUuid) {
      recordOrphan("disputes", d.id, d.resource_id);
      continue;
    }
    const key = `${itemUuid}|${d.note}`;
    if (existingKeys.has(key)) continue;
    toInsert.push({
      item_id: itemUuid,
      is_active: d.active,
      note: d.note,
      disputing_sources: d.sources || [],
      created_at: d.created_at,
    });
  }
  if (toInsert.length) {
    const { error } = await supabase.from("item_disputes").insert(toInsert);
    if (error) throw new Error(`item_disputes insert: ${error.message}`);
    console.log(`  inserted: ${toInsert.length}`);
  } else {
    console.log("  inserted: 0 (already in sync)");
  }
}


// ── 3. cross_references → item_cross_references ─────────────────
console.log("\n── 3. cross_references → item_cross_references ──");
{
  const { data: legacy } = await supabase.from("cross_references").select("*");
  // ON CONFLICT DO NOTHING via upsert(ignoreDuplicates) since the table
  // already declares UNIQUE(source_item_id, target_item_id).
  const toUpsert = [];
  for (const x of legacy || []) {
    const srcUuid = legacyToUuid.get(x.source_id);
    const tgtUuid = legacyToUuid.get(x.target_id);
    if (!srcUuid) {
      recordOrphan("cross_references.source", x.id, x.source_id);
      continue;
    }
    if (!tgtUuid) {
      recordOrphan("cross_references.target", x.id, x.target_id);
      continue;
    }
    toUpsert.push({
      source_item_id: srcUuid,
      target_item_id: tgtUuid,
      relationship: normalizeRelationship(x.relationship),
    });
  }
  if (toUpsert.length) {
    const { error } = await supabase
      .from("item_cross_references")
      .upsert(toUpsert, { onConflict: "source_item_id,target_item_id", ignoreDuplicates: true });
    if (error) throw new Error(`item_cross_references upsert: ${error.message}`);
    console.log(`  candidates: ${toUpsert.length} (ON CONFLICT DO NOTHING)`);
  } else {
    console.log("  candidates: 0");
  }
}


// ── 4. supersessions → item_supersessions ───────────────────────
console.log("\n── 4. supersessions → item_supersessions ──");
{
  const [{ data: legacy }, { data: existing }] = await Promise.all([
    supabase.from("supersessions").select("*"),
    supabase.from("item_supersessions").select("old_item_id, new_item_id, supersession_date"),
  ]);
  const existingKeys = new Set(
    (existing || []).map((r) => `${r.old_item_id}|${r.new_item_id}|${r.supersession_date}`)
  );
  const toInsert = [];
  for (const s of legacy || []) {
    const oldUuid = legacyToUuid.get(s.old_id);
    const newUuid = legacyToUuid.get(s.new_id);
    if (!oldUuid) {
      recordOrphan("supersessions.old", s.id, s.old_id);
      continue;
    }
    if (!newUuid) {
      recordOrphan("supersessions.new", s.id, s.new_id);
      continue;
    }
    const date = normalizeDate(s.date);
    const key = `${oldUuid}|${newUuid}|${date}`;
    if (existingKeys.has(key)) continue;
    toInsert.push({
      old_item_id: oldUuid,
      new_item_id: newUuid,
      supersession_date: date,
      severity: s.severity,
      note: s.note || "",
      created_at: s.created_at,
    });
  }
  if (toInsert.length) {
    const { error } = await supabase.from("item_supersessions").insert(toInsert);
    if (error) throw new Error(`item_supersessions insert: ${error.message}`);
    console.log(`  inserted: ${toInsert.length}`);
  } else {
    console.log("  inserted: 0 (already in sync)");
  }
}


// ── 5. timelines → item_timelines ───────────────────────────────
console.log("\n── 5. timelines → item_timelines ──");
{
  const [{ data: legacy }, { data: existing }] = await Promise.all([
    supabase.from("timelines").select("*"),
    supabase.from("item_timelines").select("item_id, milestone_date, label"),
  ]);
  const existingKeys = new Set(
    (existing || []).map((r) => `${r.item_id}|${r.milestone_date}|${r.label}`)
  );
  const toInsert = [];
  for (const t of legacy || []) {
    const itemUuid = legacyToUuid.get(t.resource_id);
    if (!itemUuid) {
      recordOrphan("timelines", t.id, t.resource_id);
      continue;
    }
    const date = normalizeDate(t.date);
    const key = `${itemUuid}|${date}|${t.label}`;
    if (existingKeys.has(key)) continue;
    toInsert.push({
      item_id: itemUuid,
      milestone_date: date,
      label: t.label,
      is_completed: t.status === "past" || t.status === "completed",
      sort_order: t.sort_order || 0,
    });
  }
  if (toInsert.length) {
    const { error } = await supabase.from("item_timelines").insert(toInsert);
    if (error) throw new Error(`item_timelines insert: ${error.message}`);
    console.log(`  inserted: ${toInsert.length}`);
  } else {
    console.log("  inserted: 0 (already in sync)");
  }
}


// ── Orphans report ───────────────────────────────────────────────
if (orphans.length) {
  console.log(`\n── Orphans (legacy rows whose resource_id had no matching intelligence_items.legacy_id) ──`);
  for (const o of orphans) {
    console.log(`  ${o.legacyTable} id=${o.legacyId} → resource_id=${o.resourceId}`);
  }
} else {
  console.log("\n── Orphans: none ──");
}


// ── Post-flight ─────────────────────────────────────────────────
console.log("\n── Post-flight row counts ──");
const after = await counts();
for (const [legacy, item] of PAIRS) {
  const lcDelta = after[legacy] - before[legacy];
  const icDelta = after[item] - before[item];
  const lcStr = lcDelta === 0 ? `${after[legacy]}` : `${after[legacy]} (${lcDelta >= 0 ? "+" : ""}${lcDelta})`;
  const icStr = icDelta === 0 ? `${after[item]}` : `${after[item]} (${icDelta >= 0 ? "+" : ""}${icDelta})`;
  console.log(`  ${legacy.padEnd(20)} ${lcStr.padStart(8)}    →    ${item.padEnd(28)} ${icStr.padStart(8)}`);
}

console.log("\n✓ Migration 010 applied.");
