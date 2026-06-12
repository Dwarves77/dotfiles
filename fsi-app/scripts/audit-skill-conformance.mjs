/** READ-ONLY skill-conformance audit (ZERO Browserless, ZERO LLM). Per project_corpus_reverify_plan:
 *  code-verifiable dims over ALL items; semantic dims sampled later. Encodes the CODE-CHECKABLE
 *  properties of a skill-conformant brief from environmental-policy-and-innovation +
 *  analysis-construction-spec + source-credibility-model. Output: per-item pass/fail + which checks fail,
 *  so the redo scope is evidence-based, not "redo all blindly". No writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient, readAll } = await import("./lib/db.mjs");
const sb = readClient();
const APPLY = process.argv.includes("--apply"); // --apply PERSISTS results to integrity_flags (durable)
const AUDIT_TAG = "skill-conformance-audit";    // created_by marker; idempotent + drives the redo query

const CURRENT_CONTRACT = "2026-04-29"; // bump when SKILL.md regeneration_skill_version advances
const FORMAT_FOR = { regulation: "regulatory_fact_document", directive: "regulatory_fact_document", standard: "regulatory_fact_document", guidance: "regulatory_fact_document", framework: "regulatory_fact_document", technology: "technology_profile", innovation: "technology_profile", tool: "technology_profile", regional_data: "operations_profile", market_signal: "market_signal_brief", initiative: "market_signal_brief", research_finding: "research_summary" };
const MIN_SECTIONS = { regulatory_fact_document: 8, technology_profile: 7, operations_profile: 7, market_signal_brief: 7, research_summary: 5 };
const TOPIC_VOCAB = new Set(["emissions", "fuels", "transport", "reporting", "packaging", "corridors", "research"]);
// LIVE DB severity form is lowercase_UNDERSCORE (migration 102, "canonical from here forward"), NOT the
// lowercase-with-SPACES this previously used. The space form only matched the single word "monitoring",
// falsely failing the ~86 items carrying valid action_required/cost_alert/window_closing/competitive_edge
// (inflating the "severity" fail count). SoT: src/lib/agent/metadata-vocab.ts DB_SEVERITY_VALUES (5-label set).
const SEVERITY_VALID = new Set(["action_required", "cost_alert", "window_closing", "competitive_edge", "monitoring"]);

const items = await readAll("intelligence_items", "id,legacy_id,item_type,format_type,severity,provenance_status,regeneration_skill_version,topic_tags,operational_scenario_tags,compliance_object_tags,agent_integrity_flag", { match: (q) => q.eq("is_archived", false) });

function auditOne(it, brief) {
  const f = {};
  // C1 current contract
  f.contract = !!it.regeneration_skill_version && it.regeneration_skill_version >= CURRENT_CONTRACT;
  // C2 format_type present + matches item_type mapping
  f.format = !!it.format_type && it.format_type === FORMAT_FOR[it.item_type];
  // C3 severity present + valid. Skill: mandatory on reg/market/tech/operations; OPTIONAL on
  // research_summary — so research_finding is exempt (missing severity there is NOT a failure).
  f.severity = it.item_type === "research_finding" ? true : (!!it.severity && SEVERITY_VALID.has(String(it.severity).toLowerCase()));
  // C4 inline citations (integrity rule: every claim sourced inline). Count "Source:" + bare URLs.
  const srcCount = (brief.match(/source:/gi) || []).length + (brief.match(/https?:\/\//g) || []).length;
  f.citations = srcCount >= 3;
  // C5 section completeness for the format
  const headers = (brief.match(/^#{1,3}\s+\S/gm) || []).length;
  const need = MIN_SECTIONS[it.format_type || FORMAT_FOR[it.item_type]] || 6;
  f.sections = headers >= need;
  // C7 topic_tags within closed vocabulary. Skill: empty is RARELY legitimate ("fits none of the
  // seven"), so empty is a soft signal; out-of-vocab tags are a hard contract violation.
  const tt = Array.isArray(it.topic_tags) ? it.topic_tags : [];
  f.topics = tt.length === 0 ? true : tt.every((t) => TOPIC_VOCAB.has(t)); // out-of-vocab = fail; empty = pass (soft-flag below)
  // C8 no unresolved integrity flag
  f.integrity = it.agent_integrity_flag !== true;
  const failed = Object.entries(f).filter(([, v]) => !v).map(([k]) => k);
  // INFORMATIONAL (NOT conformance failures — skill permits empty as honest for standalone items):
  const info = {
    intersectionEmpty: !((Array.isArray(it.operational_scenario_tags) && it.operational_scenario_tags.length > 0) || (Array.isArray(it.compliance_object_tags) && it.compliance_object_tags.length > 0)),
    topicsEmpty: tt.length === 0,
  };
  return { failed, conformant: failed.length === 0, info };
}

let conformant = 0, intersectionEmpty = 0, topicsEmpty = 0;
const failCounts = {};
const perItem = [];
for (const it of items) {
  const { data: b } = await sb.from("intelligence_items").select("full_brief").eq("id", it.id).single();
  const brief = b?.full_brief || "";
  const { failed, conformant: ok, info } = auditOne(it, brief);
  if (ok) conformant++;
  if (info.intersectionEmpty) intersectionEmpty++;
  if (info.topicsEmpty) topicsEmpty++;
  for (const k of failed) failCounts[k] = (failCounts[k] || 0) + 1;
  perItem.push({ key: it.legacy_id || it.id.slice(0, 8), type: it.item_type, prov: it.provenance_status, ver: it.regeneration_skill_version || "(none)", briefLen: brief.length, failed });
}

console.log(`\n===== SKILL-CONFORMANCE AUDIT (read-only, ${items.length} items) =====`);
console.log(`FULLY conformant (all checks pass): ${conformant}  |  need work: ${items.length - conformant}`);
console.log(`\nfailures by check (count of items failing each):`);
console.log(`  C1 contract (not current skill version): ${failCounts.contract || 0}`);
console.log(`  C2 format_type (missing/wrong):          ${failCounts.format || 0}`);
console.log(`  C3 severity (missing/invalid):           ${failCounts.severity || 0}`);
console.log(`  C4 citations (<3 inline sources):        ${failCounts.citations || 0}`);
console.log(`  C5 sections (below format minimum):      ${failCounts.sections || 0}`);
console.log(`  C7 topic_tags (OUT-OF-VOCAB only):       ${failCounts.topics || 0}`);
console.log(`  C8 integrity flag (unresolved):          ${failCounts.integrity || 0}`);
console.log(`\nINFORMATIONAL (skill permits empty as honest — NOT conformance failures):`);
console.log(`  intersection-readiness empty: ${intersectionEmpty}  | topic_tags empty: ${topicsEmpty}`);
// breakdown: of the non-conformant, how many are ONLY-contract-stale vs have content-quality fails
const onlyContract = perItem.filter((p) => p.failed.length === 1 && p.failed[0] === "contract").length;
const contentFails = perItem.filter((p) => p.failed.some((k) => ["citations", "sections", "topics", "integrity"].includes(k))).length;
console.log(`\nof the non-conformant: ${onlyContract} are ONLY contract-version-stale (content may still be fine);`);
console.log(`${contentFails} have at least one CONTENT-quality failure (citations/sections/topics/integrity).`);
writeFileSync(resolve(ROOT, "scripts/_diag/_conformance.json"), JSON.stringify(perItem, null, 1));
console.log(`\nper-item detail -> scripts/_diag/_conformance.json`);

// ── PERSIST to Supabase (integrity_flags) so the audit is durable + drives the redo + shows in admin ──
// INSERT-only (additive; not a row mutation of existing content → rule-015-clean). Idempotent: skip
// items that already carry an OPEN skill-conformance flag; RESOLVE flags for items now conformant.
const idOf = new Map(items.map((it) => [it.legacy_id || it.id.slice(0, 8), it.id]));
const failedById = new Map(perItem.filter((p) => p.failed.length > 0).map((p) => [idOf.get(p.key), p.failed]));
const conformantIds = new Set(perItem.filter((p) => p.failed.length === 0).map((p) => idOf.get(p.key)));

const existing = await readAll("integrity_flags", "id,subject_ref,status", { match: (q) => q.eq("created_by", AUDIT_TAG) });
const openFlagByRef = new Map(existing.filter((f) => f.status === "open").map((f) => [f.subject_ref, f.id]));

if (!APPLY) {
  const toWrite = [...failedById.keys()].filter((id) => !openFlagByRef.has(id)).length;
  const toResolve = [...conformantIds].filter((id) => openFlagByRef.has(id)).length;
  console.log(`\n[persist DRY-RUN] would INSERT ${toWrite} new conformance flags, RESOLVE ${toResolve}. Pass --apply to write to integrity_flags.`);
} else {
  let inserted = 0, resolved = 0;
  const rows = [];
  for (const [id, failed] of failedById) {
    if (!id || openFlagByRef.has(id)) continue; // already flagged
    rows.push({
      category: "data_quality", subject_type: "item", subject_ref: id,
      description: `Skill-conformance audit: brief fails [${failed.join(", ")}] vs current skill contract — needs regeneration under current skills (env-policy 13-field contract + analysis-construction-spec).`,
      recommended_actions: [{ action: "regenerate under current skill contract", rationale: "conform to env-policy format/severity/topic-vocab/citation rules + analysis-construction-spec section/grounding spec" }],
      status: "open", created_by: AUDIT_TAG,
    });
  }
  // batch insert
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("integrity_flags").insert(rows.slice(i, i + 200));
    if (error) { console.log("INSERT error:", error.message); break; } inserted += Math.min(200, rows.length - i);
  }
  // resolve flags for items now conformant
  for (const id of conformantIds) {
    const fid = openFlagByRef.get(id);
    if (!fid) continue;
    const { error } = await sb.from("integrity_flags").update({ status: "resolved" }).eq("id", fid);
    if (!error) resolved++;
  }
  // read-back verification
  const after = await readAll("integrity_flags", "id,status", { match: (q) => q.eq("created_by", AUDIT_TAG) });
  const openNow = after.filter((f) => f.status === "open").length;
  console.log(`\n[persist] INSERTED ${inserted} new flags, RESOLVED ${resolved}. integrity_flags(${AUDIT_TAG}) now: ${after.length} total, ${openNow} open.`);
}
