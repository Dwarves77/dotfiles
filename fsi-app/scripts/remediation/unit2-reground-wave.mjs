#!/usr/bin/env node
// unit2-reground-wave.mjs — ADR-016 UNIT 2. Re-ground items whose stored captures are now fuller (drain + UNIT 1
// recaptures) so grounding reads the FULL text -> more FACTs, fewer GAPs. STORED-POOL ONLY per item:
// generateBriefFromStored (re-synthesise from the saved pool, $0 fetch) then groundBrief (re-extract the ledger
// from the fuller pool — grounds from the stored pool when present, never re-fetches). Existing gates bind
// (acquire lock armed for this run, mint gates, floors, non-destructive applyLedgerDiff + dominance guard).
// HARDENED: per-item try/catch (a transient Sonnet parse error records + continues, never crashes the run) and a
// finally{} that ALWAYS disarms GROUNDING_ACQUIRE_ENABLED. $10 ceiling measured from a FIXED pre-UNIT-2 baseline
// so the total holds across restarts. Flagship order. Run: --dry-run (default) | --execute [--limit=N] [--only=p]
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js"; import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? a.slice(7) : null; })();
const BASE = 144.2353;   // FIXED pre-UNIT-2 all-time agent_runs cost; the $10 ceiling is measured from here across restarts
const CEILING = 10.0;    // total UNIT-2 grounding spend cap (operator hard ceiling)
const CALLER = "unit3-remediation";
// SKIP: 3 oversized-primary (>560K synth ceiling — walled, flagged) + 55f90df0 (done in the verified prove-on-one)
const SKIP = new Set(["bec305e1", "e2e03e1b", "5b2c6655", "55f90df0"]);
const ENVPATH = resolve(ROOT, ".env.local");
const disarm = () => { try { writeFileSync(ENVPATH, readFileSync(ENVPATH, "utf8").replace(/^GROUNDING_ACQUIRE_ENABLED=.*$/m, "GROUNDING_ACQUIRE_ENABLED=0")); return "disarmed"; } catch (e) { return `DISARM FAILED: ${e.message}`; } };

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefFromStored, groundBrief } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const drain = JSON.parse(readFileSync(resolve(ROOT, "scripts/tmp/drain-artifact.json"), "utf8"));
const wave = [...new Set((drain.out || []).filter((r) => r.reground_recommended).map((r) => r.item_id))];
const u1 = JSON.parse(readFileSync(resolve(ROOT, "scripts/tmp/unit1-recapture-execute.json"), "utf8")).results.filter((r) => r.accepted).map((r) => r.item_id);
const u1b = JSON.parse(readFileSync(resolve(ROOT, "scripts/tmp/unit1b-recapture-execute.json"), "utf8")).results.filter((r) => r.outcome === "REPLACED").map((r) => r.item_id);
const union = [...new Set([...wave, ...u1, ...u1b])].filter((id) => ![...SKIP].some((p) => id.startsWith(p)));
const FLAGSHIP = ["f0833999", "efdb3390", "93c344a1"]; // CSRD, PPWR, ClassNK(other); 55f90df0 done
const eurlexItems = new Set((drain.out || []).filter((r) => r.reground_recommended && /eur-lex\.europa\.eu/i.test(r.result_url)).map((r) => r.item_id));
const rank = (id) => { const fi = FLAGSHIP.findIndex((p) => id.startsWith(p)); if (fi >= 0) return fi; if (eurlexItems.has(id)) return 100; return 200; };
let ordered = union.sort((a, b) => rank(a) - rank(b));
if (ONLY) ordered = ordered.filter((id) => id.startsWith(ONLY));
ordered = ordered.slice(0, LIMIT === Infinity ? ordered.length : LIMIT);

async function claimCounts(itemId) {
  const { data } = await sb.from("section_claim_provenance").select("claim_kind").eq("intelligence_item_id", itemId);
  const c = { FACT: 0, GAP: 0, other: 0 };
  for (const r of data || []) { if (r.claim_kind === "FACT") c.FACT++; else if (r.claim_kind === "GAP") c.GAP++; else c.other++; }
  return c;
}
async function spentTotal() { let from = 0, sum = 0; for (;;) { const { data, error } = await sb.from("agent_runs").select("cost_usd_estimated").range(from, from + 999); if (error || !data?.length) break; sum += data.reduce((s, r) => s + Number(r.cost_usd_estimated || 0), 0); if (data.length < 1000) break; from += 1000; } return sum; }
async function meta(itemId) { const { data } = await sb.from("intelligence_items").select("legacy_id, title, item_type, provenance_status").eq("id", itemId).single(); return data || {}; }

async function main() {
  console.log(`\n===== UNIT 2 reground wave (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) — ${ordered.length} items, $${CEILING} total ceiling from BASE $${BASE} =====`);
  const startSpent = (await spentTotal()) - BASE;
  console.log(`UNIT-2 spend so far (prove items + crash): $${startSpent.toFixed(4)} | remaining to ceiling: $${(CEILING - startSpent).toFixed(4)}\n`);
  const results = []; let ran = 0, halted = false, errored = 0;
  for (const itemId of ordered) {
    const m = await meta(itemId);
    const before = await claimCounts(itemId);
    const row = { item_id: itemId, legacy_id: m.legacy_id, title: (m.title || "").slice(0, 60), item_type: m.item_type, prov_before: m.provenance_status, fact_before: before.FACT, gap_before: before.GAP };
    if (!EXECUTE) { console.log(`  ${(m.legacy_id || itemId.slice(0, 8)).padEnd(10)} FACT ${before.FACT} GAP ${before.GAP} prov=${m.provenance_status} | ${row.title}`); results.push(row); continue; }
    try {
      const synth = await generateBriefFromStored(itemId);
      const g = await groundBrief(itemId, CALLER);
      const after = await claimCounts(itemId);
      const m2 = await meta(itemId);
      Object.assign(row, { synth: synth.ok ? "ok" : (synth.detail || "").slice(0, 60), ground: g.ok ? "ok" : (g.detail || "").slice(0, 90), fact_after: after.FACT, gap_after: after.GAP, prov_after: m2.provenance_status, fact_delta: after.FACT - before.FACT, gap_delta: after.GAP - before.GAP, demoted: m.provenance_status === "verified" && m2.provenance_status !== "verified" });
    } catch (e) {
      errored++; Object.assign(row, { synth: "ERROR", ground: "ERROR", error: String(e?.message || e).slice(0, 120), fact_after: before.FACT, gap_after: before.GAP });
    }
    ran++;
    const spent = (await spentTotal()) - BASE; row.cum_spend = Number(spent.toFixed(4));
    console.log(`  [${String(ran).padStart(2)}] ${(m.legacy_id || itemId.slice(0, 8)).padEnd(10)} FACT ${before.FACT}->${row.fact_after} GAP ${before.GAP}->${row.gap_after} | ${row.error ? "ERROR:" + row.error.slice(0, 40) : "ground:" + (row.ground === "ok" ? "ok" : "HELD")}${row.demoted ? " *DEMOTED*" : ""} | $${spent.toFixed(3)} | ${row.title}`);
    results.push(row);
    if (spent >= CEILING) { halted = true; console.log(`\n  *** HARD-HALT: UNIT-2 total spend $${spent.toFixed(3)} >= $${CEILING} ceiling. Stopping. ***`); break; }
  }
  const file = resolve(ROOT, `scripts/tmp/unit2-reground-${EXECUTE ? "execute" : "dryrun"}.json`);
  writeFileSync(file, JSON.stringify({ mode: EXECUTE ? "execute" : "dryrun", ran, errored, halted, ceiling: CEILING, base: BASE, results }, null, 2));
  if (EXECUTE) { const spent = (await spentTotal()) - BASE; console.log(`\n  ran ${ran} | errors ${errored} | ${halted ? "HALTED at ceiling" : "completed"} | UNIT-2 total spend $${spent.toFixed(3)}`); }
  console.log(`  artifact -> ${file}`);
}

try { await main(); }
finally { if (EXECUTE) console.log(`  ${disarm()} GROUNDING_ACQUIRE_ENABLED (finally — always runs)`); }
process.exit(0);
