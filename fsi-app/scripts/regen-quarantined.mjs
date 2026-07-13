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
 *  DRY-RUN default; --apply [--limit=N] [--only=]. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll } from "./lib/db.mjs";
import { verifyItem } from "../src/lib/sources/verify-item.mjs";
import { getSnapshot } from "../src/lib/sources/snapshot-store.mjs";
import { probeFreshness } from "../src/lib/sources/freshness-probe.mjs";
import { cheapVerifyClaims } from "../src/lib/sources/cheap-verify.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null; })();
const sb = readClient();

// Snapshot-first decision deps for verify-item. act:false ALWAYS — this resolver only DECIDES ($0). readClient
// serves the reads (intelligence_items / section_claim_provenance) and passes .storage/.rpc through with service
// role for the snapshot body download + the $0 re-validate; verify-item performs no .insert under act:false.
const verifyDeps = {
  getSnapshot,
  probeFreshness,
  cheapVerifyClaims,
  loadItem: async (client, id) => (await client.from("intelligence_items").select("source_id, source_url").eq("id", id).single()).data ?? null,
  loadClaims: async (client, id) => (await client.from("section_claim_provenance").select("claim_text, claim_kind, source_span").eq("intelligence_item_id", id)).data ?? [],
  env: process.env,
  act: false,
};

const prov = async (id) => (await sb.from("intelligence_items").select("provenance_status").eq("id", id).single()).data?.provenance_status;
// Q2 GATE (operator 2026-06-08): NO research_finding / technology / tool / innovation re-grounding until
// the research/tech slot-calibration spec pass lands (their HARD slots contradict the forward-intelligence
// rule and would false-quarantine in-progress research). HOLD them out of this resolver.
const HOLD_TYPES = new Set(["research_finding", "technology", "tool", "innovation"]);
const allQ = await readAll("intelligence_items", "id,legacy_id,title,item_type", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
const held = allQ.filter((it) => HOLD_TYPES.has(it.item_type));
let targets = allQ.filter((it) => !HOLD_TYPES.has(it.item_type));
if (ONLY) targets = targets.filter((it) => ONLY.includes(it.legacy_id) || ONLY.some((w) => it.id.startsWith(w)));

console.log(`\n===== TIER-2 SNAPSHOT-FIRST RESTITUTION (${APPLY ? "APPLY — $0 cheap-verify" : "DRY-RUN"}) =====`);
console.log(`quarantined: ${allQ.length}  | HELD (research/tech, Q2 gate): ${held.length}  | ELIGIBLE: ${targets.length}${LIMIT < Infinity ? ` (limit ${LIMIT})` : ""}  | est spend $0 (cheap-verify only; paid re-ground is LOCKED)`);
if (!APPLY) console.log(`\nDRY-RUN — decisions only, no writes. Pass --apply to $0-re-validate the verified_cheap items (Phase-3 go).`);

// SNAPSHOT-FIRST per item ($0): verify-item decides. verified_cheap -> (--apply) $0 re-validate; the trigger
// flips the item to verified iff it now passes the full gate. stale_flag / needs_acquire are REPORTED — their
// paid resolution is the locked, separately-gated Phase-3 path. Nothing here fetches, models, or deletes.
let flipped = 0, cheapStill = 0, stale = 0, needsAcq = 0, fail = 0, n = 0;
for (const it of targets.slice(0, LIMIT)) {
  n++;
  const key = it.legacy_id || it.id.slice(0, 8);
  try {
    const d = await verifyItem(sb, it.id, verifyDeps);
    if (d.outcome === "verified_cheap") {
      if (APPLY) await sb.rpc("validate_item_provenance", { p_item_id: it.id }); // $0 re-validate; trigger flips iff it now passes
      const nowVerified = APPLY && (await prov(it.id)) === "verified";
      if (nowVerified) { flipped++; console.log(`  ${key.padEnd(12)} VERIFIED (cheap, $0)  ${(it.title || "").slice(0, 40)}`); }
      else { cheapStill++; console.log(`  ${key.padEnd(12)} cheap-ok-still-quarantined  ${(it.title || "").slice(0, 34)}`); }
    } else if (d.outcome === "stale_flag") {
      stale++; console.log(`  ${key.padEnd(12)} stale-snapshot (Phase-3 re-acquire, locked)  ${(it.title || "").slice(0, 30)}`);
    } else {
      needsAcq++; console.log(`  ${key.padEnd(12)} needs-acquire (paid re-ground, LOCKED)  ${(it.title || "").slice(0, 30)}`);
    }
  } catch (e) { fail++; console.log(`  ${key.padEnd(12)} ERROR: ${e.message.slice(0, 60)}`); }
}
console.log(`\ndecided ${n}: VERIFIED(cheap,$0) ${flipped}  cheap-ok-still-q ${cheapStill}  stale-snapshot ${stale}  needs-acquire(locked) ${needsAcq}  errors ${fail}`);
console.log(`paid re-ground of the needs-acquire set is the LOCKED, operator-gated Phase-3 path (GROUNDING_ACQUIRE_ENABLED).`);
process.exit(0);
