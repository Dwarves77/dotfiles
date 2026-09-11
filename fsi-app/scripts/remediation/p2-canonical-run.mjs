#!/usr/bin/env node
// P2 CANONICAL PUBLICATION RUN — priced-line metered generation through the REAL pipeline.
//
// SPEND: the operator-priced line is the SOLE dollar authority (RD-31/RD-32). Each item runs under a ticket
// carrying { operatorCostUsd, inventoryMiss }; the pipeline halts THAT item at the price. Proven end-to-end
// 2026-07-30: a deliberately tiny $0.01 line made the pipeline throw SPEND_PRICED_LINE_REACHED at $0.0865.
//
// MODULE IDENTITY (load-bearing): jiti keys its cache by SPECIFIER. Importing spend-client by absolute path
// yields a DIFFERENT instance — a separate `currentTicket` — than canonical-pipeline's "@/lib/llm/spend-client".
// That is why the first 32026R1030 run spent $0.6442 UNPRICED. Import by the SAME specifier or the ticket
// never reaches the pipeline.
//
// ACQUIRE: GROUNDING_ACQUIRE_ENABLED armed here under the operator's scoped grant and DISARMED IN `finally`.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import createJiti from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* pre-loaded */ }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const jiti = createJiti(fileURLToPath(import.meta.url), { interopDefault: true, esmResolve: true, alias: { "@": resolve(ROOT, "src") } });

const HALT_PROOF = process.argv.includes("--prove-halt");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);

// Operator-stated priced lines (2026-07-30). The machine NEVER sets these numbers.
const TIERS = {
  sonnet: { model: "claude-sonnet-4-6", operatorCostUsd: 1.25 },
  haiku: { model: "claude-haiku-4-5-20251001", operatorCostUsd: 0.50 },
};
const INVENTORY_MISS =
  "Checked holdings for this item: raw_fetches snapshots = 0, content-bearing agent_run_searches pool rows = 0, "
  + "prior intelligence_items for this CELEX = 0 (verified at mint, 2026-07-30). The specific miss is the enacted "
  + "OJ text of this instrument, never acquired for this item; no stored capture can satisfy Gate A for it.";

const BATCH = [
  { celex: "32026R1030", id: "cd1083c9-fd05-47f7-bfed-8354b70a31ac", tier: "sonnet" },
  { celex: "32026R0394", id: "0c9b2364-468e-48fe-8360-fc5338f24598", tier: "sonnet" },
  { celex: "32025R2083", id: "c509a0cd-263d-48fc-8d0b-160f786bdbb0", tier: "sonnet" },
  { celex: "32024R3214", id: "0b6537ea-1c85-41b9-81ed-1486fd72ea18", tier: "haiku" },
  { celex: "32025L0794", id: "6cdc920f-6110-412a-b4f8-7b6c7fabdda5", tier: "haiku" },
  { celex: "32025R0035", id: "5561231f-3e3d-4e6a-90a2-1f3f4baf2f1b", tier: "haiku" },
];

const { setSpendTicket } = await jiti.import("@/lib/llm/spend-client");
const guard = await jiti.import("@/lib/llm/spend-guard.mjs");
const acquire = await jiti.import(resolve(ROOT, "src/lib/sources/acquire-lock.mjs"));
const pipeline = await jiti.import(resolve(ROOT, "src/lib/agent/canonical-pipeline.ts"));

const results = [];
const ARMED_BEFORE = process.env.GROUNDING_ACQUIRE_ENABLED;
let exitCode = 0;
try {
  process.env.GROUNDING_ACQUIRE_ENABLED = "1";
  console.log(`ACQUIRE ARMED (operator grant, scoped to the P2 batch): acquireEnabled=${acquire.acquireEnabled(process.env)}`);
  const targets = ONLY ? BATCH.filter((b) => b.celex === ONLY) : BATCH;

  for (const t of targets) {
    const tier = TIERS[t.tier];
    // HALT_PROOF uses a deliberately tiny line to FORCE the refusal. A TEST of the mechanism, never a re-pricing.
    const line = { operatorCostUsd: HALT_PROOF ? 0.01 : tier.operatorCostUsd, inventoryMiss: INVENTORY_MISS };
    guard.__resetSpendForTest?.();
    setSpendTicket({ purpose: `p2-canonical:${t.celex}`, itemId: t.id, pricedLine: line });
    console.log(`\n=== ${t.celex} (${t.tier}, priced line $${line.operatorCostUsd.toFixed(2)}) ===`);

    try {
      const pre = await sb.from("intelligence_items").select("full_brief").eq("id", t.id).single();
      const hasBrief = (pre.data?.full_brief || "").length > 500;
      if (!hasBrief) {
        const gen = await pipeline.generateBrief(t.id, "p2-canonical-batch");
        console.log(`  generate: ok=${gen.ok} ${String(gen.detail).slice(0, 140)}`);
        if (!gen.ok) { results.push({ celex: t.celex, tier: t.tier, stage: "generate", err: String(gen.detail).slice(0, 130) }); continue; }
      } else console.log(`  generate: SKIPPED (brief already present, ${(pre.data.full_brief || "").length}ch)`);

      const sec = await pipeline.sectionBrief(t.id);
      console.log(`  section: ok=${sec.ok} ${String(sec.detail).slice(0, 110)}`);
      // TIER NOTE: generation is Sonnet-fixed in the pipeline; only the GROUNDING model is overridable, so the
      // Haiku tier is measured on the GROUNDING half. Reported as such, never as a whole-brief Haiku cost.
      const gr = await pipeline.groundBrief(t.id, "p2-canonical-batch", t.tier === "haiku" ? { model: TIERS.haiku.model } : undefined);
      console.log(`  ground: ok=${gr.ok} ${String(gr.detail).slice(0, 150)}`);
    } catch (e) {
      console.log(`  HALTED: ${String(e.message).slice(0, 170)}`);
      results.push({ celex: t.celex, tier: t.tier, stage: "halted", err: String(e.message).slice(0, 130) });
      continue;
    }

    const { data: row } = await sb.from("intelligence_items").select("provenance_status,full_brief").eq("id", t.id).single();
    const { data: ga } = await sb.from("item_gate_a_state").select("orphan_count").eq("intelligence_item_id", t.id).maybeSingle();
    const { data: cost } = await sb.from("agent_runs").select("cost_usd_estimated").eq("intelligence_item_id", t.id);
    const spent = (cost || []).reduce((a, r) => a + Number(r.cost_usd_estimated || 0), 0);
    const { data: claims } = await sb.from("section_claim_provenance").select("id").eq("intelligence_item_id", t.id);
    console.log(`  => status=${row?.provenance_status} brief=${(row?.full_brief || "").length}ch orphans=${ga?.orphan_count ?? "n/a"} claims=${(claims || []).length} cost=$${spent.toFixed(4)}`);
    results.push({ celex: t.celex, tier: t.tier, id: t.id, status: row?.provenance_status,
      briefLen: (row?.full_brief || "").length, orphans: ga?.orphan_count ?? null, claims: (claims || []).length, costUsd: +spent.toFixed(4) });
  }
} catch (e) {
  console.error(`RUN ERROR: ${e.message}`);
  exitCode = 1;
} finally {
  if (ARMED_BEFORE === undefined) delete process.env.GROUNDING_ACQUIRE_ENABLED;
  else process.env.GROUNDING_ACQUIRE_ENABLED = ARMED_BEFORE;
  console.log(`\nACQUIRE DISARMED (finally): acquireEnabled=${acquire.acquireEnabled(process.env)}`);
  console.log(`\n===== BATCH RESULT =====`);
  console.log(JSON.stringify(results, null, 1));
  const tot = results.reduce((a, r) => a + (r.costUsd || 0), 0);
  console.log(`total measured: $${tot.toFixed(4)} | verified: ${results.filter((r) => r.status === "verified").length}/${results.length}`);
}
process.exit(exitCode);
