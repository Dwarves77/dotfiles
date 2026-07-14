/** SEGMENT 0 — Haiku/Sonnet grounding A/B (operator MODEL-TIER amendment, 2026-07-14; rides the priced run).
 *  Grounds ONE representative queue item on Haiku, then the SAME item on Sonnet, from a FIXED brief+sections
 *  (generate+section run ONCE so only the GROUND model varies), and compares the ledgers: FACT count,
 *  floor-qualifying-FACT count, and span accuracy (all kept FACTs already passed the verbatim-substring filter,
 *  so fact count IS the span-accurate count). The numbers pick the DEFAULT grounding model before coverage-floor
 *  multiplies the per-item price by hundreds. The dominance guard protects state; each model grounds from a
 *  CLEAN ledger (reset between) so neither confounds the other, and the item is left in the WINNER's ledger.
 *
 *  Paid (rides the $20 bound): ~1 synth + 2 grounds. Armed run-scoped (withArmedLock), F16-signed caller.
 *  Usage: node scripts/segment0-model-ab.mjs [--apply] [--item=<uuid>]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
import { withArmedLock } from "./lib/funded-pass-core.mjs";
import { guardedDelete, guardedInsertMany } from "./lib/db.mjs";

// Guarded ledger ops (rule 015): the A/B resets the claim ledger between models so each grounds clean; the
// resets are transient (the item is restored to the winner), routed through the guarded path so every write is
// snapshotted + skill-cited. GOVERNING: remediation-discipline + environmental-policy-and-innovation.
const CITE = { skill: "remediation-discipline", reason: "segment-0 grounding A/B ledger reset (transient; each model grounds clean, item restored to the winner)" };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const ITEM = (process.argv.find((a) => a.startsWith("--item=")) || "").slice(7) || "bd7c3f5a-a877-4800-b973-e208ddfd82df"; // EPA Fast Facts (English, 362KB covers pool)
const CALLER = "unit3-remediation";
const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";
// reg-family floor <=2, research <=4, tech <=5, else null (exempt). EPA guidance -> reg-family.
const floorFor = (t) => (["regulation","directive","standard","guidance","framework"].includes(t) ? 2 : t === "research_finding" ? 4 : ["technology","innovation","tool"].includes(t) ? 5 : null);

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function ledgerMetrics(itemId, floor) {
  const { data } = await sb.from("section_claim_provenance").select("claim_kind, source_tier_at_grounding").eq("intelligence_item_id", itemId);
  const rows = data || [];
  const facts = rows.filter((r) => r.claim_kind === "FACT");
  const floorQ = floor == null ? 0 : facts.filter((r) => typeof r.source_tier_at_grounding === "number" && r.source_tier_at_grounding <= floor).length;
  return { total: rows.length, facts: facts.length, floorQ };
}
async function readLedgerRows(itemId) {
  const { data } = await sb.from("section_claim_provenance")
    .select("section_row_id, intelligence_item_id, claim_text, claim_kind, source_span, source_id, search_result_id, source_tier_at_grounding")
    .eq("intelligence_item_id", itemId);
  return data || [];
}
async function resetLedger(itemId) {
  const { data } = await sb.from("section_claim_provenance").select("id").eq("intelligence_item_id", itemId);
  const ids = (data || []).map((r) => r.id);
  if (ids.length) await guardedDelete("section_claim_provenance", ids, { cite: CITE });
}
async function costSince(itemId, sinceIso) {
  const { data } = await sb.from("agent_runs").select("cost_usd_estimated").eq("intelligence_item_id", itemId).gte("started_at", sinceIso);
  return (data || []).reduce((a, r) => a + Number(r.cost_usd_estimated || 0), 0);
}

async function main() {
  const t0 = new Date().toISOString();
  const { data: it } = await sb.from("intelligence_items").select("id, item_type, title, provenance_status").eq("id", ITEM).single();
  if (!it) { console.error(`item ${ITEM} not found`); process.exit(1); }
  const floor = floorFor(it.item_type);
  console.log(`\n=== SEGMENT 0 — grounding model A/B (${APPLY ? "APPLY — armed, spend" : "DRY-RUN"}) ===`);
  console.log(`item: ${(it.title||"").slice(0,50)} (${ITEM.slice(0,8)}) type=${it.item_type} floor=${floor} prov=${it.provenance_status}`);
  if (!APPLY) { console.log("dry-run: would generate+section once, then ground on Haiku and Sonnet, compare, leave winner. Re-run --apply."); return; }

  const result = await withArmedLock(process.env, async () => {
    // 1. fixed brief + sections (synth once; only the GROUND model varies below).
    let gen = await P.generateBriefFromStored(ITEM);
    if (!gen.ok && /no usable stored pool/i.test(gen.detail || "")) { console.error(`no stored pool for A/B item — pick another --item. (${gen.detail})`); process.exit(2); }
    if (!gen.ok) { console.error(`generate failed: ${gen.detail}`); process.exit(2); }
    const sec = await P.sectionBrief(ITEM);
    if (!sec.ok) { console.error(`section failed: ${sec.detail}`); process.exit(2); }

    const runs = {};
    // 2. Haiku ground (clean slate).
    await resetLedger(ITEM);
    const hStart = new Date().toISOString();
    const gH = await P.groundBrief(ITEM, CALLER, { model: HAIKU });
    const mH = await ledgerMetrics(ITEM, floor);
    const haikuRows = await readLedgerRows(ITEM);
    runs.haiku = { ok: gH.ok, detail: (gH.detail||"").slice(0,140), ...mH, cost: await costSince(ITEM, hStart) };

    // 3. Sonnet ground (clean slate again).
    await resetLedger(ITEM);
    const sStart = new Date().toISOString();
    const gS = await P.groundBrief(ITEM, CALLER, { model: SONNET });
    const mS = await ledgerMetrics(ITEM, floor);
    runs.sonnet = { ok: gS.ok, detail: (gS.detail||"").slice(0,140), ...mS, cost: await costSince(ITEM, sStart) };

    // 4. verdict: prefer higher floor-qualifying, then facts; tie -> Sonnet (the conservative default). Leave winner.
    const sonnetWins = (runs.sonnet.floorQ > runs.haiku.floorQ) || (runs.sonnet.floorQ === runs.haiku.floorQ && runs.sonnet.facts >= runs.haiku.facts);
    if (!sonnetWins) {
      // restore Haiku's (better) ledger — Sonnet's is currently in the DB (guarded reset + insert).
      await resetLedger(ITEM);
      if (haikuRows.length) await guardedInsertMany("section_claim_provenance", haikuRows.map((c) => ({ ...c, intelligence_item_id: ITEM })), { cite: CITE });
    }
    return { runs, winner: sonnetWins ? "sonnet" : "haiku" };
  });

  const totalCost = await costSince(ITEM, t0);
  console.log(`\n  HAIKU : facts=${result.runs.haiku.facts} floorQ=${result.runs.haiku.floorQ} total=${result.runs.haiku.total} ok=${result.runs.haiku.ok} $${result.runs.haiku.cost.toFixed(4)}  [${result.runs.haiku.detail}]`);
  console.log(`  SONNET: facts=${result.runs.sonnet.facts} floorQ=${result.runs.sonnet.floorQ} total=${result.runs.sonnet.total} ok=${result.runs.sonnet.ok} $${result.runs.sonnet.cost.toFixed(4)}  [${result.runs.sonnet.detail}]`);
  console.log(`\n  VERDICT: default grounding model -> ${result.winner.toUpperCase()} (floor-qualifying then fact count; tie -> Sonnet). Item left in the ${result.winner} ledger.`);
  console.log(`  A/B total actuals: $${totalCost.toFixed(4)}`);
  console.log(`\n  Interpretation: if Haiku matches Sonnet's floor-qualifying + fact count, default GROUND_MODEL to Haiku before coverage-floor scales the price; if Sonnet leads materially, keep Sonnet for full grounding.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
