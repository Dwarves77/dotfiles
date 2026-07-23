#!/usr/bin/env node
// unit1-final-reconcile.mjs — ADR-016 UNIT 1 final flag reconciliation, DB-STATE-DRIVEN (not per-row description
// matching — an earlier reconcile overwrote the per-row URL in the hold-flag descriptions, so flags can no longer
// be mapped to a specific row for multi-row items; reconcile at the ITEM level by count instead). For each drain-
// held row, the CURRENT capture length in agent_run_searches decides replaced (len > old_length+100) vs still-held.
// Per item: resolve min(replaced_count, open refetch-capped-worklist flags); resolve a truncation-guard flag only
// when the item is FULLY replaced. Guarded writes. Run: --dry-run (default) | --execute
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { readFileSync } from "node:fs";
import { readClient, guardedUpdate } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const sb = readClient();
const drain = JSON.parse(readFileSync(process.argv.find(a => a.endsWith(".json")) || resolve(ROOT, "scripts/tmp/drain-artifact.json"), "utf8"));
const held = (drain.out || []).filter((r) => r.outcome === "HOLD-fact-drift" || r.outcome === "HOLD-refetch-failed");

// per-item current state from the DB
const perItem = {};
for (const row of held) {
  const { data } = await sb.from("agent_run_searches").select("result_content_excerpt").eq("id", row.id).maybeSingle();
  const replaced = ((data?.result_content_excerpt || "").length) > row.old_length + 100;
  const t = perItem[row.item_id] || { held: 0, replaced: 0 };
  t.held++; if (replaced) t.replaced++; perItem[row.item_id] = t;
}

let holdResolved = 0, tgResolved = 0;
console.log(`\n===== UNIT 1 final reconcile (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) — ${Object.keys(perItem).length} items =====\n`);
for (const [item_id, st] of Object.entries(perItem)) {
  // resolve `replaced` of the item's open refetch-capped-worklist flags (item-level; descriptions genericized)
  const { data: hf } = await sb.from("integrity_flags").select("id").eq("subject_ref", item_id).eq("created_by", "refetch-capped-worklist").eq("status", "open").order("id");
  const toResolve = (hf || []).slice(0, st.replaced);
  for (const f of toResolve) {
    if (EXECUTE) await guardedUpdate("integrity_flags", (qb) => qb.eq("id", f.id), { status: "resolved" }, { cite: { skill: "remediation-discipline", reason: `ADR-016 UNIT1: item ${item_id} — ${st.replaced}/${st.held} held row(s) recaptured full; resolving one hold flag (item-level count reconcile)` } });
    holdResolved++;
  }
  // truncation-guard: resolve only when the item is FULLY replaced
  if (st.replaced === st.held) {
    const { data: tg } = await sb.from("integrity_flags").select("id").eq("subject_ref", item_id).eq("created_by", "truncation-guard").eq("status", "open");
    for (const f of tg || []) {
      if (EXECUTE) await guardedUpdate("integrity_flags", (qb) => qb.eq("id", f.id), { status: "resolved" }, { cite: { skill: "remediation-discipline", reason: `ADR-016 UNIT1: item ${item_id} fully recaptured (${st.held} row(s)) — truncation-guard gap closed` } });
      tgResolved++;
    }
  }
  console.log(`  ${item_id.slice(0, 8)}: ${st.replaced}/${st.held} replaced${st.replaced === st.held ? " (FULL)" : ""} | hold-flags open=${(hf || []).length} resolve=${toResolve.length}`);
}
console.log(`\n  hold-flags resolved: ${holdResolved} | truncation-guard resolved: ${tgResolved}`);
process.exit(0);
