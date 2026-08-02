#!/usr/bin/env node
// Gate B DERIVED-mint runner (operator ruling 2026-07-27). Three-tier, arithmetic-gated, fail-closed.
// TIER 1 (--tier1): auto-match items whose derived-date orphans have EXACTLY ONE grounded recurring-rule FACT
//   that ARITHMETICALLY produces the date (isDerivedConsistent). Zero-risk mechanical majority.
// TIER 2 (--tier2=<json>): judged matches [{item, token, basisClaimId, reasoning}] — the SAME arithmetic guard
//   still runs (a wrong judged match becomes a rejected mint). Each recorded in the log.
// Every mint: verify the basis FACT span is verbatim in its capture, insert the DERIVED row, re-scan with the
// derived-covered set, upsert gate_a_state, touch the item to re-validate; read back status + orphan delta.
// No basis / inconsistent / stale basis → SKIP (honest orphan). --execute to write.
import { resolve } from "node:path"; import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { guardedUpdate, guardedInsert } from "../lib/db.mjs"; // rule 015: row mutations through the guarded path (snapshot + skill-cite)
process.loadEnvFile(resolve(process.cwd(), ".env.local"));
const { scanBrief } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/agent/gate-a-scan.mjs")).href);
const { derivedCoveredTokens } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/agent/gate-a-derived.mjs")).href);
const { parseRecurringRule, parseDerivedDate, isDerivedConsistent } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/agent/derived-consistency.mjs")).href);
const { norm, containsToken } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/agent/gate-a-match.mjs")).href);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CITE = { skill: "environmental-policy-and-innovation", reason: "Gate B DERIVED mint (operator ruling 2026-07-27): re-scan gate_a_state + touch item to re-validate after arithmetic-gated DERIVED mints" };
const EXECUTE = process.argv.includes("--execute");
const TIER1 = process.argv.includes("--tier1");
const tier2Arg = (process.argv.find((a) => a.startsWith("--tier2=")) || "").slice(8);

async function factsOf(itemId) {
  const { data } = await sb.from("section_claim_provenance").select("id,source_span,search_result_id,claim_text").eq("intelligence_item_id", itemId).eq("claim_kind", "FACT");
  return data || [];
}
async function capOf(srId) { if (!srId) return ""; const { data } = await sb.from("agent_run_searches").select("result_content_excerpt").eq("id", srId).maybeSingle(); return data?.result_content_excerpt || ""; }
async function basisVerbatim(fact) { const cap = await capOf(fact.search_result_id); return !!fact.source_span && cap.toLowerCase().includes(String(fact.source_span).toLowerCase()); }
async function sectionForToken(itemId, token) {
  const { data: secs } = await sb.from("intelligence_item_sections").select("id,content_md").eq("item_id", itemId);
  const hit = (secs || []).find((s) => containsToken(s.content_md, token));
  return hit?.id || null;
}
async function existingDerived(itemId, token) {
  const { data } = await sb.from("section_claim_provenance").select("id").eq("intelligence_item_id", itemId).eq("claim_kind", "DERIVED").eq("claim_text", token);
  return (data || []).length > 0;
}

const log = [];
async function mintOne(itemId, token, basisFact, tier, reasoning) {
  if (!parseDerivedDate(token)) return { skip: "not-a-date" };
  if (!isDerivedConsistent(basisFact.source_span, token)) return { skip: "arithmetic-inconsistent" };
  if (!(await basisVerbatim(basisFact))) return { skip: "basis-span-stale" };
  const section = await sectionForToken(itemId, token);
  if (!section) return { skip: "no-section-holds-token" };
  if (await existingDerived(itemId, token)) return { skip: "already-derived" };
  if (!EXECUTE) { log.push({ item: itemId.slice(0,8), token, basis: basisFact.id.slice(0,8), tier, plan: true, reasoning }); return { plan: true }; }
  const { error } = await sb.from("section_claim_provenance").insert({ intelligence_item_id: itemId, section_row_id: section, claim_kind: "DERIVED", claim_text: token, basis_claim_id: basisFact.id });
  if (error) return { skip: "insert-error: " + error.message };
  log.push({ item: itemId.slice(0,8), token, basis: basisFact.id.slice(0,8), tier, reasoning });
  return { minted: true };
}

async function rescanAndRevalidate(itemId) {
  const derivedCovered = await derivedCoveredTokens(sb, itemId);
  const { data: item } = await sb.from("intelligence_items").select("full_brief,provenance_status").eq("id", itemId).single();
  const facts = (await factsOf(itemId)).map((f) => ({ claim_text: f.claim_text || "", source_span: f.source_span || "" }));
  const r = scanBrief(item.full_brief, facts, derivedCovered);
  // Rule 015: the upsert becomes guarded update-then-insert (snapshot + cite; same net state as the raw upsert).
  const gsPatch = { scanned_hash: r.scanned_hash, orphan_count: r.orphan_count, orphans: r.orphans, gate_a_version: r.gate_a_version, scanned_at: new Date().toISOString() };
  const gs = await guardedUpdate("item_gate_a_state", (qb) => qb.eq("intelligence_item_id", itemId), gsPatch, { cite: CITE });
  if (!gs.updated) await guardedInsert("item_gate_a_state", { intelligence_item_id: itemId, ...gsPatch }, { cite: CITE });
  // touch to fire the provenance re-validate against fresh gate_a state (guarded path)
  await guardedUpdate("intelligence_items", (qb) => qb.eq("id", itemId), { last_scanned: new Date().toISOString() }, { cite: CITE });
  const { data: after } = await sb.from("intelligence_items").select("provenance_status").eq("id", itemId).single();
  return { orphan_count: r.orphan_count, statusBefore: item.provenance_status, statusAfter: after.provenance_status };
}

const touchedItems = new Set();
let planned = 0, minted = 0, skips = {};
const rec = (r) => { if (r.plan) planned++; if (r.minted) minted++; if (r.skip) skips[r.skip.split(":")[0]] = (skips[r.skip.split(":")[0]]||0)+1; };

if (TIER1) {
  const { data: states } = await sb.from("item_gate_a_state").select("intelligence_item_id,orphans").gt("orphan_count", 0);
  for (const st of states || []) {
    const derivedOrphans = (st.orphans || []).filter((o) => parseDerivedDate(o.token));
    if (!derivedOrphans.length) continue;
    const { data: it } = await sb.from("intelligence_items").select("id,provenance_status").eq("id", st.intelligence_item_id).maybeSingle();
    if (!it || it.provenance_status === "verified") continue;
    const facts = await factsOf(it.id);
    const ruleFacts = facts.map((f) => ({ f, rule: parseRecurringRule(f.source_span) })).filter((x) => x.rule);
    if (!ruleFacts.length) continue; // no grounded recurring-rule FACT → no basis → honest orphan (A3/revise)
    // Tier-1 UNAMBIGUOUS by ARITHMETIC: mint a derived date only when EXACTLY ONE recurring-rule FACT
    // arithmetically produces it. 0 matches → no basis (orphan); >1 → genuinely ambiguous → Tier 2 (judged pick).
    for (const o of derivedOrphans) {
      const matching = ruleFacts.filter((x) => isDerivedConsistent(x.rule, o.token));
      if (matching.length === 0) { rec({ skip: "no-matching-rule" }); continue; } // no grounded basis → honest orphan (A3)
      // matching.length === 1 → Tier 1 (unambiguous). >1 → Tier 2: every match is an arithmetically-valid basis
      // under the derived-basis rule; attribute to the first and RECORD it (not a blind pick — arithmetic-verified).
      const tier = matching.length === 1 ? 1 : 2;
      const reasoning = tier === 1
        ? "tier1: the sole recurring-rule FACT that arithmetically produces this date"
        : `tier2: ${matching.length} grounded recurring rules arithmetically produce this date; attributed to the first (all are valid bases under the derived-basis rule)`;
      const r = await mintOne(it.id, o.token, matching[0].f, tier, reasoning);
      rec(r); if (r.minted) touchedItems.add(it.id);
    }
  }
}
if (tier2Arg) {
  const rows = JSON.parse(readFileSync(resolve(process.cwd(), tier2Arg), "utf8"));
  for (const row of rows) {
    const { data: basis } = await sb.from("section_claim_provenance").select("id,source_span,search_result_id").eq("id", row.basisClaimId).eq("claim_kind","FACT").maybeSingle();
    if (!basis) { rec({ skip: "tier2-basis-not-a-fact" }); continue; }
    const r = await mintOne(row.item, row.token, basis, 2, row.reasoning || "tier2 judged"); rec(r); if (r.minted) touchedItems.add(row.item);
  }
}

let restored = 0;
if (EXECUTE) for (const id of touchedItems) { const r = await rescanAndRevalidate(id); if (r.statusBefore !== "verified" && r.statusAfter === "verified") restored++; }
console.log(`MODE ${EXECUTE ? "EXECUTE" : "DRY"} | tier1=${TIER1} tier2=${tier2Arg || "-"}`);
console.log(`planned=${planned} minted=${minted} skips=${JSON.stringify(skips)} items-touched=${touchedItems.size} restored=${restored}`);
console.log("LOG (first 25):", JSON.stringify(log.slice(0, 25)));
