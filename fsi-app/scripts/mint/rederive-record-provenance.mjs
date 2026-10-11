#!/usr/bin/env node

import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from '../lib/is-main.mjs'; // task 0.3b: the Windows-safe CLI main guard

loadLocalEnvFile();

export const CITE = Object.freeze({
  skill: "record-tier-population-plan",
  reason:
    "Re-fire the provenance derivation (set_provenance_status trigger) on record-grade items whose row " +
    "provenance_status is stale against validate_item_provenance (population-turn post-apply reconciliation, " +
    "2026-09-02: run #8 stamped quarantined before the gate row existed). The touch writes only updated_at; " +
    "the status itself is written by the trigger's derivation, never by this script.",
});

/** Pure: which candidates does the derivation say are valid now? `verdicts` maps id -> validate result. */
export function selectStale(candidates, verdicts) {
  return (candidates ?? []).filter((c) => c.provenance_status !== "verified" && verdicts.get(c.id)?.valid === true);
}

/**
 * @param {{ apply?: boolean }} opts
 * @param {{ readAll: Function, readAllByIds: Function, rpc: Function, guardedUpdateByIds: Function }} deps
 */
export async function main({ apply = false } = {}, deps) {
  const { readAll, readAllByIds, rpc, guardedUpdateByIds } = deps;
  console.log(`[rederive-provenance] mode = ${apply ? "APPLY" : "DRY-RUN"}`);
  const candidates = await readAll(
    "intelligence_items",
    "id, provenance_status, item_grade, is_archived",
    { match: (q) => q.eq("item_grade", "record").eq("is_archived", false).neq("provenance_status", "verified") },
  );
  console.log(`[rederive-provenance] record-grade rows not verified: ${candidates.length}`);
  const verdicts = new Map();
  for (const c of candidates) verdicts.set(c.id, await rpc(c.id));
  const stale = selectStale(candidates, verdicts);
  const stillInvalid = candidates.length - stale.length;
  console.log(`[rederive-provenance] derivation says verified now: ${stale.length}; still invalid (left alone): ${stillInvalid}`);
  for (const s of stale.slice(0, 20)) console.log(`   ${s.id} (${s.provenance_status})`);
  if (!apply) return { mode: "dry-run", candidates: candidates.length, stale: stale.length, stillInvalid, touched: 0 };
  if (!stale.length) return { mode: "apply", candidates: candidates.length, stale: 0, stillInvalid, touched: 0 };

  const ids = stale.map((s) => s.id);
  const res = await guardedUpdateByIds(
    "intelligence_items",
    ids,
    { updated_at: new Date().toISOString() },
    { cite: CITE, select: "id", applyMatch: (q) => q.eq("item_grade", "record").neq("provenance_status", "verified") },
  );
  // Read the status back with a fresh SELECT, never from the UPDATE's own returning rows: Postgres fills
  // RETURNING from the statement's NEW tuples BEFORE the AFTER trigger runs, so the touch's returned rows
  // still say the old status even though the derivation flipped them (population-turn run #9,
  // 2026-09-02: 10 rows healed live, "read back verified: 0", exit 1 — the data was right, the check was
  // reading the wrong moment).
  // Post-touch read-back over `ids` — runtime-scaled, no declared cap (the exact
  // Maintenance-34046850770 defect class). Chunked via readAllByIds, never a single .in(id, ids).
  const after = await readAllByIds("intelligence_items", "id, provenance_status", ids);
  const healed = after.filter((r) => r.provenance_status === "verified").length;
  console.log(`[rederive-provenance] touched ${res.updated} in ${res.chunks} chunk(s) (${res.halvings} halvings); re-read verified: ${healed}`);
  if (healed !== stale.length) {
    console.error(`[rederive-provenance] MISMATCH — ${stale.length} rows derive verified, ${healed} read back verified after the touch`);
    process.exitCode = 1;
  }
  return { mode: "apply", candidates: candidates.length, stale: stale.length, stillInvalid, touched: res.updated, healed };
}

if (isMainModule(import.meta.url)) {
  const { readAll, readAllByIds, guardedUpdateByIds } = await import("../lib/db.mjs");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[rederive-provenance] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const rpc = async (itemId) => {
    const { data, error } = await sb.rpc("validate_item_provenance", { p_item_id: itemId });
    if (error) return { valid: false, recommended_status: null, failures: [{ criterion: "rpc", reason: error.message }] };
    return Array.isArray(data) ? data[0] : data;
  };
  main({ apply: process.argv.includes("--apply") }, { readAll, readAllByIds, rpc, guardedUpdateByIds }).catch((e) => {
    console.error("[rederive-provenance] fatal:", e);
    process.exit(1);
  });
}
