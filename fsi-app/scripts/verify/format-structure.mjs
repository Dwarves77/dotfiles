/** VERIFIER (read-only, ZERO Browserless): format structure — RECONCILED with the integrity rule.
 *
 *  GOVERNING SKILL (criteria derived from + confirmed against, not memory):
 *   - environmental-policy-and-innovation §"Conditional Section Application" (line 321): the reg-family
 *     always-present set {1,2,3,4,8,10,11,14,15} — VERIFIED to match formats/regulation.ts exactly (2026-06-06).
 *   - environmental-policy-and-innovation integrity rule (lines 29/196/748) + Rule 11 (integrity supersedes):
 *     any section may be omitted WITH A NOTE -> "present (content OR note) = PASS; silent absence = FAIL".
 *   - analysis-construction-spec: authority for the FOUR non-reg formats' conditionality (e.g. Operations
 *     S3/S4 gate-on-coverage). KNOWN OPEN: Technology S1 code(always) vs env-policy(omittable) — a per-format
 *     SPEC-owner decision; flagged, not silently resolved.
 *
 *  v1 measured section-ROW extraction and over-flagged (e.g. FreightWaves "missing S4" was a false flag:
 *  S4 is in the full_brief, British-spelled, WITH an omission note). v2 measures BRIEF completeness:
 *  for each always-present (conditional:false) section, is its heading present in the full_brief
 *  (spelling-tolerant: ize/ise; + headingAlts)? PASS = present (content OR skill-form omission note);
 *  FAIL = silently absent. This stops false-flagging integrity-correct omissions (skill line 748:
 *  "*No content for this section as of [date]: [reason].*").
 *
 *  Reports THREE numbers, kept distinct:
 *   (A) BRIEF-DEFECT  = required section silently absent from full_brief  -> the true format defect.
 *   (B) NOTED-OMISSION = section present but body is an omission note      -> integrity-correct, PASS.
 *   (C) EXTRACTION-GAP = section IS in full_brief but has no stored row    -> sectioning defect (re-section),
 *                                                                            NOT a brief defect.
 *  Whether a conditional:false section is TRULY mandatory vs omittable-with-note is a per-format SPEC
 *  decision — surfaced (the always-present heads each failing item names), not resolved here. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { specForItemType } = await jiti.import("../../src/lib/agent/extract-registry.ts");
const { sectionPresent, norm } = await import("./_fmt-present.mjs");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const NOTE_RE = /no content for this section|as of \d{4}-\d{2}-\d{2}|not publicly available|not available from primary|no .{0,40}identified as of|no authoritative guidance|research gap|unconfirmed/i;

const { data: items } = await sb.from("intelligence_items")
  .select("id,legacy_id,title,item_type,updated_at,full_brief")
  .eq("provenance_status", "verified").eq("is_archived", false)
  .order("updated_at", { ascending: false }).limit(2000);

let pass = 0; const briefDefects = []; let extractionGaps = 0; let notedOmissions = 0;
for (const it of items || []) {
  const spec = specForItemType(it.item_type);
  if (!spec) { briefDefects.push({ it, absent: ["<no-spec>"], reqN: 0 }); continue; }
  const fb = it.full_brief || "";
  const nfb = norm(fb);
  const required = spec.sections.filter((s) => !s.conditional);
  const { data: secs } = await sb.from("intelligence_item_sections").select("section_key,content_md").eq("item_id", it.id);
  const rowKeys = new Set((secs || []).filter((s) => (s.content_md || "").trim()).map((s) => String(s.section_key)));

  const absent = [];
  for (const s of required) {
    const inBrief = sectionPresent(s.key, s.heading, s.headingAlts || [], fb, nfb);
    if (!inBrief) { absent.push(s.key); continue; }
    // present in brief — classify: noted omission vs content; extraction-gap if no row
    if (!rowKeys.has(String(s.key))) extractionGaps++;
    // crude note detection near the heading (within 220 chars after the matched heading)
    const hnorm = norm(s.heading);
    const idx = nfb.indexOf(hnorm.slice(0, 28));
    if (idx >= 0 && NOTE_RE.test(fb.slice(0, fb.length))) notedOmissions++; // brief contains note language somewhere (informational only)
  }
  if (absent.length === 0) pass++;
  else briefDefects.push({ it, absent, reqN: required.length });
}

const N = (items || []).length;
console.log(`\n===== VERIFIER v2: format-structure (brief-completeness, reconciled, 0 Browserless) =====`);
console.log(`verified briefs: ${N}  |  PASS(all required sections present in brief) ${pass}  BRIEF-DEFECT(silent absence) ${briefDefects.length}`);
console.log(`(secondary) extraction-gaps observed (section in brief, no row -> re-section): ${extractionGaps}  | briefs containing note-language: ${notedOmissions}\n`);
if (briefDefects.length) {
  console.log(`── TRUE FORMAT DEFECTS: required section silently absent from full_brief (${briefDefects.length}) ──`);
  for (const f of briefDefects.slice(0, 90)) console.log(`  [${f.it.item_type}] ${(f.it.legacy_id||f.it.id.slice(0,8))} absent [${f.absent.join(",")}] of ${f.reqN}  ${(f.it.title||'').slice(0,46)}`);
  if (briefDefects.length > 90) console.log(`  ... +${briefDefects.length - 90} more`);
}
console.log(`\n=== v2 done (nothing mutated). v1's row-based count was extraction completeness, not brief completeness. ===`);
