#!/usr/bin/env node
// drain-clear.mjs — per-item prior-junk clearance under the operator ruling (2026-07-16): a prior claim whose
// span is ABSENT from the item's VERIFIED PRIMARY capture is PROVEN INACCURATE for this item (cross-instrument
// conflation) — version it out (archived to claim_versions WITH the proof, off the live ledger), never blanket-
// delete. Uses the sanctioned eraseClaimWithProof (fail-closed: archive-then-delete). Evidence-recorded, per-item.
//
// AUTO (with --apply): version out every FACT/ANALYSIS claim carrying a NON-EMPTY source_span that is NOT a
// verbatim substring of the item's primary capture (the source_url block). NULL-span claims are REPORTED only
// (they need a relabel/keep decision, not a span-absence proof). DRY-RUN default.
// Usage: node scripts/_reground/drain-clear.mjs <itemId|key> [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
delete process.env.BROWSERLESS_API_KEY;
const APPLY = process.argv.includes("--apply");
const key = process.argv[2];
if (!key) { console.error("usage: drain-clear.mjs <itemId|key> [--apply]"); process.exit(1); }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, guardedInsert, guardedDelete } = await jiti.import("../lib/db.mjs");
const { verifyTargetMatch, foreignInstrumentTokens } = await jiti.import("../../src/lib/sources/target-match.mjs");
const sb = readClient();

// Version-out through the GUARDED write path (eraseClaimWithProof uses the raw builder API, which the read
// client refuses; db.mjs's only write surface is the guarded functions). Fail-closed: archive to claim_versions
// FIRST (guardedInsert throws on error), and only then delete the current row — so an interrupted clear never
// loses the claim or its proof. This is the standalone-script form of eraseClaimWithProof (proven_inaccurate).
async function versionOutGuarded(c, itemId, proof, cite, supersedeReason = "proven_inaccurate") {
  const { data: prior } = await sb.from("claim_versions").select("version_number").eq("current_claim_id", c.id).order("version_number", { ascending: false }).limit(1);
  const vnum = (Array.isArray(prior) && prior.length ? Number(prior[0].version_number) : 0) + 1;
  const versionRow = {
    current_claim_id: null, // an EXIT archive soft-ref is null (history survives the row delete)
    intelligence_item_id: itemId, section_row_id: c.section_row_id ?? null,
    claim_text: c.claim_text ?? null, claim_kind: c.claim_kind ?? null, source_span: c.source_span ?? null,
    source_id: c.source_id ?? null, search_result_id: c.search_result_id ?? null,
    source_tier_at_grounding: c.source_tier_at_grounding ?? null, mint_hold_reason: c.mint_hold_reason ?? null,
    version_number: vnum, supersede_reason: supersedeReason, inaccuracy_proof: proof,
    superseded_at: new Date().toISOString(),
  };
  await guardedInsert("claim_versions", versionRow, { cite }); // throws if archive fails -> delete never runs
  await guardedDelete("section_claim_provenance", [c.id], { cite });
  return vnum;
}

const it = (await readAll("intelligence_items", "id,legacy_id,title,item_type,instrument_type,instrument_identifier,canonical_instrument_key,jurisdiction_iso,source_url", {})).find((x) => x.id.startsWith(key) || x.legacy_id === key || x.id === key);
if (!it) { console.error(`no item ${key}`); process.exit(2); }

// PRIMARY capture = the pool rows whose result_url matches the item's source_url (the verified instrument).
const { data: pool } = await sb.from("agent_run_searches").select("result_url, result_content_excerpt").eq("intelligence_item_id", it.id);
const norm = (u) => String(u || "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
const primaryText = (pool || []).filter((r) => norm(r.result_url) === norm(it.source_url)).map((r) => r.result_content_excerpt || "").join("\n");
if (primaryText.length < 200) { console.error(`primary capture too small (${primaryText.length} ch) for ${it.source_url} — cannot prove span-absence safely; abort`); process.exit(3); }
const inPrimary = (span) => primaryText.toLowerCase().includes(String(span).toLowerCase().trim());

// Authority floor for the item's type (reg-family <= 2). A SUB-FLOOR fact whose span is absent from the primary
// is a crit-3 failure that cannot re-attribute; a sub-floor fact whose span IS in the primary re-attributes.
const REG_FAMILY = ["regulation", "directive", "standard", "guidance", "framework"];
const floor = REG_FAMILY.includes(it.item_type) ? 2 : (it.item_type === "research_finding" ? 4 : 5);
const isSubFloor = (t) => t == null || Number(t) > floor;

// PRIMARY-CONFIRMED GATE (operator ruling 2026-07-16, over-clear incident): auto version-out runs ONLY when the
// item's primary is target-match CONFIRMED via an instrument identifier (not subject-overlap). A subject-overlap
// match means the declared primary may be the WRONG document (4ff5cf56: a 400k docket, not the FR instrument) —
// span-absence there proves nothing about cross-instrument, so NOTHING auto-clears; everything is reported.
const tm = verifyTargetMatch({ title: it.title, item_type: it.item_type, instrument_type: it.instrument_type, identifier: it.instrument_identifier, canonical_instrument_key: it.canonical_instrument_key, jurisdiction: it.jurisdiction_iso }, primaryText);
const primaryIdConfirmed = tm.verdict === "match" && (tm.via === "instrument-id" || tm.via === "raw-id");

const { data: claims } = await sb.from("section_claim_provenance").select("id, claim_kind, source_span, source_tier_at_grounding, claim_text, section_row_id, source_id, search_result_id, mint_hold_reason").eq("intelligence_item_id", it.id);
// Section prose + required slots for the ORPHAN class (third exit) + condition (b) slot-coverage-safety.
const { data: secs } = await sb.from("intelligence_item_sections").select("content_md").eq("item_id", it.id);
const allProse = (secs || []).map((s) => (s.content_md || "").toLowerCase()).join("\n\n");
const { data: reqSlots } = await sb.from("item_type_required_slots").select("slot_key").eq("item_type", it.item_type);
const requiredSlots = new Set((reqSlots || []).map((s) => s.slot_key));
const slotOf = (t) => { const m = String(t || "").match(/^\[([^\]]+)\]/); return m ? m[1] : null; };
const strip = (t) => String(t || "").replace(/^\[[^\]]+\]\s*/, "").trim();
// Replacement coverage for condition (b): a required slot is safely covered by any FACT or GAP claim carrying it.
const coveredByFactOrGap = new Set((claims || []).filter((c) => ["FACT", "GAP"].includes(c.claim_kind)).map((c) => slotOf(c.claim_text)).filter(Boolean));
const inProse = (text) => { const s = strip(text).toLowerCase(); return s.length > 0 && allProse.includes(s); };

console.log(`\n===== DRAIN-CLEAR ${it.legacy_id || it.id.slice(0, 8)} (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`primary: ${it.source_url}  (${primaryText.length} ch)  |  item_type=${it.item_type} floor<=${floor}`);
console.log(`target-match: ${tm.verdict} via ${tm.via} -> primary id-confirmed = ${primaryIdConfirmed}`);
console.log(`claims: ${(claims || []).length}\n`);

// THREE SANCTIONED LIVE-LEDGER EXITS (operator rulings 2026-07-16), proof not inference. A claim leaves the
// live ledger ONLY via one of:
//  1. VERSION-OUT proven_inaccurate (cross-instrument): BOTH (a) span ABSENT from the id-confirmed primary AND
//     (b) claim text NAMES a foreign instrument id (positive evidence). Never inferred from span-absence alone.
//  2. VERSION-OUT orphaned_no_prose_referent (functionless): BOTH (a) claim text verbatim-ABSENT from EVERY
//     section prose AND (b) if it covers a required slot, that slot is ALSO covered by a FACT/GAP (slot-safe);
//     an orphan that is a slot's SOLE coverage is a slot GAP to fill from the primary, never cleared.
//  3. RELABEL-to-ANALYSIS (true-but-secondary): stays LIVE, handled on the 4c prose path — reported here, not cleared.
const crossInstrument = [], orphans = [], reattribute = [], manualReview = [], slotGap = [];
for (const c of claims || []) {
  const span = (c.source_span || "").trim();
  const isCandidate = (c.claim_kind === "FACT" && isSubFloor(c.source_tier_at_grounding)) || c.claim_kind === "ANALYSIS";
  if (!isCandidate) continue;
  // ORPHAN class (ANALYSIS whose text annotates no prose paragraph anywhere).
  if (c.claim_kind === "ANALYSIS" && !inProse(c.claim_text)) {
    const slot = slotOf(c.claim_text);
    if (slot && requiredSlots.has(slot) && !coveredByFactOrGap.has(slot)) { slotGap.push({ ...c, _slot: slot }); continue; } // sole coverage -> fill, never clear
    orphans.push({ ...c, _slot: slot }); continue;
  }
  if (span && inPrimary(span)) { if (c.claim_kind === "FACT") reattribute.push(c); continue; }
  const foreign = span ? foreignInstrumentTokens(c.claim_text, { title: it.title, identifier: it.instrument_identifier, canonical_instrument_key: it.canonical_instrument_key }) : [];
  if (primaryIdConfirmed && span && !inPrimary(span) && foreign.length) crossInstrument.push({ ...c, _foreign: foreign });
  else manualReview.push({ ...c, _foreign: foreign, _reason: !primaryIdConfirmed ? "primary not id-confirmed" : !span ? "null span (in-prose analysis: relabel)" : !foreign.length ? "no foreign instrument id (true-but-secondary: relabel)" : "span in primary" });
}

console.log(`EXIT 1 — VERSION-OUT proven_inaccurate (span absent AND foreign instrument id, id-confirmed primary): ${crossInstrument.length}`);
for (const c of crossInstrument) console.log(`  [${c.claim_kind} t${c.source_tier_at_grounding}] foreign=${c._foreign.join(",")} :: ${String(c.claim_text).slice(0, 78)}`);
console.log(`EXIT 2 — VERSION-OUT orphaned_no_prose_referent (text absent from ALL prose, slot-safe): ${orphans.length}`);
for (const c of orphans) console.log(`  [${c.claim_kind}${c._slot ? ` slot=${c._slot}(covered)` : ""}] ${String(c.claim_text).slice(0, 80)}`);
if (slotGap.length) { console.log(`\nSLOT GAP (orphan is a required slot's SOLE coverage — FILL from primary, NOT cleared): ${slotGap.length}`); for (const c of slotGap) console.log(`  [slot=${c._slot}] ${String(c.claim_text).slice(0, 78)}`); }
if (reattribute.length) { console.log(`\nSPAN IN PRIMARY (sub-floor -> re-attribute at floor, NOT cleared): ${reattribute.length}`); for (const c of reattribute) console.log(`  [t${c.source_tier_at_grounding}] ${String(c.claim_text).slice(0, 88)}`); }
if (manualReview.length) { console.log(`\nEXIT 3 path / MANUAL REVIEW (relabel true-but-secondary, stays LIVE — NEVER auto-erased): ${manualReview.length}`); for (const c of manualReview) console.log(`  [${c.claim_kind}] (${c._reason}) ${String(c.claim_text).slice(0, 74)}`); }

if (!APPLY) { console.log(`\n(dry-run — --apply version-outs: ${crossInstrument.length} cross-instrument + ${orphans.length} orphaned)`); process.exit(0); }

let done = 0;
const citeX = { skill: "remediation-discipline", reason: `drain clearance (operator ruling 2026-07-16): version out cross-instrument claim for ${it.legacy_id || it.id.slice(0, 8)} — span absent from id-confirmed primary + names a foreign instrument` };
const citeO = { skill: "remediation-discipline", reason: `drain clearance (operator ruling 2026-07-16): version out orphaned functionless claim for ${it.legacy_id || it.id.slice(0, 8)} — claim text verbatim-absent from every section prose, slot-coverage-safe` };
for (const c of crossInstrument) {
  const proof = { reason: "span_absent_from_verified_primary", detail: `source_span not present in the item's id-confirmed primary (${it.source_url}) AND the claim names a foreign instrument (${c._foreign.join(", ")}) — proven cross-instrument`, primary_url: it.source_url, foreign_tokens: c._foreign, span_excerpt: String(c.source_span).slice(0, 200) };
  try { const v = await versionOutGuarded(c, it.id, proof, citeX, "proven_inaccurate"); done++; console.log(`  [proven_inaccurate] ${c.id.slice(0, 8)} -> v${v}`); }
  catch (e) { console.log(`  FAILED ${c.id.slice(0, 8)}: ${e.message}`); }
}
for (const c of orphans) {
  const proof = { reason: "orphaned_no_prose_referent", detail: `claim text verbatim-absent from every section content_md of the brief (functionless — annotates no prose paragraph); slot-coverage-safe (${c._slot ? `slot ${c._slot} covered by a FACT/GAP` : "no required slot"})`, prose_sections_checked: (secs || []).length, claim_excerpt: String(c.claim_text).slice(0, 200) };
  try { const v = await versionOutGuarded(c, it.id, proof, citeO, "orphaned_no_prose_referent"); done++; console.log(`  [orphaned_no_prose_referent] ${c.id.slice(0, 8)} -> v${v}`); }
  catch (e) { console.log(`  FAILED ${c.id.slice(0, 8)}: ${e.message}`); }
}
// Status recompute is handled by the AFTER DELETE trigger on section_claim_provenance (migration 209).
const { data: v } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
const val = Array.isArray(v) ? v[0] : v;
const { data: fin } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
console.log(`\nversioned out ${done} (${crossInstrument.length} cross-instrument + ${orphans.length} orphaned). validate: valid=${val?.valid} status=${fin?.provenance_status} failures=${JSON.stringify(val?.failures || []).slice(0, 220)}`);
process.exit(0);
