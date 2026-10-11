import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll } from "./lib/db.mjs";
import { verifyItem } from "../src/lib/sources/verify-item.mjs";
import { getSnapshot } from "../src/lib/sources/snapshot-store.mjs";
import { probeFreshness } from "../src/lib/sources/freshness-probe.mjs";
import { cheapVerifyClaims } from "../src/lib/sources/cheap-verify.mjs";
import { loadLocalEnvFile } from "./lib/env-file.mjs";


// Exported (lane QUARANTINE-DISPOSITION, 2026-09-28) so scripts/plan-quarantine-disposition.mjs reuses
// the SAME held-type set rather than a second hand-copied list (F45 duplicate-code).
export const HOLD_TYPES = new Set(["research_finding", "technology", "tool", "innovation"]);

/**
 * Drive the quarantined -> verified_cheap resolution loop. Pure over injected deps (no direct DB/env access).
 * @param {{ apply?: boolean, limit?: number, only?: string[]|null }} opts
 * @param {{ sb: object, readAll: Function, verifyItem: Function, getSnapshot: Function, probeFreshness: Function,
 *   cheapVerifyClaims: Function, log?: (s: string) => void }} deps
 */
export async function runResolver({ apply = false, limit = Infinity, only = null } = {}, deps) {
  const { sb, readAll: readAllFn, verifyItem: verifyItemFn, log = () => {} } = deps;
  const verifyDeps = {
    getSnapshot: deps.getSnapshot,
    probeFreshness: deps.probeFreshness,
    cheapVerifyClaims: deps.cheapVerifyClaims,
    loadItem: async (client, id) => (await client.from("intelligence_items").select("source_id, source_url").eq("id", id).single()).data ?? null,
    loadClaims: async (client, id) => (await client.from("section_claim_provenance").select("claim_text, claim_kind, source_span").eq("intelligence_item_id", id)).data ?? [],
    env: process.env,
    act: false,
  };
  const prov = async (id) => (await sb.from("intelligence_items").select("provenance_status").eq("id", id).single()).data?.provenance_status;

  const allQ = await readAllFn("intelligence_items", "id,legacy_id,title,item_type", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
  const held = allQ.filter((it) => HOLD_TYPES.has(it.item_type));
  let targets = allQ.filter((it) => !HOLD_TYPES.has(it.item_type));
  if (only) targets = targets.filter((it) => only.includes(it.legacy_id) || only.some((w) => it.id.startsWith(w)));

  log(`\n===== TIER-2 SNAPSHOT-FIRST RESTITUTION (${apply ? "APPLY — $0 cheap-verify" : "DRY-RUN"}) =====`);
  log(`quarantined: ${allQ.length}  | HELD (research/tech, Q2 gate): ${held.length}  | ELIGIBLE: ${targets.length}${limit < Infinity ? ` (limit ${limit})` : ""}  | est spend $0 (cheap-verify only; paid re-ground is LOCKED)`);

  const results = { flipped: 0, cheapStill: 0, stale: 0, needsAcq: 0, fail: 0, n: 0, decisions: [] };
  for (const it of targets.slice(0, limit)) {
    results.n++;
    const key = it.legacy_id || it.id.slice(0, 8);
    try {
      const d = await verifyItemFn(sb, it.id, verifyDeps);
      if (d.outcome === "verified_cheap") {
        if (apply) await sb.rpc("validate_item_provenance", { p_item_id: it.id });
        const nowVerified = apply && (await prov(it.id)) === "verified";
        if (nowVerified) { results.flipped++; results.decisions.push({ key, outcome: "verified" }); log(`  ${key.padEnd(12)} VERIFIED (cheap, $0)  ${(it.title || "").slice(0, 40)}`); }
        else { results.cheapStill++; results.decisions.push({ key, outcome: "cheap-ok-still-quarantined" }); log(`  ${key.padEnd(12)} cheap-ok-still-quarantined  ${(it.title || "").slice(0, 34)}`); }
      } else if (d.outcome === "stale_flag") {
        results.stale++; results.decisions.push({ key, outcome: "stale-snapshot" }); log(`  ${key.padEnd(12)} stale-snapshot (Phase-3 re-acquire, locked)  ${(it.title || "").slice(0, 30)}`);
      } else {
        results.needsAcq++; results.decisions.push({ key, outcome: "needs-acquire" }); log(`  ${key.padEnd(12)} needs-acquire (paid re-ground, LOCKED)  ${(it.title || "").slice(0, 30)}`);
      }
    } catch (e) { results.fail++; results.decisions.push({ key, outcome: "error", error: e.message }); log(`  ${key.padEnd(12)} ERROR: ${e.message.slice(0, 60)}`); }
  }
  log(`\ndecided ${results.n}: VERIFIED(cheap,$0) ${results.flipped}  cheap-ok-still-q ${results.cheapStill}  stale-snapshot ${results.stale}  needs-acquire(locked) ${results.needsAcq}  errors ${results.fail}`);
  return { quarantined: allQ.length, held: held.length, eligible: targets.length, ...results };
}

// ── CLI (unchanged surface: DRY-RUN default; --apply [--limit=N] [--only=]) ──
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  loadLocalEnvFile();
  const apply = process.argv.includes("--apply");
  const limit = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
  const only = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null; })();
  const sb = readClient();
  if (!apply) console.log(`\nDRY-RUN — decisions only, no writes. Pass --apply to $0-re-validate the verified_cheap items (Phase-3 go).`);
  const r = await runResolver({ apply, limit, only }, { sb, readAll, verifyItem, getSnapshot, probeFreshness, cheapVerifyClaims, log: console.log });
  console.log(`paid re-ground of the needs-acquire set is the LOCKED, operator-gated Phase-3 path (GROUNDING_ACQUIRE_ENABLED).`);
  void r;
  process.exit(0);
}
