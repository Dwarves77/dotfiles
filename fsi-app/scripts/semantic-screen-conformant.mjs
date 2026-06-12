/** SEMANTIC skill-quality screen (cheap Haiku) over the MECHANICALLY-conformant items — passing the
 *  mechanical audit is necessary-not-sufficient; this checks the skill's SEMANTIC bar (four lenses,
 *  Context Rule, cause-and-effect, integrity, Forward-Intelligence, workspace-anchoring) that code can't.
 *  Per project_corpus_reverify_plan (semantic=sample) + project_corpus_skill_conformance_redo
 *  (persist to Supabase). Read-only on briefs; PERSISTS FAIL verdicts to integrity_flags so failures
 *  join the redo queue. Idempotent (skips already-flagged). DRY-RUN default; --apply runs Haiku + writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalGenerate, textOf } from "./lib/anthropic.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient, readAll } = await import("./lib/db.mjs");
const sb = readClient();
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const TAG = "skill-conformance-semantic";

const SYSTEM = `You audit a freight-sustainability intelligence brief for Caro's Ledge against the platform skill standard. A PASS brief reads as decision intelligence, not a data dump. Check:
1. Four lenses: substantive content, competitive positioning, client-conversation, action.
2. Context Rule: facts carry a comparison/conversion AND a decision consequence by transport mode + cargo vertical — not naked data.
3. Cause-and-effect chains, sourced at each link.
4. Integrity: gaps explicitly labeled (omit-with-note), no invented operators/costs/RFPs, claims cited inline.
5. Forward-Intelligence where applicable: what is coming + how the workspace can participate.
6. Workspace-anchored: generic by role/vertical, never names a specific company or person.
Return ONLY JSON: {"verdict":"PASS"|"FAIL","reason":"<=180 chars"}. FAIL if generic, missing lenses, naked facts, invented content, or it names a company/person.`;

// the mechanically-conformant set = non-archived items WITHOUT an open skill-conformance-audit flag
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type", { match: (q) => q.eq("is_archived", false) });
const mechFlags = await readAll("integrity_flags", "subject_ref,status", { match: (q) => q.eq("created_by", "skill-conformance-audit") });
const mechFailed = new Set(mechFlags.filter((f) => f.status === "open").map((f) => f.subject_ref));
const conformant = items.filter((it) => !mechFailed.has(it.id));
const semFlags = await readAll("integrity_flags", "subject_ref,status", { match: (q) => q.eq("created_by", TAG) });
const alreadySem = new Set(semFlags.filter((f) => f.status === "open").map((f) => f.subject_ref));

console.log(`\n===== SEMANTIC SCREEN (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`mechanically-conformant items: ${conformant.length}  | already semantic-flagged: ${alreadySem.size}`);
console.log(`to screen: ${Math.min(conformant.length, LIMIT)}  | est Haiku ~$${(Math.min(conformant.length, LIMIT) * 0.015).toFixed(2)}`);
if (!APPLY) { console.log(`\nDRY-RUN — pass --apply [--limit=N] to run Haiku + persist FAIL verdicts.`); process.exit(0); }

function parseVerdict(t) { try { const m = t.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; } }
let pass = 0, fail = 0, err = 0; const failRows = [];
for (const it of conformant.slice(0, LIMIT)) {
  if (alreadySem.has(it.id)) continue;
  const key = it.legacy_id || it.id.slice(0, 8);
  try {
    const { data: b } = await sb.from("intelligence_items").select("full_brief").eq("id", it.id).single();
    const brief = (b?.full_brief || "").slice(0, 11000);
    const r = await canonicalGenerate({ model: "claude-haiku-4-5", maxTokens: 250, system: SYSTEM, messages: [{ role: "user", content: `item_type: ${it.item_type}\n\nBRIEF:\n${brief}` }] });
    const v = parseVerdict(textOf(r));
    if (!v) { err++; console.log(`  ${key.padEnd(12)} SCREEN-ERROR (unparseable)`); continue; }
    if (v.verdict === "PASS") { pass++; console.log(`  ${key.padEnd(12)} PASS`); }
    else { fail++; console.log(`  ${key.padEnd(12)} FAIL — ${(v.reason || "").slice(0, 70)}`); failRows.push({ category: "data_quality", subject_type: "item", subject_ref: it.id, description: `Semantic skill-quality screen FAIL: ${(v.reason || "").slice(0, 220)}`, recommended_actions: [{ action: "regenerate under current skill contract", rationale: "semantic skill-quality (lenses/Context-Rule/integrity) below bar despite passing mechanical checks" }], status: "open", created_by: TAG }); }
  } catch (e) { err++; console.log(`  ${key.padEnd(12)} ERROR: ${e.message.slice(0, 60)}`); }
}
if (failRows.length) { const { error } = await sb.from("integrity_flags").insert(failRows); if (error) console.log("INSERT error:", error.message); }
const after = await readAll("integrity_flags", "id,status", { match: (q) => q.eq("created_by", TAG) });
console.log(`\nscreened: PASS ${pass}  FAIL ${fail}  errors ${err}`);
console.log(`[persist] semantic FAIL flags in Supabase: ${after.length} (open ${after.filter((f) => f.status === "open").length})`);
