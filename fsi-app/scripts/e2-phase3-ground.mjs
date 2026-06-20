/** E2 PHASE 3 — ground the 57 confirmed KEEP-GROUND survivors (stored-pool-reuse aware).
 *
 *  Each item already passed the read-only triage screen (not a corpus duplicate · real document source ·
 *  on-vertical). 56/57 carry a STORED real pool (agent_run_searches generate-pool rows >200ch) persisted
 *  by an earlier generate — so grounding REUSES that pool (groundBrief reads it first; ~0 Browserless) and
 *  needs ~1 Sonnet call to build the claim ledger. 1 item (646dda2d) is zero-ledger → one fresh fetch.
 *
 *  PER-ITEM PATH (chosen from stored state, no network in dry-run):
 *    GROUND-ONLY   has full_brief + sections + real pool   -> groundBrief            (pool-reuse, 1 Sonnet)
 *    FROM-STORED   has real pool, missing brief/sections    -> generateBriefFromStored -> section -> ground
 *                                                              (pool-reuse synth, 0 Browserless, ~2 Sonnet)
 *    FRESH         no usable pool                            -> generateBrief -> section -> ground
 *                                                              (fresh fetch, ~7 Browserless + ~2 Sonnet)
 *
 *  HONEST OUTCOMES (env-policy Integrity Rule; never force a verified badge):
 *    - grounds against adequate sources            -> verified
 *    - facts secondary-only on a FLOORED type      -> stays quarantined; routed to 1A-relabel residue
 *    - market_signal / regional_data / initiative  -> floor-EXEMPT: grounded as conditional signals with
 *                                                     attributed sources (not held to a primary floor)
 *    - cannot ground                               -> stays quarantined; honest archive / counsel hold
 *  A still-quarantined item is LEFT intact with its residual failure reasons reported — never erased here.
 *
 *  The 2 below-floor REGS are NOT handled here — they run the proven reg path on the live lane:
 *    node scripts/phase2-reground.mjs        --only=india-...,japan-... --apply   (re-source vs primary)
 *    node scripts/phase2-analysis-relabel.mjs --only=india-...,japan-... --apply  (1A-relabel residue;
 *      slot-bound [effective_date]/[primary_deadline]/[jurisdictional_scope]/[penalty_summary] facts are
 *      excluded by construction and stay quarantined -> counsel hold, never relabeled).
 *
 *  GOVERNING: remediation-discipline (RD-4 research-or-erase) + analysis-construction-spec + env-policy.
 *  Browserless + Anthropic are BLOCKED in the sandbox; --apply runs on the network-stable lane (Edits A+B
 *  make it resumable — a mid-batch death re-grounds from the stored pool, never re-scrapes prior items).
 *  DRY-RUN default (read-only path+cost plan); --apply [--limit=N] [--only=k1,k2] [--retries=N]. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, readAll } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null; })();
const RETRIES = (() => { const a = process.argv.find((x) => x.startsWith("--retries=")); return a ? parseInt(a.slice(10), 10) : 1; })();
// --regen-quarantined: the SECOND pass. The first (default) pass GROUND-ONLY re-grounds existing brief
// prose; items whose stored brief carries content-format defects (analysis_missing_label_syntax,
// unlabeled_assertion, missing_required_slot, ungrounded_url) cannot be rescued by re-grounding and stay
// quarantined. This flag forces those items to REGENERATE from the stored pool (FROM-STORED) under the
// current contract — which clears the label-syntax class (proven on 6f1e6615). It NEVER touches an
// already-verified item (target filter below), so a good brief can't be regressed.
const REGEN_QUARANTINED = process.argv.includes("--regen-quarantined");
const sb = readClient();

// The 57 confirmed KEEP-GROUND survivors (legacy_id or id-prefix), pinned from the read-only triage
// (scripts/_diag/_e2-triage.mjs). The 8 archives + 2 reclassify + 2 regs are handled on other paths.
const KEEP_KEYS = [
  "007f42b1","g27","0f70a032","319f785d","3373d06e","45006684","496340f0","4c81cebd","50ccd5cc","54b1082b",
  "5511a87f","t7","5fc45237","5fec12c6","605a2d06","sustainable-aviation-fuel-saf-production-pricing","646dda2d",
  "652b39e1","67434312","67c6e313","6f1e6615","solar-battery-energy-storage-for-warehouses","7227b685","74a54415",
  "77b2b073","r25","7d5bd5a1","r30","85a7a629","878294c8","l9","g30","r6",
  "uk-streamlined-energy-and-carbon-reporting-secr-amendment","9118aab6","924731b1","974550f4","a7d9bc29","ab362011",
  "eu-battery-regulation-2023-1542","b040b08c","g25","b3b32236","g16","c0eab829","r3","a1","d012bc20",
  "industrial-electricity-tariff-benchmarks-by-jurisdiction","db8577c6","de368414","de7f09fc","g28","e5c17fac",
  "f3510df3","f41fd969","fc7cdcd7",
];
const EST_SONNET = 0.05; // per Sonnet call (generate-brief.ts EST_GENERATE/GROUND ~$0.05-0.10)

const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status,full_brief", { match: (q) => q.eq("is_archived", false) });
const byKey = new Map(); for (const it of items) { byKey.set(it.legacy_id, it); byKey.set(it.id.slice(0, 8), it); }
const sections = await readAll("intelligence_item_sections", "item_id");
const secCount = new Map(); for (const s of sections) secCount.set(s.item_id, (secCount.get(s.item_id) || 0) + 1);
const searches = await readAll("agent_run_searches", "intelligence_item_id,result_content_excerpt");
const realPool = new Map(); for (const s of searches) if ((s.result_content_excerpt || "").length > 200) realPool.set(s.intelligence_item_id, (realPool.get(s.intelligence_item_id) || 0) + 1);

let targets = KEEP_KEYS.map((k) => byKey.get(k)).filter(Boolean);
if (ONLY) targets = targets.filter((it) => ONLY.includes(it.legacy_id) || ONLY.some((w) => it.id.startsWith(w)));
if (REGEN_QUARANTINED) targets = targets.filter((it) => it.provenance_status !== "verified"); // never regen a good brief
targets = targets.slice(0, LIMIT);

function pathFor(it) {
  const pool = realPool.get(it.id) || 0;
  const secs = secCount.get(it.id) || 0;
  if (!REGEN_QUARANTINED && pool > 0 && it.full_brief && secs > 0) return { path: "GROUND-ONLY", sonnet: 1, browserless: 0 };
  if (pool > 0) return { path: "FROM-STORED", sonnet: 2, browserless: 0 };
  return { path: "FRESH", sonnet: 2, browserless: 7 };
}

console.log(`\n===== E2 PHASE 3 — GROUND ${targets.length} KEEP-GROUND (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
const plan = targets.map((it) => ({ it, ...pathFor(it) }));
const byPath = {}; for (const p of plan) { byPath[p.path] = byPath[p.path] || { n: 0, sonnet: 0, bl: 0 }; byPath[p.path].n++; byPath[p.path].sonnet += p.sonnet; byPath[p.path].bl += p.browserless; }
let totSonnet = 0, totBL = 0;
for (const [name, d] of Object.entries(byPath)) { totSonnet += d.sonnet; totBL += d.bl; console.log(`  ${name.padEnd(12)} items=${String(d.n).padStart(3)}  Sonnet calls≈${d.sonnet}  Browserless≈${d.bl}`); }
console.log(`\nCOST QUOTE (×${RETRIES + 1} max attempts on stochastic ground): Sonnet ≈ ${totSonnet}-${totSonnet * (RETRIES + 1)} calls (~$${(totSonnet * EST_SONNET).toFixed(2)}-$${(totSonnet * (RETRIES + 1) * EST_SONNET).toFixed(2)}) | Browserless ≈ ${totBL} units`);
console.log(`(56 pool-reuse grounds → ~0 Browserless; 1 fresh fetch. Plus the 2 regs on the reg path: ~14 Browserless + ~4 Sonnet.)`);

if (!APPLY) {
  console.log(`\n── per-item plan (read-only) ──`);
  for (const p of plan) console.log(`  ${(p.it.legacy_id || p.it.id.slice(0, 8)).padEnd(48)} ${p.it.item_type.padEnd(15)} ${String(p.it.priority).padEnd(8)} ${p.path}`);
  console.log(`\nDRY-RUN — wrote nothing. Fire on the network-stable lane: node scripts/e2-phase3-ground.mjs --apply`);
  process.exit(0);
}

// ── APPLY (live lane only) ───────────────────────────────────────────────────────────────────────────
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBrief, generateBriefFromStored, sectionBrief, groundBrief } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const prov = async (id) => (await sb.from("intelligence_items").select("provenance_status").eq("id", id).single()).data?.provenance_status;

async function run(it, plan) {
  for (let i = 0; i <= RETRIES; i++) {
    if (plan.path === "GROUND-ONLY") {
      await groundBrief(it.id);
    } else if (plan.path === "FROM-STORED") {
      const g = await generateBriefFromStored(it.id); if (!g.ok) { if (i < RETRIES) continue; return { ok: false, why: g.detail }; }
      const s = await sectionBrief(it.id); if (!s.ok) { if (i < RETRIES) continue; return { ok: false, why: s.detail }; }
      await groundBrief(it.id);
    } else {
      const g = await generateBrief(it.id); if (!g.ok) { if (i < RETRIES) continue; return { ok: false, why: g.detail }; }
      const s = await sectionBrief(it.id); if (!s.ok) { if (i < RETRIES) continue; return { ok: false, why: s.detail }; }
      await groundBrief(it.id);
    }
    if ((await prov(it.id)) === "verified") return { ok: true };
  }
  return { ok: false, why: "still-quarantined after attempts" };
}

const summary = { verified: [], stillQ: [], error: [] };
const residual = {};
for (const p of plan) {
  const key = p.it.legacy_id || p.it.id.slice(0, 8);
  try {
    const r = await run(p.it, p);
    if (r.ok) { summary.verified.push(key); console.log(`  ${key.padEnd(48)} VERIFIED (${p.path})`); continue; }
    summary.stillQ.push(key);
    const { data } = await sb.rpc("validate_item_provenance", { p_item_id: p.it.id });
    const row = Array.isArray(data) ? data[0] : data;
    for (const f of (row?.failures || [])) residual[f.reason] = (residual[f.reason] || 0) + 1;
    console.log(`  ${key.padEnd(48)} still-quarantined (${p.path}) — ${r.why}`);
  } catch (e) {
    // FATAL (out-of-credits / auth / bad-request) is NOT a per-item failure — HALT the batch with the
    // actionable cause rather than mislabeling every remaining item as an error/still-quarantined.
    if (e?.fatal || /^ANTHROPIC_(OUT_OF_CREDITS|FATAL)/.test(e?.message || "")) {
      console.log(`\n⛔ HALTED (fatal, non-retryable): ${e.message}`);
      console.log(`   ${summary.verified.length} verified before halt; remaining items untouched and resumable after the cause is fixed (e.g. top up Anthropic credits).`);
      break;
    }
    summary.error.push(key); console.log(`  ${key.padEnd(48)} ERROR: ${e.message.slice(0, 80)}`);
  }
}
console.log(`\n=== PHASE 3 SPLIT (${plan.length}) ===`);
console.log(`VERIFIED: ${summary.verified.length} | still-quarantined (relabel/counsel/archive residue): ${summary.stillQ.length} | errors: ${summary.error.length}`);
console.log(`residual failure reasons:`, JSON.stringify(residual));
console.log(`\nNEXT (honest disposition of the still-quarantined residue): below-floor-FACT -> 1A-relabel; missing-slot on reg -> counsel hold; ungroundable -> honest archive. Then re-run claims-tier / substrate / quarantine-disposition audits.`);
process.exit(0);
