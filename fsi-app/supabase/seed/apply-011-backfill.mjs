// Phase A.5.a.2 — backfill ghost intelligence_items for orphan
// supersessions, then complete the item_supersessions migration.
//
// See supabase/migrations/011_backfill_orphan_supersessions.sql for
// the SQL spec. This script implements the same data effect via the
// @supabase/supabase-js client because DDL/multi-statement SQL can't
// be sent through the JS client.
//
// Run:    node supabase/seed/apply-011-backfill.mjs

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeDate(s) {
  if (!s) return null;
  if (s.length === 7) return `${s}-01`;
  return s;
}

// ── 0. Pre-state ─────────────────────────────────────────────────
console.log("\n── Pre-state ──");
const [{ count: iiBefore }, { count: ssBefore }, { count: itemSsBefore }] = await Promise.all([
  supabase.from("intelligence_items").select("*", { count: "exact", head: true }),
  supabase.from("supersessions").select("*", { count: "exact", head: true }),
  supabase.from("item_supersessions").select("*", { count: "exact", head: true }),
]);
console.log(`  intelligence_items: ${iiBefore}`);
console.log(`  supersessions:      ${ssBefore}`);
console.log(`  item_supersessions: ${itemSsBefore}`);

// ── 1. Identify orphans ──────────────────────────────────────────
const { data: items } = await supabase
  .from("intelligence_items")
  .select("legacy_id")
  .not("legacy_id", "is", null);
const knownLegacy = new Set((items || []).map((i) => i.legacy_id));

const { data: ssRows } = await supabase
  .from("supersessions")
  .select("*");

const orphans = (ssRows || []).filter((s) => !knownLegacy.has(s.old_id));
console.log(`\n── Orphan supersessions: ${orphans.length} ──`);
for (const o of orphans) {
  console.log(`  ${o.old_id.padEnd(5)} ${o.old_title}`);
}
if (orphans.length === 0) {
  console.log("  (none — backfill is a no-op)");
}

// ── 2. Backfill ghost intelligence_items ─────────────────────────
const ghostRows = orphans.map((o) => ({
  legacy_id: o.old_id,
  title: o.old_title,
  summary:
    "Pre-tracking historical record. Superseded before continuous tracking began.",
  reasoning:
    "Backfilled to preserve supersession audit trail during legacy-to-item schema unification.",
  domain: 1,
  status: "superseded",
  confidence: "unconfirmed",
  is_archived: true,
  source_url: o.old_url || "",
}));

if (ghostRows.length) {
  const { error } = await supabase
    .from("intelligence_items")
    .upsert(ghostRows, { onConflict: "legacy_id", ignoreDuplicates: true });
  if (error) {
    console.error("\n✗ Ghost backfill failed:", error);
    process.exit(1);
  }
  console.log(`\n✓ Backfilled ${ghostRows.length} ghost intelligence_items rows.`);
} else {
  console.log("\n✓ No ghost rows needed.");
}

// ── 3. Re-run the supersessions migration branch ─────────────────
console.log("\n── Migrating supersessions → item_supersessions ──");

// Refresh legacy → uuid map (now includes ss1..ss5)
const { data: itemsAfter } = await supabase
  .from("intelligence_items")
  .select("id, legacy_id")
  .not("legacy_id", "is", null);
const legacyToUuid = new Map();
for (const it of itemsAfter || []) legacyToUuid.set(it.legacy_id, it.id);

const { data: existingSs } = await supabase
  .from("item_supersessions")
  .select("old_item_id, new_item_id, supersession_date");
const existingKeys = new Set(
  (existingSs || []).map((r) => `${r.old_item_id}|${r.new_item_id}|${r.supersession_date}`)
);

const toInsert = [];
const stillOrphan = [];
for (const s of ssRows || []) {
  const oldUuid = legacyToUuid.get(s.old_id);
  const newUuid = legacyToUuid.get(s.new_id);
  if (!oldUuid) {
    stillOrphan.push({ side: "old", legacyId: s.old_id, supersessionId: s.id });
    continue;
  }
  if (!newUuid) {
    stillOrphan.push({ side: "new", legacyId: s.new_id, supersessionId: s.id });
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
  if (error) {
    console.error("\n✗ item_supersessions insert failed:", error);
    process.exit(1);
  }
  console.log(`✓ Inserted ${toInsert.length} item_supersessions rows.`);
} else {
  console.log("✓ Already in sync — no inserts.");
}

if (stillOrphan.length) {
  console.log(`\n⚠ Still-orphan rows after backfill: ${stillOrphan.length}`);
  for (const o of stillOrphan) console.log("  ", o);
}

// ── 4. Verify ────────────────────────────────────────────────────
console.log("\n── Post-state verification ──");

const { count: ghostCount } = await supabase
  .from("intelligence_items")
  .select("*", { count: "exact", head: true })
  .like("legacy_id", "ss%");
const { count: itemSsAfter } = await supabase
  .from("item_supersessions")
  .select("*", { count: "exact", head: true });

// Verify each item_supersessions row has a resolvable old_item_id
const { data: ssRowsCheck } = await supabase
  .from("item_supersessions")
  .select("old_item_id, old:intelligence_items!old_item_id(id, legacy_id)");
const brokenFk = (ssRowsCheck || []).filter((r) => !r.old);

console.log(`  ghost intelligence_items (legacy_id LIKE 'ss%'): ${ghostCount}`);
console.log(`  item_supersessions row count:                    ${itemSsAfter}`);
console.log(`  item_supersessions rows with unresolvable old_item_id: ${brokenFk.length}`);

// Assertions per the user spec
const expectedGhostCount = 5;
const expectedItemSsCount = 5;
let ok = true;
if (ghostCount !== expectedGhostCount) {
  console.error(`✗ Expected ${expectedGhostCount} ghost rows, got ${ghostCount}`);
  ok = false;
}
if (itemSsAfter !== expectedItemSsCount) {
  console.error(`✗ Expected ${expectedItemSsCount} item_supersessions rows, got ${itemSsAfter}`);
  ok = false;
}
if (brokenFk.length !== 0) {
  console.error(`✗ ${brokenFk.length} item_supersessions row(s) have unresolvable old_item_id`);
  ok = false;
}

if (!ok) {
  console.error("\n✗ Verification failed.");
  process.exit(1);
}

console.log("\n✓ Migration 011 applied. All assertions passed.");
