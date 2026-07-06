/** 4c JUDGE + PLAN-EMITTER (PAID ~$0.19 Haiku, standing dispatch step 3, ruling 2026-07-04). Resolves
 *  unlabeled_assertion (validator criterion-4) by relabeling genuine WORKSPACE-ANALYSIS assertions to labeled
 *  analysis — NEVER downgrading a real binding requirement (#187 moat). This LOADER-context runner ONLY JUDGES,
 *  READS, and EMITS A PLAN (JSON). It performs NO DB writes — a diagnosed anomaly makes guardedUpdate writes
 *  from THIS loader context report 200 yet not commit globally (root cause not isolated; every isolated
 *  component persists, the full runner does not). All writes route through scripts/apply-4c-plan.mjs (pure
 *  node, proven durable) with cross-process read-back. This is the standing architecture: loader-run scripts
 *  emit plans; a pure-node applier writes.
 *
 *  For each QUARANTINED item's unlabeled section: judge EVERY binding sentence (WORKSPACE_ANALYSIS vs
 *  PRIMARY_REQUIREMENT vs UNCERTAIN); plan a relabel ONLY if ALL binding sentences judge WORKSPACE_ANALYSIS (no
 *  partial-section loophole). UNCERTAIN = held. Labels use the #169 canonical vocabulary ("Analytical
 *  inference:" / "Operational implication:") so the edit satisfies mig145:279-282. ZERO fetch, ZERO mint.
 *  Emits telemetry via logSpendRun (fixes the earlier ledger-omission). --limit N caps items. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
delete process.env.BROWSERLESS_API_KEY;
if (process.env.BROWSERLESS_API_KEY) { console.error("REFUSING: BROWSERLESS_API_KEY still set."); process.exit(2); }
const LIMIT = (() => { const i = process.argv.indexOf("--limit"); return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity; })();

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { bindingSentences, decideRelabel, applyLabelToContent } = await jiti.import("../src/lib/agent/relabel-unlabeled.mjs");
const { spendStream, setSpendTicket, resetSpendTicket, spentUsd, logSpendRun, assertLedgerDrained } = await jiti.import("../src/lib/llm/spend-client.ts");
const { readClient, readAll } = await jiti.import("./lib/db.mjs");
const { SPEND_CEILING_USD } = await jiti.import("../src/lib/agent/generation-config.ts");

const sb = readClient();

async function judge4c(sentence, sectionKey) {
  const system = `You classify ONE binding assertion from a regulatory brief section. The grounding pipeline ALREADY tried and could NOT ground this assertion to a verbatim primary-source span. Classify its epistemic nature:
- WORKSPACE_ANALYSIS: the workspace's OWN analytical reasoning or operational implication (an inference, a "this means for your lanes…", a downstream consequence). Safe to label as analysis.
- PRIMARY_REQUIREMENT: a statement of a binding requirement that a PRIMARY legal source establishes (an article/section obligation, a deadline, a duty on a defined role). This should be GROUNDED, never downgraded.
- UNCERTAIN: cannot tell.
Output ONLY JSON: {"kind":"WORKSPACE_ANALYSIS|PRIMARY_REQUIREMENT|UNCERTAIN","label":"inference|operational","why":"<=90 chars"}. A false WORKSPACE_ANALYSIS is UNACCEPTABLE (it downgrades a real fact); DEFAULT to PRIMARY_REQUIREMENT or UNCERTAIN whenever the assertion reads as a real legal requirement. Use "operational" label only for a downstream operational-consequence statement, else "inference".`;
  const user = `SECTION ${sectionKey}. BINDING ASSERTION:\n"""${String(sentence).slice(0, 800)}"""\nClassify.`;
  try {
    const { text } = await spendStream({ system, user, model: "claude-haiku-4-5-20251001", maxTokens: 150 });
    const m = text.match(/\{[\s\S]*?\}/);
    if (!m) return { kind: "UNCERTAIN", why: "no JSON" };
    const j = JSON.parse(m[0]);
    const kind = ["WORKSPACE_ANALYSIS", "PRIMARY_REQUIREMENT", "UNCERTAIN"].includes(j.kind) ? j.kind : "UNCERTAIN";
    const label = j.label === "operational" ? "operational" : "inference";
    return { kind, label, why: typeof j.why === "string" ? j.why.slice(0, 90) : undefined };
  } catch (e) { return { kind: "UNCERTAIN", why: `judge error: ${String(e.message).slice(0, 50)}` }; }
}

const items = await readAll("intelligence_items", "id,legacy_id,item_type,provenance_status", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
const targets = [];
for (const it of items) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const r = Array.isArray(data) ? data[0] : data;
  const secRows = [...new Set((r?.failures || []).filter((f) => f.reason === "unlabeled_assertion").map((f) => f.section_row_id))];
  if (secRows.length) targets.push({ ...it, secRows });
}
console.log(`\n=== 4c JUDGE + PLAN-EMIT (${LIMIT !== Infinity ? `--limit ${LIMIT}` : "all"}) === quarantined w/ unlabeled_assertion: ${targets.length} items`);

const plan = [];
const held = [];
let itemsDone = 0, judgeCalls = 0;
for (const it of targets) {
  if (itemsDone >= LIMIT) break;
  const key = it.legacy_id || it.id.slice(0, 8);
  setSpendTicket({ purpose: `4c judge: ${key}`, itemId: it.id, failureClasses: ["unlabeled_assertion"], necessity: { rehomableFacts: 0 }, disposition: null, budgetCapUsd: SPEND_CEILING_USD, authorizationRef: "4c-judge" });
  for (const secRowId of it.secRows) {
    const { data: sec } = await sb.from("intelligence_item_sections").select("id, section_key, content_md").eq("id", secRowId).single();
    if (!sec) continue;
    const sentences = bindingSentences(sec.content_md);
    if (!sentences.length) continue;
    const verdicts = [];
    for (const s of sentences) { verdicts.push({ s, v: await judge4c(s, sec.section_key) }); judgeCalls += 1; }
    const allWorkspace = verdicts.every((x) => x.v.kind === "WORKSPACE_ANALYSIS");
    if (!allWorkspace) {
      const blocker = verdicts.find((x) => x.v.kind !== "WORKSPACE_ANALYSIS");
      held.push({ key, itemId: it.id, sectionKey: sec.section_key, kind: blocker.v.kind, why: blocker.v.why });
      continue;
    }
    let newContent = sec.content_md;
    const applied = [];
    for (const { s, v } of verdicts) { const d = decideRelabel(v); if (d.action !== "RELABEL") continue; const r = applyLabelToContent(newContent, s, d.label); if (r.changed) { newContent = r.content; applied.push({ span: s.slice(0, 90), label: d.label, why: v.why }); } }
    if (newContent === sec.content_md) continue;
    plan.push({ sectionId: sec.id, itemId: it.id, itemKey: key, sectionKey: sec.section_key, origContent: sec.content_md, newContent, applied });
    console.log(`  ${key} §${sec.section_key}: PLANNED (${applied.length} sentence(s) relabeled)`);
  }
  // log this item's judge spend to agent_runs (fixes the earlier ledger omission)
  await logSpendRun(it.id, "success", null);
  itemsDone += 1;
}
resetSpendTicket();
// CLOSE-OUT (binding 3c): assert every accounted spend left a ledger row, then cross-process read-back the
// telemetry rows THIS run wrote (a fresh client, so it's the committed count, not in-process state).
assertLedgerDrained();
const freshSb = readClient();
const { count: spendCallRows } = await freshSb.from("agent_runs").select("id", { count: "exact", head: true }).eq("fetch_method", "spend-call");
console.log(`ledger drained OK; per-call telemetry automatic — ${judgeCalls} judge calls this run, ${spendCallRows ?? "?"} spend-call rows in agent_runs (cross-process read-back).`);

const outDir = resolve(ROOT, "scripts/_plans"); mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, `4c-plan-${Date.now()}.json`);
writeFileSync(outFile, JSON.stringify({ generated_at: new Date().toISOString(), plan, held }, null, 2));
console.log(`\n=== DONE === items=${itemsDone} planned=${plan.length} held=${held.length} judgeCalls=${judgeCalls} spend=$${(spentUsd()).toFixed(4)} (logged to agent_runs)`);
console.log(`PLAN: ${outFile}`);
console.log(`APPLY: node scripts/apply-4c-plan.mjs ${outFile} --apply`);
process.exit(0);
