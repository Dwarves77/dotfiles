/** TIER-2 SNAPSHOT-FIRST RESTITUTION resolver (RD-4 research-or-erase; snapshot-first rebuild PR-2, item 4).
 *  Drive quarantined items toward VERIFIED via the ONE verify-item entry (RD-24) — NEVER a direct paid
 *  re-ground, NEVER a delete. Per item, verify-item reads the item's stored snapshot + its existing claims and
 *  cheap-verifies ($0, no fetch, no model). Outcomes:
 *    verified_cheap — the item's FACT spans are still present in the stored snapshot. With --apply this re-runs
 *                     the full provenance gate ($0 SQL RPC); the set_provenance_status trigger flips the item to
 *                     verified IFF it now passes (cheap-verify alone never flips — it does not re-check floors/slots).
 *    stale_flag     — the source demonstrably changed since capture (freshness probe). Reported; the CP2 queue
 *                     write + paid re-acquire are the LOCKED Phase-3 path — this resolver never fetches/flips it.
 *    needs_acquire  — no usable snapshot / cheap-verify cannot confirm. Requires a PAID re-ground, which is the
 *                     master-switched path (GROUNDING_ACQUIRE_ENABLED, default OFF). Reported here, never run.
 *
 *  This resolver moves $0: it calls verify-item with act:false (pure decision — no writes, no lock throw) and,
 *  under --apply, only the $0 validate_item_provenance RPC. The paid re-ground of needs_acquire items is a
 *  SEPARATE, operator-gated Phase-3 execution (flip the lock + a sanctioned run) — it does NOT happen here.
 *  HOLD_TYPES (research/technology/tool/innovation) stay excluded pending the Q2 calibration spec.
 *  GOVERNING: remediation-discipline (RD-4) + source-credibility-model + env-policy integrity rule.
 *  DRY-RUN default; --apply [--limit=N] [--only=].
 *
 *  REFACTOR (lane ONESHOTS, 2026-09-06, F25 expiry-52 wiring): the drive loop is now an exported, injectable
 *  `runResolver(opts, deps)` so scripts/maintenance/regen-quarantined.mjs (the maintenance.yml dispatch
 *  wrapper) and regen-quarantined.test.mjs (a fake `sb`/`readAll`/`verifyItem`, no DB) can both drive it
 *  without a second copy of the decision loop. Behavior unchanged.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll } from "./lib/db.mjs";
import { verifyItem } from "../src/lib/sources/verify-item.mjs";
import { getSnapshot } from "../src/lib/sources/snapshot-store.mjs";
import { probeFreshness } from "../src/lib/sources/freshness-probe.mjs";
import { cheapVerifyClaims } from "../src/lib/sources/cheap-verify.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const HOLD_TYPES = new Set(["research_finding", "technology", "tool", "innovation"]);

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
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
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
