/** PROOF SAMPLE 5c (operator ruling 2026-07-04). Runs the GROUND-ONLY pass (groundBrief = re-extract +
 *  slot-forcing) on a small sample THROUGH the spend chokepoint, to confirm the mechanism-projected
 *  ground-only clears on real fresh + cold items and to MEASURE the cost. ZERO fetches (scrape hold live —
 *  BROWSERLESS_API_KEY deleted; groundBrief reuses the stored pool). Bindings: seeded program total enforces
 *  the $1.13 headroom in code; per-call ceiling via the client; fitsUnderCeiling per-item pre-flight;
 *  authorization_ref = interim-$11-proof-sample; judge asymmetry + bounded top-K live in the pipeline.
 *  MODES: default DRY-RUN (seed + restated estimate + pre-run log, NO spend). --apply = the paid run. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient } from "./lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
delete process.env.BROWSERLESS_API_KEY;
if (process.env.BROWSERLESS_API_KEY) { console.error("REFUSING: BROWSERLESS_API_KEY still set."); process.exit(2); }
const APPLY = process.argv.includes("--apply");
const CAP = 11; // interim-$11-proof-sample ceiling
const K = 3;    // MAX_JUDGED_NOMINATIONS (stated per binding 3/6)

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { groundBrief } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const { setSpendTicket, resetSpendTicket, spentUsd, logSpendRun } = await jiti.import("../src/lib/llm/spend-client.ts");
const { seedSpend } = await jiti.import("../src/lib/llm/spend-guard.mjs");
const { readProgramTotalPaginated, fitsUnderCeiling } = await jiti.import("../src/lib/llm/program-total.mjs");
const { costUsdForModel } = await jiti.import("../src/lib/agent/generation-config.ts");

const sb = readClient();
// SAMPLE: 1 FRESH (batch-touched, live-verified) + COLD (never touched) + 1 dedup survivor (release deletes loser).
// Trimmed to fit the $1.08 headroom (dry-run measured): FRESH baseline + 1 COLD + the survivor LAST so a
// ceiling-throw (if any) protects the fresh+cold flip data already captured. l6 dropped for headroom.
const SAMPLE = [
  { key: "782878c0", cohort: "FRESH" },
  { key: "c8",       cohort: "COLD" },
  { key: "f0833999", cohort: "COLD", survivor: "CSRD survivor — release triggers held-loser deletion (standing gate)" },
];

const items = (await sb.from("intelligence_items").select("id,legacy_id,item_type,priority,source_url,provenance_status").eq("is_archived", false)).data || [];
const resolved = SAMPLE.map((s) => {
  const it = items.find((x) => x.legacy_id === s.key || x.id.slice(0, 8) === s.key);
  return it ? { ...s, id: it.id, type: it.item_type, priority: it.priority, sourceUrl: it.source_url, status: it.provenance_status } : { ...s, id: null };
}).filter((s) => s.id);

// ── SEED the program total (paginated — the table exceeds 1000 rows) ──
const fetchPage = async (offset, pageSize) => (await sb.from("agent_runs").select("cost_usd_estimated").order("id").range(offset, offset + pageSize - 1)).data || [];
const program = await readProgramTotalPaginated(fetchPage, 1000);
seedSpend(program.total);
const headroom = CAP - program.total;
console.log(`\n=== SEED === program total (paginated, ${program.rows} rows / ${program.pages} pages): $${program.total.toFixed(4)} | cap $${CAP} | headroom $${headroom.toFixed(4)}`);

// ── RESTATED ESTIMATE (binding 6): per-item pool tokens → ground call cost + slots×K Haiku judge ──
const REQ_SLOTS = (await sb.from("item_type_required_slots").select("item_type, slot_key")).data || [];
let restated = 0; const plan = [];
for (const s of resolved) {
  const pool = (await sb.from("agent_run_searches").select("result_content_excerpt").eq("intelligence_item_id", s.id)).data || [];
  const poolChars = Math.min(560000, pool.reduce((a, r) => a + (r.result_content_excerpt || "").length, 0));
  const inTok = Math.round(poolChars / 4);
  const groundCost = costUsdForModel("claude-sonnet-4-6", inTok, 8000); // 1 full-pool ground call + ~8k output
  const nSlots = REQ_SLOTS.filter((r) => r.item_type === s.type).length;
  const judgeCost = costUsdForModel("claude-haiku-4-5", nSlots * K * 300, nSlots * K * 40); // ≤ slots×K judge calls
  const est = groundCost + judgeCost;
  restated += est;
  plan.push({ ...s, poolChars, inTok, nSlots, est });
}
console.log(`\n=== PRE-RUN LOG (binding 6) ===`);
console.log(`judge model: claude-haiku-4-5 ($1/$5 per Mtok) | ground model: claude-sonnet-4-6 ($3/$15) | top-K=${K}`);
console.log(`per-item composition: 1 groundBrief full-pool call + (required slots × ≤${K}) Haiku judge calls`);
for (const p of plan) console.log(`  ${p.key.padEnd(12)} ${p.cohort.padEnd(6)} pool≈${(p.poolChars/1000).toFixed(0)}KB (${p.inTok} in-tok) slots=${p.nSlots} → est $${p.est.toFixed(4)}${p.survivor ? "  [survivor]" : ""}`);
console.log(`RESTATED SAMPLE TOTAL: $${restated.toFixed(4)} | headroom $${headroom.toFixed(4)} | 2x-stop threshold $${(2 * restated).toFixed(4)}`);
console.log(`FITS HEADROOM: ${restated <= headroom ? "YES" : "NO — sample exceeds headroom; the seeded ceiling will throw mid-run (a valid stop). Trim the sample or raise the ceiling."}`);

if (!APPLY) { console.log(`\nDRY-RUN — pass --apply to execute the paid sample.`); process.exit(0); }

// ── PAID RUN ──
console.log(`\n=== PAID RUN (through spend-client, seeded ceiling $${CAP}) ===`);
const failuresOf = async (id) => { const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id }); const r = Array.isArray(data) ? data[0] : data; return { valid: !!r?.valid, reasons: [...new Set((r?.failures || []).map((f) => f.reason))] }; };
const results = [];
for (const p of plan) {
  const before = await failuresOf(p.id);
  // pre-flight (defense in depth): does this item's estimate fit under the cap given the running total?
  const fit = fitsUnderCeiling(spentUsd(), p.est, CAP);
  if (!fit.ok) { console.log(`  ${p.key}: PRE-FLIGHT STOP — ${fit.reason}`); results.push({ ...p, stopped: "pre-flight ceiling" }); break; }
  setSpendTicket({ purpose: `5c proof sample ground-only: ${p.key}`, itemId: p.id, failureClasses: before.reasons, necessity: { rehomableFacts: 0 }, disposition: null, budgetCapUsd: CAP, authorizationRef: "interim-$11-proof-sample" });
  const spentBefore = spentUsd();
  let r;
  try { r = await groundBrief(p.id); }
  catch (e) { console.log(`  ${p.key}: CEILING/ERROR — ${e.message.slice(0, 90)}`); results.push({ ...p, stopped: e.message.slice(0, 90) }); break; }
  await logSpendRun(p.id, r.ok ? "success" : "error", p.sourceUrl);
  const cost = spentUsd() - spentBefore;
  const after = await failuresOf(p.id);
  const sf = r.slotForcing || {};
  results.push({ ...p, before: before.reasons, after: after.reasons, valid: after.valid, cost, sf, detail: r.detail });
  console.log(`  ${p.key.padEnd(12)} ${p.cohort.padEnd(6)} $${cost.toFixed(4)} valid=${after.valid} | slot-forcing: +${sf.factsForced || 0}F/+${sf.gapsForced || 0}G, ${(sf.relabelCandidates || []).length} 4c-cand, ${sf.judgeCalls || 0} judge | after=[${after.reasons.join(",") || "CLEAR"}]`);
  // STOP: measured cost > 2x restated (whole-sample), or a judge-fail dominating handled in report.
  if (spentUsd() - program.total > 2 * restated) { console.log(`  STOP: measured spend exceeded 2x restated ($${(2*restated).toFixed(4)}).`); break; }
}
resetSpendTicket();
console.log(`\n=== DONE === measured sample spend: $${(spentUsd() - program.total).toFixed(4)} | program total now: $${spentUsd().toFixed(4)} / $${CAP}`);
// durable result for the report
console.log("\nRESULTS_JSON " + JSON.stringify(results.map((r) => ({ key: r.key, cohort: r.cohort, cost: r.cost, valid: r.valid, before: r.before, after: r.after, factsForced: r.sf?.factsForced, gapsForced: r.sf?.gapsForced, judgeCalls: r.sf?.judgeCalls, relabels: r.sf?.relabelCandidates, audit: r.sf?.audit, stopped: r.stopped }))));
process.exit(0);
