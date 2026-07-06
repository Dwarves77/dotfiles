/** FUNDED PASS, BATCHED (PAID — standing dispatch item 3, ruling 2026-07-04). Runs the ground-only re-ground
 *  (groundBrief = re-extract + pool-source floor-first slot-forcing, the PR #184 nomination fix) over a batch
 *  of quarantined items THROUGH the spend chokepoint, under FOUR stacked stop-layers:
 *    1. per-call ceiling  — SPEND_CEILING_USD (seeded with the program total so history counts).
 *    2. per-batch buffer  — projectBatchFitsBuffer: refuse to START a batch that projects past the $80 soft cap.
 *    3. per-item breaker  — itemBreakerTripped: stop THIS item if it spends >= $3.00 (runaway containment).
 *    4. stop conditions   — measured > 2x restated (batch), ceiling throw, breaker trip.
 *  ZERO fetches (scrape hold live — BROWSERLESS_API_KEY deleted; groundBrief reuses the stored pool). ZERO
 *  mints (re-grounds existing briefs in place; never inserts an intelligence_items row).
 *
 *  BATCH 1 validates the nomination fix (the flaw-exposing item + the CSRD survivor + COLD + a floor-only;
 *  l1 EXCLUDED — already verified). On each item that flips to verified, this runner EMITS a release/deletion
 *  PLAN (binding 3b: loader context judges/reads/proposes ONLY — ZERO guardedUpdate here); a pure-node applier
 *  (apply-funded-releases.mjs) re-verifies LIVE and does every write with byte-compare read-back. A survivor's
 *  disposition_deferred flags RELEASE; an identifier-exact held dup-loser is DELETED — both through the applier.
 *  Prints the per-cohort flip table + genuine-support audit + measured cost + clean-verdict. DRY-RUN default
 *  (seed + restated estimate + batch-gate, NO spend); --apply = the paid run + plan emit. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { createJiti } from "jiti";
import { readClient, readAll } from "./lib/db.mjs";
import { buildReleaseDeletionPlan, normUrl } from "./lib/funded-release-plan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
delete process.env.BROWSERLESS_API_KEY;
if (process.env.BROWSERLESS_API_KEY) { console.error("REFUSING: BROWSERLESS_API_KEY still set."); process.exit(2); }
const APPLY = process.argv.includes("--apply");
// CASCADE mode (--cascade): auto-select the whole ground-only-ELIGIBLE quarantine set instead of the hardcoded
// validation BATCH. Eligible = quarantined + has missing_required_slot + NOT counsel-held + has a usable pool
// (counsel-held / floor-only / unlabeled-only are excluded — wrong tool / seek-more, not paid ground). The
// per-item stops (breaker, ceiling, 2x-measured) + a judge-fail-cohort stop bound the spend.
const CASCADE = process.argv.includes("--cascade");
const COHORT_WINDOW = 8; // judge-fail-cohort stop: this many consecutive judge-engaged holds with 0 flips → stop

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { groundBrief } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const { setSpendTicket, resetSpendTicket, spentUsd, logSpendRun, assertLedgerDrained } = await jiti.import("../src/lib/llm/spend-client.ts");
const { seedSpend, resetItemLedger, takeItemLedger, itemBreakerTripped, PER_ITEM_CIRCUIT_BREAKER_USD } = await jiti.import("../src/lib/llm/spend-guard.mjs");
const { readProgramTotalPaginated, fitsUnderCeiling, projectBatchFitsBuffer, CEILING_BUFFER_USD } = await jiti.import("../src/lib/llm/program-total.mjs");
const { costUsdForModel, SPEND_CEILING_USD } = await jiti.import("../src/lib/agent/generation-config.ts");
const K = 3;

// BATCH 1 (flip-focused validation). ALL are PURE missing_required_slot — the class ground-only (slot-forcing)
// genuinely fixes — so a clean batch validates the nomination fix. l1 EXCLUDED (verified — necessity gate).
// Floor-only (7a0ead55) + unlabeled-only (c8) are the WRONG tool for ground-only (they route to the free 4b
// re-home lever / 4c respectively) — deferred to their own passes, not paid here.
// FUNDED_BATCH env override (comma-separated keys) — a targeted batch (e.g. the cat-2 re-ground set). Falls
// back to the batch-1 validation set. --cascade auto-selects the whole eligible set (ignores this).
const BATCH = process.env.FUNDED_BATCH
  ? process.env.FUNDED_BATCH.split(",").map((k) => ({ key: k.trim(), cohort: "TARGET", note: "targeted re-ground (FUNDED_BATCH)" }))
  : [
    { key: "782878c0", cohort: "FRESH", note: "flaw-exposing (SAF Order) — nomination-fix validation" },
    { key: "f0833999", cohort: "FRESH", note: "CSRD survivor — release unlocks the 9c5d1d17 deletion (item-1 gate)", survivor: true },
    { key: "4ff5cf56", cohort: "COLD",  note: "COLD reg (LOW), pure missing_required_slot" },
    { key: "g18",      cohort: "COLD",  note: "COLD reg (LOW), pure missing_required_slot" },
    { key: "388b2ce8", cohort: "COLD",  note: "COLD research_finding (LOW) — cross-format validation" },
  ];

const sb = readClient();
const items = await readAll("intelligence_items", "id,legacy_id,item_type,priority,source_url,provenance_status,instrument_identifier,is_archived", { match: (q) => q.eq("is_archived", false) });
let resolved;
if (CASCADE) {
  // build the eligible set live (mirrors scripts/_diag/_cascade-scope.mjs)
  const counselHeld = new Set((await readAll("integrity_flags", "subject_ref", { match: (q) => q.eq("subject_type", "item").eq("status", "open").eq("created_by", "phase2_priority_review") })).map((f) => f.subject_ref));
  const quar = items.filter((x) => x.provenance_status === "quarantined");
  resolved = [];
  for (const it of quar) {
    if (counselHeld.has(it.id)) continue;
    const { data } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
    const r = Array.isArray(data) ? data[0] : data;
    const reasons = [...new Set((r?.failures || []).map((f) => f.reason))];
    if (!reasons.includes("missing_required_slot")) continue;
    const pool = await readAll("agent_run_searches", "result_content_excerpt", { match: (q) => q.eq("intelligence_item_id", it.id) });
    if (pool.reduce((a, x) => a + (x.result_content_excerpt || "").length, 0) < 500) continue;
    resolved.push({ key: it.legacy_id || it.id.slice(0, 8), cohort: "CASCADE", note: `${it.item_type}/${it.priority}`, id: it.id, type: it.item_type, priority: it.priority, sourceUrl: it.source_url, instrument: it.instrument_identifier });
  }
  console.log(`\n=== CASCADE === auto-selected ${resolved.length} ground-only-eligible items (counsel-held excluded: ${counselHeld.size})`);
} else {
  resolved = BATCH.map((s) => {
    const it = items.find((x) => x.legacy_id === s.key || x.id.slice(0, 8) === s.key);
    return it ? { ...s, id: it.id, type: it.item_type, priority: it.priority, sourceUrl: it.source_url, instrument: it.instrument_identifier } : { ...s, id: null };
  }).filter((s) => s.id);
}

// ── SEED the program total (paginated) ──
const fetchPage = async (offset, ps) => (await sb.from("agent_runs").select("cost_usd_estimated").order("id").range(offset, offset + ps - 1)).data || [];
const program = await readProgramTotalPaginated(fetchPage, 1000);
seedSpend(program.total);
console.log(`\n=== SEED === program total (paginated, ${program.rows} rows): $${program.total.toFixed(4)} | ceiling $${SPEND_CEILING_USD} | headroom $${(SPEND_CEILING_USD - program.total).toFixed(2)} | soft-cap $${SPEND_CEILING_USD - CEILING_BUFFER_USD}`);

// ── RESTATED per-item estimate (pool tokens → ground call + slots×K Haiku judge) ──
const REQ_SLOTS = (await sb.from("item_type_required_slots").select("item_type, slot_key")).data || [];
let restated = 0; const plan = [];
for (const s of resolved) {
  const pool = (await sb.from("agent_run_searches").select("result_content_excerpt").eq("intelligence_item_id", s.id)).data || [];
  const poolChars = Math.min(560000, pool.reduce((a, r) => a + (r.result_content_excerpt || "").length, 0));
  const groundCost = costUsdForModel("claude-sonnet-4-6", Math.round(poolChars / 4), 8000);
  const nSlots = REQ_SLOTS.filter((r) => r.item_type === s.type).length;
  const judgeCost = costUsdForModel("claude-haiku-4-5", nSlots * K * 300, nSlots * K * 40);
  const est = groundCost + judgeCost;
  restated += est; plan.push({ ...s, poolChars, nSlots, est });
}
const restatedAvg = restated / (plan.length || 1);
console.log(`\n=== RESTATED BATCH ESTIMATE === ${plan.length} items, avg $${restatedAvg.toFixed(4)}, total $${restated.toFixed(4)} (2x-stop $${(2 * restated).toFixed(4)})`);
for (const p of plan) console.log(`  ${p.key.padEnd(12)} ${p.cohort.padEnd(6)} pool≈${(p.poolChars / 1000).toFixed(0)}KB slots=${p.nSlots} est $${p.est.toFixed(4)}${p.survivor ? "  [survivor]" : ""}  — ${p.note}`);

// ── BATCH GATE (stop-layer 2): does the batch project under the soft cap (from the estimate here)? ──
const batchGate = projectBatchFitsBuffer(program.total, restatedAvg, plan.length, SPEND_CEILING_USD);
console.log(`\n=== BATCH GATE === ${batchGate.reason}`);
if (!batchGate.ok) { console.log(`STOP: batch projects into the buffer. Remaining items stay Fork-B deferred; resume on top-up.`); process.exit(0); }

if (!APPLY) { console.log(`\nDRY-RUN — pass --apply to run the paid batch.`); process.exit(0); }

// ── PAID RUN ──
console.log(`\n=== PAID RUN (through spend-client, seeded ceiling $${SPEND_CEILING_USD}) ===`);
const failuresOf = async (id) => { const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id }); const r = Array.isArray(data) ? data[0] : data; return { valid: !!r?.valid, reasons: [...new Set((r?.failures || []).map((f) => f.reason))] }; };
// Loader context READS ONLY — the flip data becomes a PLAN a pure-node applier writes (binding 3b: zero
// guardedUpdate from loader context for releases/deletion). Collect each flipped item's open
// disposition_deferred flag ids + (for a survivor) its live held-loser candidates (same url/instrument,
// quarantined, not archived) — the plan-builder's isDeletableLoser gate decides; the applier re-checks live.
const openDeferredFlagIds = async (id) => (await readAll("integrity_flags", "id", { match: (q) => q.eq("subject_type", "item").eq("subject_ref", id).eq("status", "open").eq("created_by", "disposition_deferred") })).map((f) => f.id);
// a live counsel / seek-more hold = an OPEN phase2_priority_review flag (the counsel_NO_SOURCE_QUALIFIED /
// seek-more honest-exit writer). A held loser is deletion-ineligible regardless of pairing (binding 1b-iii).
const hasLiveHold = async (id) => ((await readAll("integrity_flags", "id", { match: (q) => q.eq("subject_type", "item").eq("subject_ref", id).eq("status", "open").eq("created_by", "phase2_priority_review") })).length > 0);
async function loserCandidatesFor(survivorRow) {
  const su = normUrl(survivorRow.source_url), si = survivorRow.instrument_identifier;
  const rows = items.filter((x) => x.id !== survivorRow.id && x.provenance_status !== "verified" && !x.is_archived &&
    ((su && normUrl(x.source_url) === su) || (si && x.instrument_identifier === si)));
  const out = [];
  for (const row of rows) out.push({ row, loserHasHold: await hasLiveHold(row.id) });
  return out;
}
const results = [];
const flippedForPlan = [];
for (const p of plan) {
  const before = await failuresOf(p.id);
  if (before.valid) { console.log(`  ${p.key.padEnd(12)} ${p.cohort.padEnd(6)} already VERIFIED — no re-ground (skip, avoid needless thinning risk)`); results.push({ ...p, skipped: "already-verified", valid: true }); continue; }
  const fit = fitsUnderCeiling(spentUsd(), p.est, SPEND_CEILING_USD);
  if (!fit.ok) { console.log(`  ${p.key}: PRE-FLIGHT CEILING STOP — ${fit.reason}`); results.push({ ...p, stopped: "ceiling" }); break; }
  resetItemLedger();
  setSpendTicket({ purpose: `funded-pass ground-only: ${p.key}`, itemId: p.id, failureClasses: before.reasons, necessity: { rehomableFacts: 0 }, disposition: null, provenanceStatus: items.find((x) => x.id === p.id)?.provenance_status, budgetCapUsd: SPEND_CEILING_USD, authorizationRef: "funded-pass-$85" });
  let r;
  try { r = await groundBrief(p.id); }
  catch (e) { console.log(`  ${p.key}: CEILING/ERROR — ${e.message.slice(0, 100)}`); results.push({ ...p, stopped: e.message.slice(0, 100) }); break; }
  const itemCost = takeItemLedger().costUsd;
  const breaker = itemBreakerTripped(itemCost);
  await logSpendRun(p.id, r.ok ? "success" : "error", p.sourceUrl);
  const after = await failuresOf(p.id);
  const sf = r.slotForcing || {};
  if (after.valid) {
    const survivorRow = { ...items.find((x) => x.id === p.id), provenance_status: "verified" };
    flippedForPlan.push({ itemId: p.id, itemKey: p.key, survivor: p.survivor ? survivorRow : null, survivorHasPrimaryGrounding: true, deferredFlagIds: await openDeferredFlagIds(p.id), loserCandidates: p.survivor ? await loserCandidatesFor(survivorRow) : [] });
  }
  results.push({ ...p, before: before.reasons, after: after.reasons, valid: after.valid, cost: itemCost, sf, breakerTripped: breaker.tripped, detail: r.detail });
  console.log(`  ${p.key.padEnd(12)} ${p.cohort.padEnd(6)} $${itemCost.toFixed(4)} valid=${after.valid} | SF: +${sf.factsForced || 0}F/+${sf.gapsForced || 0}G ${(sf.relabelCandidates || []).length}rl ${sf.judgeCalls || 0}j | after=[${after.reasons.join(",") || "CLEAR"}]`);
  if (breaker.tripped) { console.log(`  STOP: ${breaker.reason}`); break; }
  const measured = spentUsd() - program.total;
  if (measured > 2 * restated) { console.log(`  STOP: measured $${measured.toFixed(4)} > 2x restated $${(2 * restated).toFixed(4)}.`); break; }
  // judge-fail-cohort stop: COHORT_WINDOW consecutive judge-ENGAGED items with 0 flips ⇒ the remaining pool is
  // exhausted of groundable FACTs (paying more only produces holds) — stop and let the rest ride to seek-more.
  const tail = results.filter((x) => !x.skipped && !x.stopped).slice(-COHORT_WINDOW);
  if (tail.length >= COHORT_WINDOW && tail.every((x) => !x.valid && (x.sf?.judgeCalls || 0) > 0)) {
    console.log(`  STOP: judge-fail cohort dominance — last ${COHORT_WINDOW} judge-engaged items all held (0 flips); pool set exhausted of groundable FACTs. Remaining items ride to seek-more.`); break;
  }
}
resetSpendTicket();
assertLedgerDrained();

// ── EMIT the release/deletion PLAN (no writes here — the pure-node applier applies it) ──
const releasePlan = buildReleaseDeletionPlan(flippedForPlan);
const plansDir = resolve(ROOT, "scripts", "_plans");
mkdirSync(plansDir, { recursive: true });
const planFile = resolve(plansDir, `funded-releases-${new globalThis.Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(planFile, JSON.stringify({ meta: { emittedAt: new globalThis.Date().toISOString(), flipped: flippedForPlan.map((f) => f.itemKey) }, ...releasePlan }, null, 2));
console.log(`\n=== RELEASE/DELETION PLAN EMITTED === ${releasePlan.releases.length} release(s), ${releasePlan.deletionProposals.length} deletion proposal(s), ${releasePlan.ambiguous.length} ambiguous(→surface), ${releasePlan.skipped.length} skipped(topical)`);
for (const d of releasePlan.deletionProposals) console.log(`  DELETE-PROPOSAL loser ${d.loserKey} on survivor ${d.survivorKey} [${d.bucket}] — ${d.reason}`);
for (const a of releasePlan.ambiguous) console.log(`  AMBIGUOUS ${a.loserKey} (survivor ${a.survivorKey}) — SURFACE, no delete: ${a.reason}`);
for (const s of releasePlan.skipped) console.log(`  SKIP(topical) ${s.loserKey} (survivor ${s.survivorKey}) — ${s.reason}`);
console.log(`  plan: ${planFile}\n  APPLY: node scripts/apply-funded-releases.mjs "${planFile}" --apply`);
const measuredTotal = spentUsd() - program.total;
console.log(`\n=== DONE === measured batch spend: $${measuredTotal.toFixed(4)} | program total now: $${spentUsd().toFixed(4)} / $${SPEND_CEILING_USD}`);

// ── genuine-support audit (judge decisions) ──
console.log(`\n=== GENUINE-SUPPORT AUDIT (per forced slot: nominated / judged / decision) ===`);
for (const r of results.filter((x) => x.sf)) {
  for (const a of (r.sf.audit || [])) console.log(`  ${r.key.padEnd(12)} ${String(a.slot).padEnd(24)} nom=${a.nominated} judged=${a.judgedTopK} confirmed=${a.judgeConfirmed} -> ${a.decision}${a.why ? ` (${String(a.why).slice(0, 60)})` : ""}`);
}
// ── clean-verdict for the batch-1 gate ──
const ran = results.filter((r) => !r.stopped);
const flipped = ran.filter((r) => r.valid);
const improved = ran.filter((r) => !r.valid && (r.before || []).length > (r.after || []).length);
const engaged = ran.filter((r) => (r.sf?.judgeCalls || 0) > 0 || (r.sf?.factsForced || 0) > 0);
const costOk = measuredTotal <= 2 * restated;
const noBreaker = !results.some((r) => r.breakerTripped);
console.log(`\n=== CLEAN-VERDICT === ran=${ran.length} flipped=${flipped.length} improved=${improved.length} nomination-engaged=${engaged.length} costOk=${costOk} noBreaker=${noBreaker}`);
const summary = results.map((r) => ({ key: r.key, cohort: r.cohort, cost: r.cost, valid: r.valid, released: r.released, before: r.before, after: r.after, factsForced: r.sf?.factsForced, gapsForced: r.sf?.gapsForced, judgeCalls: r.sf?.judgeCalls, relabels: r.sf?.relabelCandidates, audit: r.sf?.audit, stopped: r.stopped, breakerTripped: r.breakerTripped }));
console.log(`RESULTS_JSON ` + JSON.stringify(summary));
process.exit(0);
