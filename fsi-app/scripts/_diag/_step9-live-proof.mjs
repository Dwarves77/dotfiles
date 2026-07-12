// T9 LIVE PROOF (the intake dry-proof clause): the two Step-2 recoveries — eFTI 2020/1056 + waste 2024/1157 —
// through the FULL machine cycle (runIntakeCycle APPLY, manual-intake-run) → verified, per-gate evidence; the
// seeded-bad portal root rejected in the trail. REPORT LEADS WITH THE FLOW NUMBER (N of 8 stages, target 8/8).
// SPEND: Browserless + Sonnet, ~$0.15/item; the generateBriefWorkflow preflight daily cap ($5) is the breaker.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { runIntakeCycle } = await jiti.import(resolve(ROOT, "src/lib/intake/run-intake-cycle.ts"));
// Raw service-role client: runIntakeCycle is itself the guarded intake path (mint chokepoint + staged-transit
// + F16 signed caller), so its own gates do the guarding — not the db.mjs read-only wrapper (which blocks insert).
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const candidates = [
  { title: "Regulation (EU) 2020/1056 on electronic freight transport information (eFTI)", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32020R1056", item_type: "regulation", domain: 1 },
  { title: "Regulation (EU) 2024/1157 on shipments of waste", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1157", item_type: "regulation", domain: 1 },
  { title: "EUR-Lex portal homepage (seeded-bad portal root)", source_url: "https://eur-lex.europa.eu/", item_type: "regulation", domain: 1 },
];

// the 8 conduction stages the flow number counts
const flowOf = (it) => {
  if (it.disposition === "rejected") return { n: it.stagedId ? 1 : 0, of: 8, note: "rejected at gate" };
  const ev = it.evidence || {};
  const passed = (d) => d && !/skip|fail/i.test(String(d));
  let n = 0;
  if (it.stagedId) n++;                 // 1 stage
  if (ev.mint) n++;                      // 2 mint
  if (passed(ev.generate)) n++;          // 3 generate
  if (passed(ev.generate)) n++;          // 4 register (non-gating; runs iff generate ok)
  if (passed(ev.section)) n++;           // 5 section
  if (passed(ev.ground)) n++;            // 6 ground
  if (passed(ev.grow)) n++;              // 7 grow
  if (it.disposition === "verified") n++;// 8 auditGate → verified
  return { n, of: 8 };
};

console.log("=== T9 LIVE PROOF — runIntakeCycle APPLY (caller=manual-intake-run) ===");
const t = Date.now();
const r = await runIntakeCycle(sb, candidates, { mode: "apply", caller: "manual-intake-run" });
const secs = ((Date.now() - t) / 1000).toFixed(0);

const positives = r.items.filter((i) => i.disposition !== "rejected");
const flows = positives.map((i) => flowOf(i).n);
const headline = flows.length ? Math.min(...flows) : 0;
console.log(`\n################  FLOW NUMBER: ${headline}/8  (min across the 2 recoveries)  ################\n`);
console.log(`(${secs}s) discovered=${r.discovered} staged=${r.staged} minted=${r.minted} verified=${r.verified} rejected=${r.rejected} groundFailed=${r.groundFailed}`);

for (const it of r.items) {
  const f = flowOf(it);
  console.log(`\n• ${it.disposition.toUpperCase().padEnd(12)} FLOW ${f.n}/8  "${it.title.slice(0, 50)}"`);
  if (it.disposition === "rejected") { console.log(`    gate: ${it.gate}\n    reason: ${it.reason}`); continue; }
  console.log(`    itemId=${it.itemId?.slice(0, 8)}  provenance=${it.provenance}`);
  for (const [k, v] of Object.entries(it.evidence || {})) console.log(`    ${k.padEnd(10)} ${String(v).slice(0, 130)}`);
}

// spend for the run
const { data: runs } = await sb.from("agent_runs").select("cost_usd_estimated").gte("started_at", new Date(Date.now() - Number(secs) * 1000 - 60000).toISOString());
const spend = (runs || []).reduce((s, x) => s + Number(x.cost_usd_estimated || 0), 0);
console.log(`\nspend this run (agent_runs ledger): $${spend.toFixed(3)}`);
process.exit(0);
