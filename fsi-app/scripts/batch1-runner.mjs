/** BATCH-1 RUNNER (PAID, one-time) — the hold-lift re-collection of the RETRIEVAL-class items (RD-14 +
 *  Earth-Exhaustion + the flip projection). For each non-verified, non-archived, RETRIEVAL-flippable item
 *  (fix = a NEW/better source), it: seek-more generateCandidates(instrument identity) → escalateFetch the
 *  candidate URL[] through the LIVE ladder (Browserless available) → on the first content success
 *  captureForStorage (write-side gate; error bodies NEVER stored) → PERSIST the per-item EXHAUSTION RECORD
 *  (the flag pattern) → write the captured source into the item's pool → RE-GROUND (groundBrief over the
 *  updated pool) → classify FLIPPED / HELD / NO_REACHABLE_SOURCE.
 *
 *  REUSE (reuse-before-construction): this is a THIN orchestrator. It is NOT an extension of funded-pass
 *  (that runner is ground-only — it deletes BROWSERLESS_API_KEY and refuses to fetch). It reuses funded-pass's
 *  spend scaffolding verbatim (seed program total, the 4 stop-layers, ticket/ledger discipline, DRY-RUN
 *  default), the built fetch front-half (seek-more.mjs + transport-escalation.mjs + the live transports from
 *  canonical-pipeline.buildLiveTransports), and the built ground back-half (groundBrief). The candidate→fetch→
 *  classify DECISION logic is the pure batch1-orchestrate.mjs (fixture-tested).
 *
 *  FOUR STACKED STOP-LAYERS (identical to funded-pass): (1) per-item $3 breaker, (2) $80 soft-cap batch gate,
 *  (3) 2x-measured, (4) cohort-fail (COHORT_WINDOW consecutive holds with 0 flips). Program total seeds the
 *  ceiling so history counts.
 *
 *  SCRAPE HOLD: the runner FETCHES, so --execute REQUIRES the hold LIFTED. It ASSERTS at start; if engaged it
 *  STOPS-AND-REPORTS (the main session lifts SCRAPE_HOLD=off before the live run). ZERO MINTS — it only writes
 *  agent_run_searches (pool) + integrity_flags (exhaustion). Any op that would mint an intelligence_items row
 *  is a hard STOP. Guarded writes (byte-compare read-back via db.mjs guardedInsert).
 *
 *  DRY-RUN default: selects the batch, prints the per-item plan (deterministic candidate URLs — ZERO fetch,
 *  ZERO spend) + the envelope estimate, exits. --execute = the live paid run. --keys=a,b,c overrides the
 *  auto-selected batch. GOVERNING: remediation-discipline (RD-14), source-credibility-model, analysis-
 *  construction-spec. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { createJiti } from "jiti";
import { readClient, readAll, guardedInsert } from "./lib/db.mjs";
import { generateCandidates, runSeekMore, exhaustionFlagRow } from "../src/lib/sources/seek-more.mjs";
import { holdEngaged } from "../src/lib/sources/fetch-hold.mjs";
import { selectBatchClass, processItem, estimateItemEnvelope } from "./lib/batch1-orchestrate.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env optional in CI/dry contexts */ }

const EXECUTE = process.argv.includes("--execute");
const keysArg = (process.argv.find((a) => a.startsWith("--keys=")) || "").slice("--keys=".length);
const KEYS_OVERRIDE = keysArg ? keysArg.split(",").map((k) => k.trim()).filter(Boolean) : null;
const COHORT_WINDOW = 8; // cohort-fail stop: this many consecutive HELD/NRS with 0 flips → stop
const K = 3;             // Haiku judge samples per slot (matches funded-pass)
const CITE = { skill: "remediation-discipline", reason: "batch-1 hold-lift re-collection (RD-14): persist re-collected source into pool + exhaustion record" };

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { groundBrief, buildLiveTransports, webSearchCandidatesForQuery } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const { setSpendTicket, resetSpendTicket, spentUsd, logSpendRun, assertLedgerDrained } = await jiti.import("../src/lib/llm/spend-client.ts");
const { seedSpend, resetItemLedger, takeItemLedger, itemBreakerTripped } = await jiti.import("../src/lib/llm/spend-guard.mjs");
const { readProgramTotalPaginated, fitsUnderCeiling, projectBatchFitsBuffer, CEILING_BUFFER_USD } = await jiti.import("../src/lib/llm/program-total.mjs");
const { costUsdForModel, SPEND_CEILING_USD, PRIMARY_MAX_CHARS } = await jiti.import("../src/lib/agent/generation-config.ts");

const sb = readClient();
const validate = async (id) => { const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id }); const r = Array.isArray(data) ? data[0] : data; return { valid: !!r?.valid, reasons: [...new Set((r?.failures || []).map((f) => f.reason))] }; };
const jurisdictionOf = (row) => (Array.isArray(row.jurisdiction_iso) && row.jurisdiction_iso[0]) || (Array.isArray(row.jurisdictions) && row.jurisdictions[0]) || "";
const identityOf = (row) => ({ title: row.title, identifier: row.instrument_identifier, jurisdiction: jurisdictionOf(row), sourceUrl: row.source_url });

// ── SELECT THE BATCH ─────────────────────────────────────────────────────────────────────────────────────────
const cols = "id,legacy_id,title,item_type,priority,source_url,provenance_status,instrument_identifier,jurisdictions,jurisdiction_iso,is_archived";
const rows = await readAll("intelligence_items", cols, { match: (q) => q.eq("is_archived", false) });
const keyOf = (r) => r.legacy_id || r.id.slice(0, 8);

let batch;
if (KEYS_OVERRIDE) {
  batch = KEYS_OVERRIDE.map((k) => rows.find((r) => r.legacy_id === k || r.id.slice(0, 8) === k || r.id === k)).filter(Boolean);
  console.log(`\n=== BATCH (--keys override) === ${batch.length} of ${KEYS_OVERRIDE.length} requested keys resolved`);
} else {
  // Retrieval-flippable = non-verified, non-archived, selectBatchClass()==="retrieval" (excludes the STRUCTURAL
  // hold set: below-floor on a non-reg floored type, or relabel-only). Mirrors _batch1-flip-projection.mjs.
  const nonVerified = rows.filter((r) => r.provenance_status !== "verified");
  batch = [];
  for (const r of nonVerified) {
    const { valid, reasons } = await validate(r.id);
    if (valid) continue;
    if (selectBatchClass({ reasons, itemType: r.item_type }) === "retrieval") batch.push({ ...r, _reasons: reasons });
  }
  console.log(`\n=== BATCH (auto: retrieval-flippable) === ${batch.length} items (from ${nonVerified.length} non-verified, ${rows.length} live)`);
}
if (!batch.length) { console.log("No items in batch — nothing to do."); process.exit(0); }

// ── SEED the program total (paginated) — the ceiling accounts for prior spend ───────────────────────────────
const fetchPage = async (offset, ps) => (await sb.from("agent_runs").select("cost_usd_estimated").order("id").range(offset, offset + ps - 1)).data || [];
const program = await readProgramTotalPaginated(fetchPage, 1000);
seedSpend(program.total);
console.log(`\n=== SEED === program total ($, ${program.rows} rows): $${program.total.toFixed(4)} | ceiling $${SPEND_CEILING_USD} | headroom $${(SPEND_CEILING_USD - program.total).toFixed(2)} | soft-cap $${SPEND_CEILING_USD - CEILING_BUFFER_USD}`);

// ── PER-ITEM PLAN + ENVELOPE (deterministic candidate generation — ZERO fetch, ZERO spend) ──────────────────
const REQ_SLOTS = (await sb.from("item_type_required_slots").select("item_type, slot_key")).data || [];
const slotsFor = (t) => REQ_SLOTS.filter((r) => r.item_type === t).length;
let envUsd = 0, envUnits = 0; const plan = [];
for (const r of batch) {
  const identity = identityOf(r);
  // Deterministic candidates ONLY (no webSearch dep) — pure, no network. Tells us whether the paid open-web
  // fallback would fire (searchUsd) and previews the candidate URLs in the plan.
  const detCandidates = await generateCandidates(identity, {});
  const pool = (await sb.from("agent_run_searches").select("result_content_excerpt").eq("intelligence_item_id", r.id)).data || [];
  const poolChars = pool.reduce((a, x) => a + (x.result_content_excerpt || "").length, 0);
  const nSlots = slotsFor(r.item_type);
  const env = estimateItemEnvelope({ poolChars, nSlots, hasDeterministicCandidate: detCandidates.length > 0 }, { K, costUsdForModel });
  envUsd += env.usd; envUnits += env.browserlessUnits;
  plan.push({ key: keyOf(r), id: r.id, type: r.item_type, priority: r.priority, identity, detCandidates, poolChars, nSlots, env, reasons: r._reasons || [] });
}
const envAvg = envUsd / (plan.length || 1);
console.log(`\n=== PER-ITEM PLAN (${plan.length} items) ===`);
for (const p of plan) {
  console.log(`  ${p.key.padEnd(14)} ${String(p.type).padEnd(14)} ${String(p.priority || "").padEnd(8)} pool≈${(p.poolChars / 1000).toFixed(0)}KB slots=${p.nSlots} det-cand=${p.detCandidates.length} est $${p.env.usd.toFixed(4)}${p.env.searchUsd > 0 ? " (+search)" : ""}`);
  if (p.detCandidates.length) console.log(`       → ${p.detCandidates.slice(0, 3).join("  |  ")}`);
}
console.log(`\n=== ENVELOPE === ${plan.length} items | est spend $${envUsd.toFixed(4)} (avg $${envAvg.toFixed(4)}, 2x-stop $${(2 * envUsd).toFixed(4)}) | ~${envUnits} Browserless units`);

// ── BATCH GATE (stop-layer 2): does the batch project under the soft cap? ────────────────────────────────────
const batchGate = projectBatchFitsBuffer(program.total, envAvg, plan.length, SPEND_CEILING_USD);
console.log(`\n=== BATCH GATE === ${batchGate.reason}`);
if (!batchGate.ok) { console.log("STOP: batch projects into the buffer. Reduce the batch or top up the ceiling."); process.exit(0); }

if (!EXECUTE) {
  console.log(`\nDRY-RUN — ZERO fetch, ZERO spend. Pass --execute to run the paid batch (requires the scrape hold LIFTED).`);
  process.exit(0);
}

// ══ PAID RUN (--execute) ═════════════════════════════════════════════════════════════════════════════════════
// SCRAPE-HOLD ASSERTION (STOP-AND-REPORT): the runner fetches — refuse if the hold is engaged or the key is
// absent. The main session lifts SCRAPE_HOLD=off (and provides BROWSERLESS_API_KEY) before the live run.
if (holdEngaged()) { console.error("\nSTOP-AND-REPORT: the scrape hold is ENGAGED (SCRAPE_HOLD). Batch-1 fetches — it needs the hold LIFTED. Lift it (SCRAPE_HOLD=off) in the main session, then re-run with --execute."); process.exit(3); }
if (!process.env.BROWSERLESS_API_KEY) { console.error("\nSTOP-AND-REPORT: BROWSERLESS_API_KEY is not set — the live ladder cannot render. Set it in the main session, then re-run --execute."); process.exit(3); }

console.log(`\n=== PAID RUN (through the spend chokepoint; seeded ceiling $${SPEND_CEILING_USD}) ===`);
const liveTransports = buildLiveTransports(PRIMARY_MAX_CHARS);
// webSearch dep for the seek-more open-web fallback (routes through spendSearch → the chokepoint).
const webSearch = async (query) => { try { return await webSearchCandidatesForQuery(query); } catch { return []; } };

// GUARDED persisters (byte-compare read-back via db.mjs). ZERO-MINT: only agent_run_searches + integrity_flags.
const persistCaptured = async (itemId, captured) => {
  await guardedInsert("agent_run_searches", {
    intelligence_item_id: itemId, search_query: "batch1:recollected-primary", result_url: captured.url ?? null,
    result_title: "batch-1 re-collected source", result_index: 0, result_content_excerpt: captured.text,
    searched_at: new Date().toISOString(),
  }, { cite: CITE, select: "id" });
};
const persistExhaustion = async (itemId, record, verdict) => {
  await guardedInsert("integrity_flags", exhaustionFlagRow(itemId, record, verdict), { cite: CITE, select: "id" });
};

const results = [];
for (const p of plan) {
  resetItemLedger();
  const deps = {
    validate,
    setTicket: (item, before) => setSpendTicket({
      purpose: `batch-1 re-collection: ${p.key}`, itemId: p.id, failureClasses: before.reasons,
      necessity: { rehomableFacts: 0 }, disposition: null, junkPool: false,
      // provenanceStatus omitted — the batch structurally excludes verified items (the l1 necessity gate).
      budgetCapUsd: SPEND_CEILING_USD, authorizationRef: "batch-1",
    }),
    seekMore: (item) => runSeekMore(
      { id: item.id, title: p.identity.title, identifier: p.identity.identifier, jurisdiction: p.identity.jurisdiction, source_url: p.identity.sourceUrl },
      { webSearch, transports: liveTransports, persistExhaustion: null }, // persistExhaustion handled by processItem (guarded)
    ),
    persistCaptured,
    ground: (itemId) => groundBrief(itemId),
    persistExhaustion,
    itemCost: () => takeItemLedger().costUsd,
    breakerTripped: itemBreakerTripped,
  };

  // Pre-flight ceiling stop (stop-layer 1/3).
  const fit = fitsUnderCeiling(spentUsd(), p.env.usd, SPEND_CEILING_USD);
  if (!fit.ok) { console.log(`  ${p.key}: PRE-FLIGHT CEILING STOP — ${fit.reason}`); results.push({ key: p.key, stopped: "ceiling" }); break; }

  let r;
  try { r = await processItem({ id: p.id, key: p.key, itemType: p.type, priority: p.priority, ...p.identity }, deps); }
  catch (e) { console.log(`  ${p.key}: ERROR/CEILING — ${String(e.message).slice(0, 120)}`); results.push({ key: p.key, stopped: String(e.message).slice(0, 120) }); resetSpendTicket(); break; }
  resetSpendTicket();
  await logSpendRun(p.id, r.valid ? "success" : "error", p.identity.sourceUrl);
  results.push(r);
  const sf = r.slotForcing || {};
  console.log(`  ${p.key.padEnd(14)} ${String(r.outcome).padEnd(20)} $${(r.cost || 0).toFixed(4)} valid=${r.valid} attempts=${r.attempts ?? 0}${r.capturedUrl ? ` src=${String(r.capturedUrl).slice(0, 48)}` : ""}${sf.factsForced != null ? ` | +${sf.factsForced}F/+${sf.gapsForced || 0}G` : ""}`);

  // Stop-layers.
  if (r.breakerTripped) { console.log(`  STOP: per-item breaker tripped on ${p.key}.`); break; }
  const measured = spentUsd() - program.total;
  if (measured > 2 * envUsd) { console.log(`  STOP: measured $${measured.toFixed(4)} > 2x estimate $${(2 * envUsd).toFixed(4)}.`); break; }
  const ran = results.filter((x) => !x.stopped && x.outcome && x.outcome !== "ALREADY_VERIFIED");
  const tail = ran.slice(-COHORT_WINDOW);
  if (tail.length >= COHORT_WINDOW && tail.every((x) => x.outcome !== "FLIPPED")) {
    console.log(`  STOP: cohort-fail — last ${COHORT_WINDOW} items all HELD/NO_REACHABLE (0 flips); remaining ride to the next event.`); break;
  }
}
assertLedgerDrained();

// ── SUMMARY ──────────────────────────────────────────────────────────────────────────────────────────────────
const ran = results.filter((r) => r.outcome);
const tally = (o) => ran.filter((r) => r.outcome === o).length;
const measuredTotal = spentUsd() - program.total;
console.log(`\n=== DONE === ran=${ran.length} FLIPPED=${tally("FLIPPED")} HELD=${tally("HELD")} NO_REACHABLE=${tally("NO_REACHABLE_SOURCE")} skipped=${tally("ALREADY_VERIFIED")} | measured spend $${measuredTotal.toFixed(4)} | program now $${spentUsd().toFixed(4)}/$${SPEND_CEILING_USD}`);
const plansDir = resolve(ROOT, "scripts", "_plans");
mkdirSync(plansDir, { recursive: true });
const outFile = resolve(plansDir, `batch1-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(outFile, JSON.stringify({ meta: { at: new Date().toISOString(), measuredUsd: measuredTotal }, results }, null, 2));
console.log(`  results: ${outFile}`);
console.log(`RESULTS_JSON ` + JSON.stringify(ran.map((r) => ({ key: r.key, outcome: r.outcome, valid: r.valid, cost: r.cost, attempts: r.attempts, capturedUrl: r.capturedUrl }))));
process.exit(0);
