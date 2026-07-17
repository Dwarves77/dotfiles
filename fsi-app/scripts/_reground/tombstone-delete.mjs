#!/usr/bin/env node
// tombstone-delete.mjs — TOMBSTONE-THEN-DELETE (operator amendment 2026-07-16). For each item, under its lease:
// write its IDENTITY to disposition_ledger (permanent institutional memory: item_key, canonical_instrument_key,
// archive_reason, snapshot pointer, disposition) FIRST, then guarded-delete the item — fail-closed (no tombstone,
// no delete). Reaches zero-archived without losing the dedup memory. Reusable for the archive-endgame buckets and
// for duplicate merges (disposition=merged_into + --merged-into=<id>).
// Usage: node tombstone-delete.mjs <itemId|key>... --disposition=<reason> [--merged-into=<id>] [--holder=session-A] [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const DISP = (() => { const a = process.argv.find((x) => x.startsWith("--disposition=")); return a ? a.slice(14) : null; })();
const MERGED = (() => { const a = process.argv.find((x) => x.startsWith("--merged-into=")); return a ? a.slice(14) : null; })();
const HOLDER = (() => { const a = process.argv.find((x) => x.startsWith("--holder=")); return a ? a.slice(9) : "session-A"; })();
const keys = process.argv.slice(2).filter((x) => !x.startsWith("--"));
if (!keys.length || !DISP) { console.error("usage: tombstone-delete.mjs <key>... --disposition=<reason> [--merged-into=<id>] [--apply]"); process.exit(1); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, guardedInsert, guardedDelete } = await jiti.import("../lib/db.mjs");
const { acquireLease, releaseLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();

const all = await readAll("intelligence_items", "id,legacy_id,title,canonical_instrument_key,source_url,source_id,is_archived,archive_reason,full_brief", {});
const targets = keys.map((k) => all.find((x) => x.id === k || x.id.startsWith(k) || (x.legacy_id || "") === k || (x.legacy_id || "").startsWith(k))).filter(Boolean);
console.log(`\n===== TOMBSTONE-THEN-DELETE (${APPLY ? "APPLY" : "DRY-RUN"}) disposition=${DISP}${MERGED ? ` merged_into=${MERGED.slice(0, 8)}` : ""} =====`);
for (const it of targets) console.log(`  ${it.id.slice(0, 8)} ${it.legacy_id || ""} | arch=${it.is_archived} brief=${(it.full_brief || "").length}ch | ${String(it.title).slice(0, 50)}`);
if (!APPLY) { console.log(`\n(dry-run — --apply to tombstone + guarded-delete ${targets.length} item(s))`); process.exit(0); }

let done = 0;
for (const it of targets) {
  const lease = await acquireLease(sb, it.id, HOLDER, "A");
  if (!lease.acquired) { console.log(`  SKIP ${it.id.slice(0, 8)}: leased by ${lease.cur_holder}`); continue; }
  try {
    // snapshot pointer: keep a durable content pointer (the source snapshot survives in raw_fetches).
    let snapPtr = it.source_id || null;
    const cite = { skill: "remediation-discipline", reason: `archive-endgame tombstone-then-delete (operator ruling 2026-07-16): record identity to disposition_ledger then guarded-delete verified-correct archive ${it.legacy_id || it.id.slice(0, 8)} (${DISP})` };
    // 1. TOMBSTONE FIRST (fail-closed: guardedInsert throws -> delete never runs)
    await guardedInsert("disposition_ledger", {
      intelligence_item_id: it.id, item_key: it.legacy_id || null, canonical_instrument_key: it.canonical_instrument_key || null,
      title: it.title || null, source_url: it.source_url || null, archive_reason: it.archive_reason || null,
      disposition: DISP, merged_into_item_id: MERGED || null, snapshot_pointer: snapPtr, disposition_by: HOLDER,
    }, { cite });
    // 2. GUARDED DELETE (cascades sections/claims via FK)
    await guardedDelete("intelligence_items", [it.id], { cite });
    done++; console.log(`  tombstoned + deleted ${it.id.slice(0, 8)} (${it.legacy_id || ""})`);
  } catch (e) { console.log(`  FAILED ${it.id.slice(0, 8)}: ${e.message}`); }
  finally { await releaseLease(sb, it.id, HOLDER).catch(() => {}); }
}
console.log(`\ntombstoned + deleted ${done}/${targets.length}.`);
process.exit(0);
