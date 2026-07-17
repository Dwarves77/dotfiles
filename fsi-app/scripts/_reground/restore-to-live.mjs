#!/usr/bin/env node
// restore-to-live.mjs — REVIEW-LANE "RESTORE" verdict executor (operator ruling 2026-07-17). A content-bearing
// intelligence item wrongly archived (dominantly reclassified_to_source: a real regulation/framework/tool/market
// item mislabeled as a source) is RESTORED to live: guarded un-archive (is_archived=false, archive_reason=null,
// reversible via snapshot) under its mutation lease, then — if it does not recompute to verified — enqueued to
// drain_worklist (Lane A) so the normal drain queue meets it as an ordinary quarantined item. Wrongly-archived
// intelligence is paid-for inventory; this is recovery, not creation.
//
// SAFETY: refuses to restore a provably-empty shell (brief_len=0 AND zero grounded claims) — an empty shell is a
// CONFIRM-archive, never a RESTORE. The restore decision is the operator's/reviewer's per-item verdict; this tool
// EXECUTES a RESTORE verdict, it does not infer it. Dry-run default.
// Usage: node scripts/_reground/restore-to-live.mjs <itemId|legacy_id>... [--holder=session-A] [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const HOLDER = (() => { const a = process.argv.find((x) => x.startsWith("--holder=")); return a ? a.slice(9) : "session-A"; })();
const keys = process.argv.slice(2).filter((x) => !x.startsWith("--"));
if (!keys.length) { console.error("usage: restore-to-live.mjs <itemId|legacy_id>... [--holder=session-A] [--apply]"); process.exit(1); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, guardedUpdate, guardedInsert, guardedDelete } = await jiti.import("../lib/db.mjs");
const { acquireLease, releaseLease } = await jiti.import("../lib/mutation-lease.mjs");
const sb = readClient();

const all = await readAll("intelligence_items", "id,legacy_id,title,is_archived,archive_reason,full_brief,provenance_status", {});
const prov = await readAll("section_claim_provenance", "intelligence_item_id", {});
const withClaims = new Set(prov.map((p) => p.intelligence_item_id));
const targets = keys.map((k) => all.find((x) => x.id === k || x.id.startsWith(k) || (x.legacy_id || "") === k)).filter(Boolean);

console.log(`\n===== RESTORE-TO-LIVE (${APPLY ? "APPLY" : "DRY-RUN"}) holder=${HOLDER} =====`);
for (const it of targets) {
  const brief = (it.full_brief || "").length, claims = withClaims.has(it.id);
  const empty = brief === 0 && !claims;
  console.log(`  ${it.id.slice(0, 8)} ${(it.legacy_id || "").padEnd(6)} arch=${it.is_archived} brief=${brief}ch claims=${claims ? "Y" : "n"} reason=${it.archive_reason || "-"} ${empty ? "<< REFUSE (empty shell — CONFIRM-archive, not RESTORE)" : ""} | ${String(it.title).slice(0, 44)}`);
}
if (!APPLY) { console.log(`\n(dry-run — --apply to restore ${targets.filter((it) => (it.full_brief || "").length > 0 || withClaims.has(it.id)).length} content-bearing item(s))`); process.exit(0); }

let done = 0;
for (const it of targets) {
  if ((it.full_brief || "").length === 0 && !withClaims.has(it.id)) { console.log(`  REFUSE ${it.id.slice(0, 8)}: empty shell (brief=0 AND 0 claims) — not a RESTORE candidate`); continue; }
  if (!it.is_archived) { console.log(`  SKIP ${it.id.slice(0, 8)}: already live`); continue; }
  const lease = await acquireLease(sb, it.id, HOLDER, "A");
  if (!lease.acquired) { console.log(`  SKIP ${it.id.slice(0, 8)}: leased by ${lease.cur_holder}`); continue; }
  try {
    const cite = { skill: "remediation-discipline", reason: `review-lane RESTORE (operator ruling 2026-07-17): un-archive wrongly-archived content-bearing item ${it.legacy_id || it.id.slice(0, 8)} (was ${it.archive_reason}); paid-for inventory recovered to live` };
    // 1. Guarded un-archive (reversible: guardedUpdate snapshots the prior row). Trigger recomputes provenance_status.
    await guardedUpdate("intelligence_items", (q) => q.eq("id", it.id), { is_archived: false, archive_reason: null }, { cite });
    // 2. Read back the recomputed status.
    const { data: after } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
    const status = after?.provenance_status || "unknown";
    // 3. If not verified, enqueue to drain_worklist (Lane A) so the normal drain queue meets it.
    if (status !== "verified") {
      await guardedDelete("drain_worklist", [it.id], { cite }).catch(() => {});
      await guardedInsert("drain_worklist", {
        intelligence_item_id: it.id, lane: "A", primary_id_confirmed: false, target_match_verdict: null,
        defect_summary: `restored from wrongful archive (${it.archive_reason || "reclassified_to_source"})`,
        notes: "review-lane RESTORE 2026-07-17: content-bearing item wrongly archived as a source; recovered to live for normal drain", assigned_by: "restore-to-live.mjs",
      }, { cite });
    }
    done++; console.log(`  RESTORED ${it.id.slice(0, 8)} ${(it.legacy_id || "")} -> ${status}${status !== "verified" ? " (enqueued drain_worklist Lane A)" : " (live verified directly)"}`);
  } catch (e) { console.log(`  FAILED ${it.id.slice(0, 8)}: ${e.message}`); }
  finally { await releaseLease(sb, it.id, HOLDER).catch(() => {}); }
}
console.log(`\nrestored ${done}/${targets.length}.`);
process.exit(0);
