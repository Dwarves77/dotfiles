/** mint-gate-calibration.mjs — hardening A1 seams 2+4 (report-only calibration).
 *  GOVERNING SKILLS: remediation-discipline (Section 4 category 24) + source-credibility-model (authority floor).
 *  READ-ONLY. Applies the SAME mint-time gate evaluator (mint-gates.mjs) the report-only pipeline wiring uses,
 *  offline against the MOST RECENT grounds, and reports the would-have-held rate overall + per gate
 *  (identity-congruence, span-numerics, authority-floor, generic-source). No spend, no writes, no grounding.
 *  The numbers are the input to the operator's live-flip decision; the 20% stop condition per gate is surfaced.
 *  Usage: node scripts/verify/mint-gate-calibration.mjs [--items=40]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { perFactGates, identityCongruenceHolds } = await jiti.import("../../src/lib/agent/mint-gates.mjs");
const { authorityFloorFor } = await jiti.import("../../src/lib/agent/source-blocks.mjs");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const N_ITEMS = (() => { const a = process.argv.find((x) => x.startsWith("--items=")); return a ? parseInt(a.slice(8), 10) : 40; })();
const STOP_RATE = 0.20;

async function main() {
  // suspended source ids (for the generic-source gate)
  const { data: susp } = await sb.from("sources").select("id").eq("status", "suspended");
  const suspendedIds = new Set((susp || []).map((s) => s.id));

  // Sample selection. Default = MOST RECENT grounds (all statuses) — the contaminated first sample (dominated
  // by the quarantined C3-floor re-grounds). --representative = VERIFIED, non-archived items only (healthy
  // grounds that passed the floor) — the number that should gate the live-flip, since the expansion produces
  // new healthy grounds, not sub-floor quarantines.
  const REPRESENTATIVE = process.argv.includes("--representative");
  let itemIds;
  if (REPRESENTATIVE) {
    const { data: v } = await sb.from("intelligence_items").select("id, updated_at")
      .eq("provenance_status", "verified").eq("is_archived", false)
      .order("updated_at", { ascending: false }).limit(N_ITEMS);
    itemIds = (v || []).map((r) => r.id);
  } else {
    const { data: rows } = await sb.from("section_claim_provenance")
      .select("intelligence_item_id, extracted_at").eq("claim_kind", "FACT")
      .order("extracted_at", { ascending: false }).limit(8000);
    const seen = new Set();
    for (const r of rows || []) if (r.intelligence_item_id) seen.add(r.intelligence_item_id);
    itemIds = [...seen].slice(0, N_ITEMS);
  }

  const gateCounts = { identityCongruence: 0, spanNumeric: 0, authorityFloor: 0, genericSource: 0 };
  let totalFacts = 0, anyHold = 0, itemsScanned = 0, itemsSkippedArchived = 0;
  for (const id of itemIds) {
    const { data: it } = await sb.from("intelligence_items").select("item_type, is_archived, provenance_status").eq("id", id).single();
    if (!it || it.is_archived) { itemsSkippedArchived += 1; continue; }
    const itemFloor = authorityFloorFor(it.item_type);
    const { data: claims } = await sb.from("section_claim_provenance")
      .select("id, claim_kind, claim_text, source_span, source_id, source_tier_at_grounding").eq("intelligence_item_id", id);
    const facts = (claims || []).filter((c) => String(c.claim_kind).toUpperCase() === "FACT");
    if (!facts.length) continue;
    itemsScanned += 1;
    const congruenceHeld = identityCongruenceHolds(facts);
    for (const f of facts) {
      totalFacts += 1;
      const g = perFactGates(f, { itemFloor, suspendedSourceIds: suspendedIds });
      const id0 = congruenceHeld.has(f.id);
      if (id0) gateCounts.identityCongruence += 1;
      if (g.spanNumeric) gateCounts.spanNumeric += 1;
      if (g.authorityFloor) gateCounts.authorityFloor += 1;
      if (g.genericSource) gateCounts.genericSource += 1;
      if (id0 || g.spanNumeric || g.authorityFloor || g.genericSource) anyHold += 1;
    }
  }

  const pct = (n) => totalFacts ? ((100 * n) / totalFacts).toFixed(1) + "%" : "n/a";
  console.log(`\n=== MINT-GATE CALIBRATION (report-only, read-only) ===`);
  console.log(`recent grounds sampled: ${itemsScanned} items (${itemsSkippedArchived} archived skipped), ${totalFacts} FACT claims`);
  console.log(`\nwould-have-held per gate (fact-weighted):`);
  const gateRows = [
    ["identity-congruence (S-CONFLATE)", gateCounts.identityCongruence],
    ["span-numerics (S-NUMERIC)", gateCounts.spanNumeric],
    ["authority-floor", gateCounts.authorityFloor],
    ["generic-source (null/suspended)", gateCounts.genericSource],
  ];
  let tripped = [];
  for (const [name, n] of gateRows) {
    const rate = totalFacts ? n / totalFacts : 0;
    const over = rate > STOP_RATE;
    if (over) tripped.push(name);
    console.log(`  ${name.padEnd(34)} ${String(n).padStart(5)} / ${totalFacts}  = ${pct(n).padStart(6)}${over ? "   <== OVER 20% STOP" : ""}`);
  }
  console.log(`\noverall would-have-held (any gate): ${anyHold} / ${totalFacts} = ${pct(anyHold)}`);
  console.log(`\nSTOP CONDITION (>20% on any gate): ${tripped.length ? "TRIPPED — " + tripped.join(", ") + " — report before wiring gates live" : "clear on all gates"}`);
  console.log(`NOTE: report-only. Flipping gates from report-only to live-hold is an OPERATOR decision on these numbers.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
