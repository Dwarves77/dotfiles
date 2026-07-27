#!/usr/bin/env node
// unit1-reconcile-flags.mjs — ADR-016 UNIT 1 flag reconciliation. Reads the drain artifact (27 held rows) +
// the UNIT-1 recapture execute artifact (which rows replaced), then:
//   - resolves the drain hold-flag (created_by='refetch-capped-worklist') for each row that REPLACED clean;
//   - updates the hold-flag description for each row STILL HELD, recording transports tried + the finding;
//   - resolves a truncation-guard flag only for an item whose ALL held rows have now replaced clean.
// Guarded writes (db.mjs). Run: --dry-run (default) | --execute
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readClient, guardedUpdate } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const sb = readClient();
const CITE = { skill: "remediation-discipline" };

const drain = JSON.parse(readFileSync(resolve(ROOT, "scripts/tmp/drain-artifact.json"), "utf8"));
const held = (drain.out || []).filter((r) => r.outcome === "HOLD-fact-drift" || r.outcome === "HOLD-refetch-failed");
const exec = JSON.parse(readFileSync(resolve(ROOT, "scripts/tmp/unit1-recapture-execute.json"), "utf8"));
const byRowId = new Map(exec.results.map((r) => [r.id, r]));

// per-item held-row totals and how many replaced (drain-held rows only)
const itemTotals = new Map();
for (const row of held) {
  const e = byRowId.get(row.id);
  const t = itemTotals.get(row.item_id) || { total: 0, replaced: 0 };
  t.total++; if (e?.accepted) t.replaced++;
  itemTotals.set(row.item_id, t);
}

async function openFlagIdForRow(item_id, url) {
  const { data } = await sb.from("integrity_flags").select("id, description")
    .eq("subject_ref", item_id).eq("created_by", "refetch-capped-worklist").eq("status", "open");
  const hit = (data || []).find((f) => (f.description || "").includes(url));
  return hit?.id || null;
}

let resolvedHold = 0, updatedHeld = 0, resolvedTG = 0, missingFlag = 0;
console.log(`\n===== UNIT 1 flag reconcile (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) =====\n`);
for (const row of held) {
  const e = byRowId.get(row.id);
  const flagId = await openFlagIdForRow(row.item_id, row.result_url);
  if (!flagId) { missingFlag++; console.log(`  ! no open hold-flag found for ${row.item_id.slice(0, 8)} ${row.result_url.slice(0, 50)}`); continue; }
  if (e?.accepted) {
    if (EXECUTE) await guardedUpdate("integrity_flags", (qb) => qb.eq("id", flagId), { status: "resolved" },
      { cite: { ...CITE, reason: `ADR-016 UNIT1: row recaptured full (${row.old_length}->${e.new_length}ch) via ${e.winning_endpoint}; all FACT spans preserved` } });
    resolvedHold++;
    console.log(`  RESOLVE  ${row.item_id.slice(0, 8)} ${row.result_url.slice(0, 55)}`);
  } else {
    // finding note: bucket-A = full content recovered, held on citation/masthead span(s); bucket-B = Chrome pending
    const htmlTry = (e?.tried || []).find((t) => t.cand && t.cand.includes("/HTML/") && (t.len || 0) > 50000);
    const note = e?.bucket === "A" && htmlTry
      ? `UNIT1: full substantive text recovered via CELEX /HTML/ endpoint (${htmlTry.len}ch); held under strict factSpansStillMatch on ${htmlTry.guard} — the unmatched span(s) are citation/masthead page-chrome absent from the raw render, NOT content drift. Pending operator ruling (replace-anyway vs Chrome-render viewer).`
      : `UNIT1: ladder retry returned ${(e?.tried || []).map((t) => `${t.transport || t.note || t.err || "?"}${t.len != null ? `/${t.len}ch` : ""}`).join("; ") || "nothing"}; Chrome render path pending.`;
    if (EXECUTE) await guardedUpdate("integrity_flags", (qb) => qb.eq("id", flagId), { description: note.slice(0, 480) },
      { cite: { ...CITE, reason: `ADR-016 UNIT1: record recapture transports tried + finding for still-held row ${row.result_url}` } });
    updatedHeld++;
    console.log(`  HELD+note ${row.item_id.slice(0, 8)} ${row.result_url.slice(0, 55)}`);
  }
}

// truncation-guard flags: resolve only for items whose ALL held rows replaced clean
for (const [item_id, t] of itemTotals) {
  if (t.total > 0 && t.replaced === t.total) {
    const { data } = await sb.from("integrity_flags").select("id")
      .eq("subject_ref", item_id).eq("created_by", "truncation-guard").eq("status", "open");
    for (const f of data || []) {
      if (EXECUTE) await guardedUpdate("integrity_flags", (qb) => qb.eq("id", f.id), { status: "resolved" },
        { cite: { ...CITE, reason: `ADR-016 UNIT1: all ${t.total} held row(s) for item ${item_id} recaptured full + FACT-preserving — truncation-guard gap closed` } });
      resolvedTG++;
      console.log(`  RESOLVE-TG ${item_id.slice(0, 8)} (all ${t.total} held rows clean)`);
    }
  }
}

console.log(`\n  hold-flags resolved: ${resolvedHold} | held-flags description-updated: ${updatedHeld} | truncation-guard resolved: ${resolvedTG} | missing flags: ${missingFlag}`);
process.exit(0);
