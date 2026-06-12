/** TIER-2 RE-GROUND batch (F6 docstring corrected 2026-06-12): drive quarantined items toward VERIFIED by
 *  re-grounding; this script DOES NOT auto-erase. The disposition model (RD-4 research-or-erase) is
 *  value-triage -> source / fix / archive, decided per item — NOT a blind erase by this batch. Per item,
 *  replicate the wired generate-brief workflow as plain lib calls:
 *    generate (web_search widens pool; checkBriefContent gate) -> section -> ground, retrying up to
 *    --retries extra times on non-verify (grounding is stochastic). An item that STILL fails is LEFT
 *    quarantined and its residual failure reasons are reported — to be cleared by gate-calibration
 *    (inapplicable slots) or routed to a recorded disposition (re-ground / register-as-source / archive),
 *    never by deleting real content here. HOLD_TYPES (research/technology/tool/innovation) are excluded
 *    pending the research/tech calibration spec pass (Q2 gate). NON-DESTRUCTIVE: a failed regen leaves the
 *    EXISTING brief intact (generateBrief returns ok:false BEFORE any overwrite).
 *  Browserless via generateBrief (~7 fetches/item). GOVERNING: remediation-discipline (RD-4) +
 *  analysis-construction-spec + env-policy integrity rule. DRY-RUN default; --apply [--limit=N] [--only=] [--retries=]. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, readAll } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null; })();
const RETRIES = (() => { const a = process.argv.find((x) => x.startsWith("--retries=")); return a ? parseInt(a.slice(10), 10) : 1; })(); // extra attempts on non-verify (grounding is stochastic; proven on g7). 1 = up to 2 total.
const sb = readClient();
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBrief, sectionBrief, groundBrief } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");

const prov = async (id) => (await sb.from("intelligence_items").select("provenance_status").eq("id", id).single()).data?.provenance_status;
// Q2 GATE (operator 2026-06-08): NO research_finding / technology / tool / innovation re-grounding until
// the research/tech slot-calibration spec pass lands (their HARD slots contradict the forward-intelligence
// rule and would false-quarantine in-progress research). HOLD them out of this resolver.
const HOLD_TYPES = new Set(["research_finding", "technology", "tool", "innovation"]);
const allQ = await readAll("intelligence_items", "id,legacy_id,title,item_type", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
const held = allQ.filter((it) => HOLD_TYPES.has(it.item_type));
let targets = allQ.filter((it) => !HOLD_TYPES.has(it.item_type));
if (ONLY) targets = targets.filter((it) => ONLY.includes(it.legacy_id) || ONLY.some((w) => it.id.startsWith(w)));

console.log(`\n===== TIER-2 RESEARCH-OR-ERASE (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`quarantined: ${allQ.length}  | HELD (research/tech, Q2 gate): ${held.length}  | ELIGIBLE: ${targets.length}${LIMIT < Infinity ? ` (limit ${LIMIT})` : ""}  | est Browserless ~${Math.min(targets.length, LIMIT) * 7} units, Sonnet ~$${(Math.min(targets.length, LIMIT) * 0.35).toFixed(0)}`);
if (!APPLY) { console.log(`\nDRY-RUN — pass --apply [--limit=N].`); process.exit(0); }

// NON-DESTRUCTIVE: regenerate (current pipeline labels assertions + grounds URLs + fills/gap-notes
// slots). A failed regen leaves the EXISTING brief intact (generateBrief returns ok:false BEFORE any
// overwrite). NO erase here — items that still fail after regen are LEFT quarantined and their residual
// failure reasons reported, to be cleared by gate-calibration (inapplicable slots) not by deleting real
// content. One regen attempt per item (cost control; a second pass can run later on the residual).
let verified = 0, stillQ = 0, fail = 0, n = 0;
const residual = {};
// generate -> section -> ground, retrying up to RETRIES extra times on non-verify. Grounding is
// stochastic: a clean re-roll recovers items whose first roll slipped a label or cited an off-pool URL
// (PROVEN on g7, which only verified on its 2nd generate). groundBrief re-grounds cleanly while the item
// is non-verified (it skips only already-verified), so a retry never duplicates claims.
async function attempt(id) {
  for (let i = 0; i <= RETRIES; i++) {
    const g = await generateBrief(id); if (!g.ok) { if (i < RETRIES) continue; return false; }
    const s = await sectionBrief(id); if (!s.ok) { if (i < RETRIES) continue; return false; }
    await groundBrief(id);
    if ((await prov(id)) === "verified") return true;
  }
  return false;
}

for (const it of targets.slice(0, LIMIT)) {
  n++;
  const key = it.legacy_id || it.id.slice(0, 8);
  try {
    const ok = await attempt(it.id);
    if (ok) { verified++; console.log(`  ${key.padEnd(12)} VERIFIED  ${(it.title || "").slice(0, 44)}`); continue; }
    stillQ++;
    const { data } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
    const row = Array.isArray(data) ? data[0] : data;
    for (const f of (row?.failures || [])) residual[f.reason] = (residual[f.reason] || 0) + 1;
    console.log(`  ${key.padEnd(12)} still-quarantined  ${(it.title || "").slice(0, 40)}`);
  } catch (e) { fail++; console.log(`  ${key.padEnd(12)} ERROR: ${e.message.slice(0, 60)}`); }
}
console.log(`\nregenerated ${n}: VERIFIED ${verified}  still-quarantined ${stillQ}  errors ${fail}`);
console.log(`residual failure reasons (the calibrate-or-erase set):`, JSON.stringify(residual));
process.exit(0);
