/** FUNDED-PASS RUNNER — the sanctioned machine-gated run (operator ruling 2026-07-14, FULL FLIGHT).
 *  Drives the F16-bound worklist (scripts/tmp/funded-pass-worklist.json) through the canonical pipeline:
 *    - RE-SYNTH: generateBriefFromStored (NO fetch) -> section -> ground -> grow  (model-only, held pool)
 *    - ACQUIRE : generateBrief (fresh fetch of the named delta primary) -> section -> ground -> grow
 *  ONE paid pass per item per mechanism; delta-only (RE-SYNTH never fetches); per-item anomaly halt (named
 *  wall -> HELD + continue; unnamed mechanism / gate bypass / unticketed row -> RUN-LEVEL HALT); spend-watch
 *  actuals from agent_runs; per-item DB read-back of provenance_status + validate_item_provenance.
 *
 *  The acquire lock is armed RUN-SCOPED (withArmedLock: set at start, DISARMED in finally AND on any halt).
 *  Signed caller = worklist.caller ("unit3-remediation") — F16 manifest-bound; passes the scrape hold.
 *
 *  DRY-RUN default (lock OFF, no pipeline call, no spend): prints per-item path/target/would-halt + hard
 *  divergences. --apply arms the lock and spends. Filters: --class=resynth|acquire  --only=pfx,..  --limit=N.
 *  Usage: node scripts/funded-pass.mjs [--apply] [--class=] [--only=] [--limit=N]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
import { classifyFailure, withArmedLock, hardDivergence, spendWatchHalt, isRunaway } from "./lib/funded-pass-core.mjs";
import { hasValidWaiver } from "../src/lib/agent/audit-gate-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const CLASS = (process.argv.find((a) => a.startsWith("--class=")) || "").slice(8) || null;
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null; })();
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
// The full generate->section->ground chain runs multiple long Sonnet streams (RE-SYNTH items genuinely take
// 4-6 min; ACQUIRE adds a fetch + web_search corroboration and is slower). The prior 300s cap fired mid-chain
// and, because JS can't cancel the underlying pipeline promise, the read-back RACED the still-running pipeline
// — recording false "timeout" HELDs on items that actually verified (RE-SYNTH settled 3 verified vs 1 logged).
// A generous cap makes the timeout a rare true-hang backstop, so the read-back reflects the settled state.
const ITEM_TIMEOUT_MS = 1_200_000;

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const wl = JSON.parse(readFileSync(resolve(ROOT, "scripts/tmp/funded-pass-worklist.json"), "utf8"));
const CALLER = wl.caller || "unit3-remediation";
let items = wl.worklist;
if (CLASS) items = items.filter((w) => w.cls === CLASS);
if (ONLY) items = items.filter((w) => ONLY.some((p) => w.id.startsWith(p) || w.key.startsWith(p)));
items = items.slice(0, LIMIT);

const nowIso = () => new Date().toISOString();
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`item timeout after ${ms}ms (${label})`)), ms))]);

async function readItem(id) {
  const { data } = await sb.from("intelligence_items").select("id, item_type, source_url, provenance_status").eq("id", id).single();
  return data ?? null;
}
async function itemLedger(id, sinceIso) {
  const { data } = await sb.from("agent_runs").select("cost_usd_estimated, intelligence_item_id, source_id").eq("intelligence_item_id", id).gte("started_at", sinceIso);
  return (data || []).map((r) => ({ cost: Number(r.cost_usd_estimated || 0), itemId: r.intelligence_item_id, sourceId: r.source_id }));
}
async function unattributedSince(sinceIso) {
  const { data } = await sb.from("agent_runs").select("cost_usd_estimated, intelligence_item_id, source_id").is("intelligence_item_id", null).gte("started_at", sinceIso);
  return (data || []).map((r) => ({ cost: Number(r.cost_usd_estimated || 0), itemId: r.intelligence_item_id, sourceId: r.source_id }));
}
async function validate(id) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id });
  const r = Array.isArray(data) ? data[0] : data;
  return r ?? null;
}

// ── one paid pass over an item (apply only) ──
async function runItem(w) {
  const itemStart = nowIso();
  const steps = {};
  const runPass = async () => {
    const gen = w.cls === "resynth" ? await P.generateBriefFromStored(w.id) : await P.generateBrief(w.id, CALLER);
    steps.generate = gen; if (!gen.ok) return { held: `generate: ${gen.detail}` };
    const sec = await P.sectionBrief(w.id);
    steps.section = sec; if (!sec.ok) return { held: `section: ${sec.detail}` };
    const gr = await P.groundBrief(w.id, CALLER);
    steps.ground = gr; if (!gr.ok) return { held: `ground: ${gr.detail}` };
    const grw = await P.growSources(w.id).catch((e) => ({ ok: false, detail: String(e?.message || e) }));
    steps.grow = grw; // non-gating
    return { held: null };
  };
  let held = null, halt = null;
  try {
    const r = await withTimeout(runPass(), ITEM_TIMEOUT_MS, w.key);
    held = r.held;
  } catch (e) {
    const cls = classifyFailure(e?.name || "Error", e?.message || String(e));
    if (cls === "run_halt") halt = `${e?.name || "Error"}: ${e?.message || e}`;
    else held = `${e?.name || "wall"}: ${String(e?.message || e).slice(0, 200)}`;
  }
  // read-back + spend-watch
  const row = await readItem(w.id);
  const ledger = await itemLedger(w.id, itemStart);
  const cost = ledger.reduce((a, r) => a + r.cost, 0);
  const unatt = await unattributedSince(itemStart);
  const swHalt = spendWatchHalt(unatt, w.id);
  if (swHalt) halt = halt || swHalt; // unticketed paid row -> run-level halt
  const val = await validate(w.id);
  const prov = row?.provenance_status ?? "unknown";
  // gate-bypass: verified WITHOUT the validator passing
  if (prov === "verified" && val && val.valid === false) halt = halt || `gate bypass: ${w.id} reads verified but validate_item_provenance.valid=false`;
  const runaway = isRunaway(cost);
  return { ...w, prov, cost: Number(cost.toFixed(4)), validValid: val?.valid ?? null, held, halt, runaway, steps: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, { ok: v.ok, detail: (v.detail || "").slice(0, 120) }])) };
}

// ── LAYER C block-gate (operator HALT 2026-07-14): the runner drives the pipeline functions DIRECTLY, so it
// does NOT pass through preflightStep's data-audit-block check. Honor the guard here so the runner can never
// STEP PAST a red lane — generation proceeds only on green (no open block) or a valid dated waiver. Fail-closed
// on read error. This closes the bypass the flight surfaced. Applies to APPLY (spend); dry-run reports it.
async function dataAuditBlockState() {
  const { data, error } = await sb.from("integrity_flags").select("id, description, recommended_actions")
    .eq("category", "data_integrity").eq("subject_ref", "data-audit-lane").eq("status", "open")
    .order("created_at", { ascending: false }).limit(1);
  if (error) return { block: { id: "READ_ERROR" }, waiver: false, readError: error.message }; // fail-closed
  const block = (data && data[0]) || null;
  return { block, waiver: block ? hasValidWaiver(block, new Date()) : true, readError: null };
}

// ── main ──
console.log(`\n=== FUNDED-PASS (${APPLY ? "APPLY — LOCK ARMED, SPEND" : "DRY-RUN — lock OFF, $0"}) === ${items.length} item(s), caller="${CALLER}"`);
{
  const st = await dataAuditBlockState();
  if (st.block && !st.waiver) {
    console.log(`\nLAYER C BLOCK: data-audit lane is RED with no valid dated waiver (integrity_flags ${st.block.id}${st.readError ? `; read error: ${st.readError}` : ""}). Runner REFUSES to proceed — fix to green or record a dated waiver (docs/data-audit-dispositions.md + recommended_actions). The flight does not step past the guard.`);
    process.exit(4);
  }
  console.log(`Layer C block-gate: ${st.block ? `open block ${st.block.id} carries a VALID dated waiver — proceeding` : "no open block (green)"}.`);
}
const results = [];
let runHalt = null;

async function dryRun() {
  for (const w of items) {
    const row = await readItem(w.id);
    const div = hardDivergence(w, row);
    const path = w.cls === "resynth" ? "generateBriefFromStored -> section -> ground -> grow (NO fetch)" : `generateBrief(fetch ${w.deltaUrl?.slice(0, 46)}) -> section -> ground -> grow`;
    console.log(`\n[${w.cls.toUpperCase()}] ${w.key.slice(0, 40)} (${w.id.slice(0, 8)}) type=${row?.item_type} prov=${row?.provenance_status}`);
    console.log(`  path: ${path}`);
    console.log(`  target: ${w.deltaUrl}`);
    if (div) console.log(`  ==> HARD DIVERGENCE -> HELD (run proceeds without it): ${div}`);
    else console.log(`  would-run: OK (valid quarantined target).`);
    results.push({ ...w, dryDivergence: div, dbProv: row?.provenance_status });
  }
  const held = results.filter((r) => r.dryDivergence).length;
  console.log(`\n=== DRY-RUN SUMMARY: ${results.length} items, ${held} hard-divergence -> would-HELD, ${results.length - held} would-run ===`);
}

async function applyRun() {
  await withArmedLock(process.env, async () => {
    for (const w of items) {
      const row = await readItem(w.id);
      const div = hardDivergence(w, row);
      if (div) { console.log(`\n[HELD:divergence] ${w.key} — ${div}`); results.push({ ...w, held: `divergence: ${div}`, prov: row?.provenance_status }); continue; }
      process.stdout.write(`\n[${w.cls}] ${w.key.slice(0, 36)} (${w.id.slice(0, 8)}) ... `);
      const r = await runItem(w);
      results.push(r);
      if (r.halt) { runHalt = r.halt; console.log(`RUN-LEVEL HALT: ${r.halt}`); break; }
      console.log(`prov=${r.prov} valid=${r.validValid} cost=$${r.cost}${r.held ? ` HELD(${r.held.slice(0, 80)})` : ""}${r.runaway ? " RUNAWAY" : ""}`);
    }
  });
  // withArmedLock disarms here (normal) AND on the break/throw path.
  const verified = results.filter((r) => r.prov === "verified").length;
  const heldN = results.filter((r) => r.held).length;
  const total = results.reduce((a, r) => a + (r.cost || 0), 0);
  console.log(`\n=== APPLY SUMMARY: ${results.length} processed | verified=${verified} | held=${heldN} | actuals=$${total.toFixed(4)} | lock disarmed=${process.env.GROUNDING_ACQUIRE_ENABLED !== "1"}${runHalt ? ` | RUN-HALTED: ${runHalt}` : ""} ===`);
}

if (APPLY) await applyRun(); else await dryRun();

// durable run-log
try {
  mkdirSync(resolve(ROOT, "scripts/tmp"), { recursive: true });
  const out = resolve(ROOT, `scripts/tmp/funded-pass-run-${APPLY ? "apply" : "dry"}.json`);
  writeFileSync(out, JSON.stringify({ mode: APPLY ? "apply" : "dry", at: nowIso(), caller: CALLER, runHalt, results }, null, 2));
  console.log(`run-log: ${out}`);
} catch (e) { console.warn(`run-log write failed: ${e.message}`); }

process.exit(runHalt ? 3 : 0);
