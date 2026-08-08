#!/usr/bin/env node
/**
 * list-order-orphan-sweep — resolve-or-delete for user_list_order rows whose
 * item no longer EXISTS anywhere the list could render it.
 *
 * THE DEBT THIS RETIRES (tech-debt-log 2026-08-08): the personal drag order
 * (migrations 237 + 238) stores one row per (user, list_key, item_id) and
 * nothing deleted rows when the underlying item left the system. Built the
 * same day the debt was logged, before the first orphan could accrue
 * (user_list_order was EMPTY at build time — verified live).
 *
 * ORPHAN DEFINITION — deliberately CONSERVATIVE (unresolvable, not merely
 * invisible): a row is an orphan ONLY when its item_id cannot resolve to any
 * existing row of the list's backing store:
 *
 *   regulations / market / research / operations
 *       item_id is the surface Resource id (legacy_id || uuid). Orphan when no
 *       intelligence_items row matches id::text OR legacy_id.
 *   watchlist
 *       item_id is watchlistOrderKey `type:id` (watchlist-order.ts). Orphan
 *       when the id half matches no intelligence_items row (id/legacy_id) for
 *       non-source types, no sources row (id::text) for type 'source' — OR
 *       when NO user_watchlist/org_watchlist row for that (type, id) exists
 *       at all (nobody watches it on any scope: unreachable by any render).
 *
 * NOT deleted, on purpose: rows for items that are archived, dismissed,
 * retagged out of a band, or filtered out. Those items can return to the
 * list, and their stored position is what makes the return land where the
 * user put it. An invisible position is dead weight; a deleted one is a lost
 * arrangement. We only delete what can never render again.
 *
 * DISPATCH SHAPE (verification-before-authorization): DRY-RUN BY DEFAULT —
 * prints per-list orphan counts and the full id list, writes nothing. --apply
 * deletes via the guarded path (rule 015: cite + prior-state snapshot) and
 * read-back verifies the count went to zero. Run cadence: with the monthly
 * spot-check lane, or after any bulk item deletion.
 *
 *   node scripts/maintenance/list-order-orphan-sweep.mjs           # report
 *   node scripts/maintenance/list-order-orphan-sweep.mjs --apply   # delete
 */

import { readClient, guardedDelete } from "../lib/db.mjs";

try {
  process.loadEnvFile?.(new URL("../../.env", import.meta.url).pathname);
} catch {
  // .env absent (CI, sandbox): readClient() will throw its own precise error
  // if the env vars are genuinely missing at call time.
}

const APPLY = process.argv.includes("--apply");

const ITEM_LISTS = ["regulations", "market", "research", "operations"];

async function main() {
  const db = readClient();

  const { data: rows, error } = await db
    .from("user_list_order")
    .select("id, user_id, list_key, item_id");
  if (error) throw new Error(`user_list_order read failed: ${error.message}`);
  if (!rows || rows.length === 0) {
    console.log("list-order-orphan-sweep: user_list_order is empty — nothing to do.");
    return;
  }

  // Resolve the full item universe once (bounded: id + legacy_id only).
  const { data: items, error: iErr } = await db
    .from("intelligence_items")
    .select("id, legacy_id");
  if (iErr) throw new Error(`intelligence_items read failed: ${iErr.message}`);
  const itemIds = new Set();
  for (const i of items ?? []) {
    itemIds.add(String(i.id));
    if (i.legacy_id) itemIds.add(String(i.legacy_id));
  }

  const { data: sources, error: sErr } = await db.from("sources").select("id");
  if (sErr) throw new Error(`sources read failed: ${sErr.message}`);
  const sourceIds = new Set((sources ?? []).map((s) => String(s.id)));

  // Watchlist membership across both scopes: `type:id` keys anyone still watches.
  const watched = new Set();
  for (const table of ["user_watchlist", "org_watchlist"]) {
    const { data, error: wErr } = await db.from(table).select("item_type, item_id");
    if (wErr) throw new Error(`${table} read failed: ${wErr.message}`);
    for (const w of data ?? []) watched.add(`${w.item_type}:${w.item_id}`);
  }

  const orphans = [];
  for (const row of rows) {
    if (ITEM_LISTS.includes(row.list_key)) {
      if (!itemIds.has(row.item_id)) orphans.push(row);
    } else if (row.list_key === "watchlist") {
      const sep = row.item_id.indexOf(":");
      const type = sep > 0 ? row.item_id.slice(0, sep) : "";
      const bare = sep > 0 ? row.item_id.slice(sep + 1) : row.item_id;
      const exists = type === "source" ? sourceIds.has(bare) : itemIds.has(bare);
      if (!exists || !watched.has(row.item_id)) orphans.push(row);
    }
    // Unknown list_key: leave untouched — the route allowlist should make this
    // unreachable; deleting on an assumption would be the wrong failure mode.
  }

  const byList = {};
  for (const o of orphans) (byList[o.list_key] ??= []).push(o);
  console.log(
    `list-order-orphan-sweep: ${rows.length} rows scanned, ${orphans.length} orphan(s).`
  );
  for (const [k, v] of Object.entries(byList)) {
    console.log(`  ${k}: ${v.length}`);
    for (const o of v) console.log(`    ${o.id}  user=${o.user_id}  item_id=${o.item_id}`);
  }

  if (orphans.length === 0) return;
  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to delete the rows above (guarded, snapshotted).");
    return;
  }

  const { deleted, snapshot } = await guardedDelete(
    "user_list_order",
    orphans.map((o) => o.id),
    {
      cite: {
        skill: "remediation-discipline",
        reason:
          "list-order orphan sweep (tech-debt 2026-08-08): delete stored positions whose item_id resolves to no existing item/source/watch row on any scope",
      },
    }
  );
  console.log(`Deleted ${deleted} row(s); prior state snapshotted at ${snapshot}.`);

  // Read-back verification: the deleted ids must be gone.
  const { data: still, error: vErr } = await db
    .from("user_list_order")
    .select("id")
    .in("id", orphans.map((o) => o.id));
  if (vErr) throw new Error(`verification read failed: ${vErr.message}`);
  if ((still ?? []).length > 0) {
    throw new Error(`VERIFICATION FAILED: ${still.length} orphan row(s) survived the delete.`);
  }
  console.log("Read-back verified: zero surviving orphan rows.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
