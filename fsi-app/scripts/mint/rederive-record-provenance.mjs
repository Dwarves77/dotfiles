#!/usr/bin/env node
// rederive-record-provenance.mjs — heal a record-grade item whose ROW provenance_status disagrees with
// what validate_item_provenance derives for it now (Lane POP, 2026-09-02).
//
// WHY THIS EXISTS. `provenance_status` is stamped ONLY by the set_provenance_status trigger (migrations
// 115/118: an AFTER INSERT OR UPDATE trigger on intelligence_items, intelligence_item_sections and
// section_claim_provenance that re-runs validate_item_provenance and writes the result; a direct write of
// 'verified' is refused by guard_provenance_flip unless it comes from that derivation, pg_trigger_depth
// >= 2). So the status a row carries is the derivation AT THE LAST TRIGGERING WRITE. Two things can leave
// it stale: (1) a write sequence whose last triggering write happened before the row's evidence was
// complete — population-turn run #8 (2026-09-02) wrote item_gate_a_state AFTER the claims, so the last
// derivation saw no gate row and stamped `quarantined` on ten items whose validate_item_provenance()
// answers `verified` today; (2) any later change to a table the trigger does not watch (item_gate_a_state,
// intelligence_item_citations, agent_run_searches). apply-mint-batch.mjs's write order is fixed for (1);
// this script is the runtime's own reconciliation for both — it never sets provenance_status itself, it
// re-fires the derivation by touching the row through the guarded path (guardedUpdateByIds: cite,
// snapshot, statement-timeout halving — the derivation costs up to ~3.4 s per row, measured 2026-09-02).
//
// SCOPE. Record-grade items only (item_grade = 'record'), not archived, whose row status is not
// 'verified' but whose validate_item_provenance(id) IS valid right now. An item the function still
// rejects is left exactly as it is — this script heals stale stamps, it never argues with the gate. It
// runs inside population-turn.yml after apply-mint-batch.mjs (apply mode only) and is safe to run any
// time: a row with nothing to heal is never touched (idempotent, $0, no LLM).
//
// USAGE:
//   node scripts/mint/rederive-record-provenance.mjs            # dry: list what would be touched
//   node scripts/mint/rederive-record-provenance.mjs --apply    # touch through the guarded path
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

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
 * @param {{ readAll: Function, rpc: Function, guardedUpdateByIds: Function }} deps
 */
export async function main({ apply = false } = {}, deps) {
  const { readAll, rpc, guardedUpdateByIds } = deps;
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

  const res = await guardedUpdateByIds(
    "intelligence_items",
    stale.map((s) => s.id),
    { updated_at: new Date().toISOString() },
    { cite: CITE, select: "id, provenance_status", applyMatch: (q) => q.eq("item_grade", "record").neq("provenance_status", "verified") },
  );
  const healed = (res.rows ?? []).filter((r) => r.provenance_status === "verified").length;
  console.log(`[rederive-provenance] touched ${res.updated} in ${res.chunks} chunk(s) (${res.halvings} halvings); read back verified: ${healed}`);
  if (healed !== stale.length) {
    console.error(`[rederive-provenance] MISMATCH — ${stale.length} rows derive verified, ${healed} read back verified after the touch`);
    process.exitCode = 1;
  }
  return { mode: "apply", candidates: candidates.length, stale: stale.length, stillInvalid, touched: res.updated, healed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readAll, guardedUpdateByIds } = await import("../lib/db.mjs");
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
  main({ apply: process.argv.includes("--apply") }, { readAll, rpc, guardedUpdateByIds }).catch((e) => {
    console.error("[rederive-provenance] fatal:", e);
    process.exit(1);
  });
}
