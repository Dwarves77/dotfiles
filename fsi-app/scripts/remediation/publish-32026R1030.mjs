#!/usr/bin/env node
// SANCTIONED REVISION → FIRST PUBLICATION: clear 32026R1030's three non-Gate-A criteria. $0, no model calls.
//
// (1) c3 fact_below_authority_floor — claim 4c2e0efa is grounded to iso.org (T4); the reg-family floor is T2.
//     This is NOT a relabel case: the item's OWN T1 primary (the regulation) carries the same fact in recital 13.
//     So it is FLOOR-FIRST SPAN RE-ATTRIBUTION (source-credibility-model): when the fact is genuinely present in
//     a floor-qualifying source, attribution MUST prefer it. The span is extracted PROGRAMMATICALLY from the
//     stored capture and asserted `capture.includes(span)` — never retyped, so a transcription slip is impossible.
//     claim_text is rewritten to track the primary's own wording (the span must support the claim, RD-48 spirit).
//
// (2) c4 analysis_missing_label_syntax — the Smart Freight Centre sentence is industry-body content (T4) carrying
//     an analysis-class claim with no label in the prose. Per env-policy ("Industry body interpretation is labeled
//     separately and cited as the operator's view, not legal authority") it gains `*Industry interpretation:*`.
//
// (3) c4 unlabeled_assertion (section 9) — a FALSE-POSITIVE family already on record (the Colorado DOT case: the
//     binding-verb regex firing on an editorial note). The sentence is inside an OMISSION notice: "The regulation
//     applies to transport services, not to specific products sold by the workspace." Cured the sanctioned way —
//     reworded as descriptive prose (skill exit (d)), meaning preserved exactly, nothing dropped.
//
// full_brief and the section content_md are edited TOGETHER (they must not diverge), then Gate A is re-scanned
// because the md5 changes, then validate re-runs and the trigger restores status. Read-back asserts every axis.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardedUpdate } from "../lib/db.mjs";

const ROOT = resolve(process.cwd());
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { scanBrief } = await import(pathToFileURL(resolve(ROOT, "src/lib/agent/gate-a-scan.mjs")).href);
const { derivedCoveredTokens } = await import(pathToFileURL(resolve(ROOT, "src/lib/agent/gate-a-derived.mjs")).href);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Every existing-row write goes through guardedUpdate (rule 015): it snapshots the PRIOR values before the
// patch, so a sanctioned revision is reversible, and it requires the governing-skill citation. Raw
// sb.from().update() on an existing row is forbidden — the first version of this script used it and the
// discipline engine correctly refused the commit.
const CITE = { skill: "environmental-policy-and-innovation",
  reason: "Sanctioned revision of 32026R1030 to clear criteria 3 and 4 (floor-first span re-attribution + two labeling fixes) so the brief can publish (operator ruling 2026-07-30)." };
const EXECUTE = process.argv.includes("--execute");
const ITEM = "cd1083c9-fd05-47f7-bfed-8354b70a31ac";
const CLAIM = "4c2e0efa-e809-4735-a435-8a2d4be02c4a";
const SEC9 = "ab0b0fa5-84d4-4c1f-812b-ce5047f33a4a";
const SEC13 = "57e7e174-c95e-45cd-ad67-a1276f843542";

const OLD_SEC9 = "The regulation applies to transport services, not to specific products sold by the workspace.";
const NEW_SEC9 = "The regulation's scope is transport services rather than specific products sold by the workspace.";
const OLD_SFC = "Smart Freight Centre launched a Conformity Assessment Scheme in July 2023 aligned with ISO 14083.";
const NEW_SFC = "*Industry interpretation:* Smart Freight Centre launched a Conformity Assessment Scheme in July 2023 aligned with ISO 14083.";

// ── Pull the T1 primary capture and extract the recital-13 span verbatim ────────────────────────────────
const { data: pool } = await sb.from("agent_run_searches").select("id,result_url,result_content_excerpt").eq("intelligence_item_id", ITEM);
const primary = (pool || []).find((p) => /CELEX(%3A|:)32026R1030/i.test(p.result_url || ""));
if (!primary) { console.error("HALT: no T1 primary capture for the item"); process.exit(2); }
const cap = primary.result_content_excerpt || "";
const start = cap.indexOf("EN ISO 14083:2023");
const endMark = "under this Regulation.";
const end = cap.indexOf(endMark, start);
if (start < 0 || end < 0) { console.error("HALT: recital-13 span not locatable in the primary capture"); process.exit(3); }
// RAW slice — NO whitespace normalisation. The first attempt normalised (`\s+` -> " ") and verified
// normalised-against-normalised, which passed here but FAILED the DB's criterion-1 check
// (fact_span_not_in_source) because that compares the span against the source's LITERAL stored bytes.
// The verification must be byte-identical to what the gate checks, or it proves nothing.
const SPAN = cap.slice(start, end + endMark.length).trim();
if (!cap.includes(SPAN)) { console.error("HALT: extracted span is not verbatim in the capture"); process.exit(4); }
const NEW_CLAIM_TEXT = "EN ISO 14083:2023 should be the common methodology for calculating greenhouse gas emissions from transport services under this Regulation.";

// The attribution target is the ITEM'S OWN registered source (item.source_id), not a URL lookup. A URL lookup
// returned TWO rows here — my institutionKey override at registration is used for the dedup LOOKUP but the stored
// rows key off their URL, so a second registration run re-inserted rather than matching (8 duplicate source rows,
// cleaned separately). Reading source_id off the item is both correct-by-construction and immune to that.
const { data: itSrc } = await sb.from("intelligence_items").select("source_id").eq("id", ITEM).single();
const { data: src } = await sb.from("sources").select("id,name,base_tier,status").eq("id", itSrc.source_id).single();
if (!src || src.base_tier > 2 || src.status !== "active") { console.error(`HALT: item source not floor-qualifying/active: ${JSON.stringify(src)}`); process.exit(5); }

console.log(`SPAN (${SPAN.length}ch, verbatim-verified): ${SPAN.slice(0, 150)}…`);
console.log(`RE-ATTRIBUTE claim ${CLAIM.slice(0, 8)}: iso.org T4 -> ${src.name} T${src.base_tier}`);

const { data: it0 } = await sb.from("intelligence_items").select("full_brief").eq("id", ITEM).single();
let fb = it0.full_brief;
// IDEMPOTENT: a prior --execute may already have applied these. Treat "already new" as done, not as an error;
// only a string that is neither old nor new is a genuine mismatch worth halting on.
for (const [oldS, newS] of [[OLD_SEC9, NEW_SEC9], [OLD_SFC, NEW_SFC]]) {
  if (fb.includes(newS)) { console.log(`  edit already applied: ${newS.slice(0, 52)}…`); continue; }
  if (!fb.includes(oldS)) { console.error(`HALT: brief contains neither the old nor the new form of: ${oldS.slice(0, 60)}…`); process.exit(6); }
  fb = fb.replace(oldS, newS);
}
console.log(`brief edits staged: ${it0.full_brief.length}ch -> ${fb.length}ch`);
if (!EXECUTE) { console.log("\nDRY — nothing written. Add --execute."); process.exit(0); }

// ── WRITES ─────────────────────────────────────────────────────────────────────────────────────────────
// search_result_id MUST move with the span. Criterion 3 verifies the span against the pool row joined by
// `ars.id = scp.search_result_id` — NOT by source_id. Re-attributing source_id alone left the claim pointing at
// the ISO pool row, whose excerpt has no EUR-Lex recital text, so the span check failed even though the span was
// verbatim in the primary capture. The evidence pointer and the attribution have to move together.
const up1 = await guardedUpdate("section_claim_provenance", (qb) => qb.eq("id", CLAIM), {
  claim_text: NEW_CLAIM_TEXT, source_span: SPAN, source_id: src.id,
  source_tier_at_grounding: src.base_tier, search_result_id: primary.id,
}, { cite: CITE });
if (up1.updated !== 1) { console.error(`HALT: claim re-attribution updated ${up1.updated} rows`); process.exit(7); }

for (const [secId, oldS, newS] of [[SEC9, OLD_SEC9, NEW_SEC9], [SEC13, OLD_SFC, NEW_SFC]]) {
  const { data: s } = await sb.from("intelligence_item_sections").select("content_md").eq("id", secId).single();
  if (s.content_md.includes(newS)) { console.log(`  section ${secId.slice(0, 8)} already applied`); continue; }
  if (!s.content_md.includes(oldS)) { console.error(`HALT: section ${secId.slice(0, 8)} has neither old nor new form`); process.exit(8); }
  const r = await guardedUpdate("intelligence_item_sections", (qb) => qb.eq("id", secId),
    { content_md: s.content_md.replace(oldS, newS) }, { cite: CITE });
  if (r.updated !== 1) { console.error(`HALT: section ${secId.slice(0, 8)} updated ${r.updated} rows`); process.exit(9); }
}
const upB = await guardedUpdate("intelligence_items", (qb) => qb.eq("id", ITEM), { full_brief: fb }, { cite: CITE });
if (upB.updated !== 1) { console.error(`HALT: brief update affected ${upB.updated} rows`); process.exit(10); }

// ── GATE A RE-SCAN (md5 changed) then re-validate ───────────────────────────────────────────────────────
const derived = await derivedCoveredTokens(sb, ITEM);
const { data: facts } = await sb.from("section_claim_provenance").select("claim_text,source_span").eq("intelligence_item_id", ITEM).eq("claim_kind", "FACT");
const scan = scanBrief(fb, (facts || []).map((f) => ({ claim_text: f.claim_text || "", source_span: f.source_span || "" })), derived);
await sb.from("item_gate_a_state").upsert({ intelligence_item_id: ITEM, scanned_hash: scan.scanned_hash, orphan_count: scan.orphan_count,
  orphans: scan.orphans, gate_a_version: scan.gate_a_version, scanned_at: new Date().toISOString() }, { onConflict: "intelligence_item_id" });
console.log(`gate-a re-scan: orphans=${scan.orphan_count} version=${scan.gate_a_version}`);

// touch to fire the provenance trigger
await guardedUpdate("intelligence_items", (qb) => qb.eq("id", ITEM), { updated_at: new Date().toISOString() }, { cite: CITE });

// ── READ-BACK ──────────────────────────────────────────────────────────────────────────────────────────
const { data: v } = await sb.rpc("validate_item_provenance", { p_item_id: ITEM });
const r = Array.isArray(v) ? v[0] : v;
const { data: fin } = await sb.from("intelligence_items").select("provenance_status,full_brief").eq("id", ITEM).single();
const { data: g } = await sb.from("item_gate_a_state").select("orphan_count,gate_a_version,scanned_hash").eq("intelligence_item_id", ITEM).single();
const { data: cl } = await sb.from("section_claim_provenance").select("id,source_tier_at_grounding").eq("intelligence_item_id", ITEM);
const subFloor = (cl || []).filter((c) => c.source_tier_at_grounding != null && c.source_tier_at_grounding > 2).length;
console.log(`\n===== READ-BACK =====`);
console.log(`valid=${r?.valid} failures=${JSON.stringify([...new Set((r?.failures || []).map((f) => f.reason))])}`);
console.log(`status=${fin?.provenance_status} | orphans=${g?.orphan_count} @ ${g?.gate_a_version} | claims=${(cl || []).length} | sub-floor FACT tiers=${subFloor}`);
console.log(`brief-hash matches scan: ${g?.scanned_hash === scan.scanned_hash}`);
console.log(fin?.provenance_status === "verified" ? `\nPUBLISHED: ${ITEM}` : `\nNOT PUBLISHED — still ${fin?.provenance_status}`);
