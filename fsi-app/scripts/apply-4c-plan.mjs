/** 4c PLAN APPLIER (PURE NODE — standing dispatch step 3a, ruling 2026-07-04). Consumes a plan emitted by the
 *  loader-context judge (run-4c-relabel.mjs) and performs the content_md relabels. This is the STANDING write
 *  architecture: loader-run scripts judge + emit plans; THIS pure-node applier does every DB write with
 *  cross-process read-back verification. Pure node (no jiti, no spend-client, no model calls) — the same
 *  standalone context in which guarded writes are PROVEN to commit (the loader-context runner's writes returned
 *  200 but did not commit; root cause not isolated, so the architecture eliminates the class by construction).
 *
 *  Per plan entry: DRIFT CHECK (current content == plan.origContent → safe to write; == newContent → already
 *  applied, skip; else → drift, skip + warn — never clobber a changed section). guardedUpdate → FRESH-CLIENT
 *  read-back → assert persisted → HALT on mismatch. After each item, re-validate. ZERO mint. DRY-RUN default;
 *  --apply writes. Usage: node scripts/apply-4c-plan.mjs <plan.json> [--apply] */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readClient, guardedUpdate } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const planPath = process.argv.find((a) => a.endsWith(".json"));
if (!planPath) { console.error("usage: node scripts/apply-4c-plan.mjs <plan.json> [--apply]"); process.exit(2); }
const { plan, held } = JSON.parse(readFileSync(resolve(planPath), "utf8"));
const sb = readClient();

// ── PLAN SCHEMA VALIDATION (dispatch item 5b): defense-in-depth against the next v.v. Reject the WHOLE plan if
// any entry (a) carries a label outside the #169 canonical vocabulary, or (b) has newContent in the garbage
// class (a literal "undefined " prepend — the exact defect that polluted the corpus), or (c) is structurally
// malformed. A bad plan never touches the DB. ──
const CANON_LABELS = ["Analytical inference:", "Operational implication:", "Industry interpretation:"];
const GARBAGE = /undefined /;
const violations = [];
for (const [i, p] of plan.entries()) {
  if (!p || !p.sectionId || typeof p.newContent !== "string" || typeof p.origContent !== "string") { violations.push(`#${i}: malformed entry`); continue; }
  if (GARBAGE.test(p.newContent)) violations.push(`#${i} ${p.itemKey} §${p.sectionKey}: newContent matches GARBAGE class ("undefined " prepend)`);
  for (const a of p.applied || []) {
    if (!CANON_LABELS.includes(a.label)) violations.push(`#${i} ${p.itemKey} §${p.sectionKey}: label "${a.label}" NOT in #169 canonical vocabulary`);
    if (!p.newContent.includes(a.label)) violations.push(`#${i} ${p.itemKey} §${p.sectionKey}: applied label not present in newContent`);
  }
}
if (violations.length) {
  console.log(`\n=== PLAN VALIDATION FAILED — refusing to apply (${violations.length} violation(s)) ===`);
  for (const v of violations.slice(0, 20)) console.log(`  ${v}`);
  process.exit(4);
}
console.log(`\n=== 4c PLAN APPLIER (${APPLY ? "APPLY" : "DRY-RUN"}) === plan: ${plan.length} relabels, ${(held || []).length} held [schema valid]`);
let applied = 0, alreadyDone = 0, drifted = 0, byItem = {};
for (const p of plan) {
  const { data: cur, error } = await sb.from("intelligence_item_sections").select("content_md").eq("id", p.sectionId).single();
  if (error || !cur) { console.log(`  ${p.itemKey} §${p.sectionKey}: MISSING (${error?.message || "no row"}) — skip`); continue; }
  if (cur.content_md === p.newContent) { alreadyDone += 1; continue; }               // idempotent
  if (cur.content_md !== p.origContent) { drifted += 1; console.log(`  ${p.itemKey} §${p.sectionKey}: DRIFT (content changed since plan) — skip, do not clobber`); continue; }
  if (!APPLY) { console.log(`  ${p.itemKey} §${p.sectionKey}: WOULD relabel (${p.applied.length} sentence(s))`); (byItem[p.itemId] ||= { key: p.itemKey, n: 0 }).n++; continue; }
  const upd = await guardedUpdate("intelligence_item_sections", (qb) => qb.eq("id", p.sectionId), { content_md: p.newContent }, { cite: { skill: "analysis-construction-spec", reason: `4c: relabel unlabeled workspace-analysis (${p.itemKey} §${p.sectionKey}); every binding sentence judged WORKSPACE_ANALYSIS` } });
  const fresh = readClient(); // FRESH instance for the cross-process-equivalent read-back
  const { data: back } = await fresh.from("intelligence_item_sections").select("content_md").eq("id", p.sectionId).single();
  if (upd.updated !== 1 || back?.content_md !== p.newContent) {
    console.log(`  ${p.itemKey} §${p.sectionKey}: WRITE DID NOT PERSIST (updated=${upd.updated}) — HALT`);
    process.exit(3);
  }
  applied += 1; (byItem[p.itemId] ||= { key: p.itemKey, n: 0 }).n++;
  console.log(`  ${p.itemKey} §${p.sectionKey}: RELABELED [persisted OK]`);
}
console.log(`\napplied=${applied} alreadyDone=${alreadyDone} drifted=${drifted}`);

if (APPLY && applied) {
  console.log(`\n=== re-validate touched items ===`);
  let flipped = 0;
  for (const itemId of Object.keys(byItem)) {
    const { data } = await sb.rpc("validate_item_provenance", { p_item_id: itemId });
    const r = Array.isArray(data) ? data[0] : data;
    if (r?.valid) flipped += 1;
    console.log(`  ${byItem[itemId].key}: valid=${!!r?.valid} remaining=[${[...new Set((r?.failures || []).map((f) => f.reason))].join(",") || "CLEAR"}]`);
  }
  console.log(`\nitems flipped to verified by 4c: ${flipped}`);
}
if (!APPLY) console.log(`\nDRY-RUN — pass --apply to write the plan.`);
process.exit(0);
