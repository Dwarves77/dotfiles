/** Deterministic analysis_missing_label_syntax repair (zero spend), generalized from the
 *  Japan MLIT fix. For each failing ANALYSIS claim: find its blank-line-delimited paragraph in
 *  intelligence_item_sections.content_md, prefix the paragraph with `*Analytical inference:* `
 *  (recognized label; KEEP the judgement, LABEL it), mirror the same paragraph in full_brief when
 *  present. Snapshot -> write -> validator read-back. Usage: node fix-analysis-labels.mjs <id,...> [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const ids = (process.argv[2] || "").split(",").map((s) => s.trim()).filter(Boolean);
if (!ids.length) { console.error("pass ids"); process.exit(2); }
const LABEL = "*Analytical inference:* ";
const LABEL_RE = /\*?(per the workspace's reading|analytical inference|industry interpretation|operational implication)(\s*\([^)]*\))?:\*?/i;

const snapRows = [], writes = [];
for (const id of ids) {
  const { data: v } = await db.rpc("validate_item_provenance", { p_item_id: id });
  const r = Array.isArray(v) ? v[0] : v;
  const claims = (r?.failures || []).filter((f) => f.reason === "analysis_missing_label_syntax").map((f) => f.claim);
  if (!claims.length) { console.log(`${id.slice(0, 8)}: no label failures — skip`); continue; }
  const { data: secs } = await db.from("intelligence_item_sections").select("id, section_key, content_md").eq("item_id", id);
  const { data: item } = await db.from("intelligence_items").select("id, legacy_id, full_brief").eq("id", id).single();
  let newBrief = item.full_brief;
  const secEdits = new Map(); // section row id -> content
  for (const claim of claims) {
    let placed = false;
    for (const s of secs || []) {
      const content = secEdits.get(s.id) ?? s.content_md ?? "";
      const paras = content.split(/\n[ \t]*\n/);
      const idx = paras.findIndex((p) => p.toLowerCase().includes(claim.toLowerCase()));
      if (idx === -1) continue;
      if (LABEL_RE.test(paras[idx])) { placed = true; break; } // already labeled (multi-claim same para)
      const before = paras[idx];
      paras[idx] = LABEL + before;
      secEdits.set(s.id, paras.join("\n\n"));
      // mirror in full_brief: same paragraph text
      if (newBrief.includes(before)) newBrief = newBrief.replace(before, LABEL + before);
      placed = true;
      console.log(`${item.legacy_id}: labeled para in section ${s.section_key} for claim "${claim.slice(0, 60)}…"`);
      break;
    }
    if (!placed) console.error(`${item.legacy_id}: PARA NOT FOUND for claim "${claim.slice(0, 60)}…"`);
  }
  if (secEdits.size) {
    snapRows.push({ item: { id: item.id, legacy_id: item.legacy_id, full_brief: item.full_brief } });
    for (const s of secs || []) if (secEdits.has(s.id)) snapRows.push({ section: { id: s.id, content_md: s.content_md } });
    writes.push({ id, secEdits, newBrief, briefChanged: newBrief !== item.full_brief });
  }
}
if (!APPLY) { console.log(`DRY-RUN: ${writes.length} item(s) staged`); process.exit(0); }

mkdirSync(resolve(ROOT, "scripts/_snapshots"), { recursive: true });
const snap = resolve(ROOT, "scripts/_snapshots", `${new Date().toISOString().replace(/[:.]/g, "-")}_analysis-label-fix.jsonl`);
writeFileSync(snap, snapRows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`snapshot: ${snap}`);
for (const w of writes) {
  for (const [sid, content] of w.secEdits) {
    const { error } = await db.from("intelligence_item_sections").update({ content_md: content }).eq("id", sid);
    if (error) throw error;
  }
  if (w.briefChanged) {
    const { error } = await db.from("intelligence_items").update({ full_brief: w.newBrief }).eq("id", w.id);
    if (error) throw error;
  }
  const { data: v } = await db.rpc("validate_item_provenance", { p_item_id: w.id });
  const r = Array.isArray(v) ? v[0] : v;
  const { data: st } = await db.from("intelligence_items").select("provenance_status, legacy_id").eq("id", w.id).single();
  console.log(`${st.legacy_id}: valid=${r?.valid} stored=${st.provenance_status} failures=${(r?.failures || []).length}`);
}
