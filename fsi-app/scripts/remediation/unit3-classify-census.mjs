#!/usr/bin/env node
// unit3-classify-census.mjs — ADR-016 acceleration UNIT 3. METADATA-tier classification of the undispositioned
// census_worklist rows (relevance + surface routing) to produce the gap topline. Haiku on each row's METADATA
// (instrument_identifier, document_url, source name/category/jurisdiction) — no per-row fetch (that is the
// "$0.00254/row" METADATA-tier pass; content-grounding is the separate depth lane). Concurrent, cost-metered
// with a cumulative HARD-HALT at the classify sub-budget, per-row try/catch, resumable (skips already-disposed),
// logs each call to agent_runs so the program-total ledger (and the budgetCapUsd backstop) sees the spend.
// Run: --dry-run (default, no writes/no spend) | --execute [--limit=N] [--budget=USD]
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const BUDGET = (() => { const a = process.argv.find((x) => x.startsWith("--budget=")); return a ? parseFloat(a.slice(9)) : 34.0; })();
const CONC = 12;
const HAIKU = "claude-haiku-4-5-20251001";
const IN_RATE = 1 / 1e6, OUT_RATE = 5 / 1e6; // Haiku $1/$5 per Mtok
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const KEY = process.env.ANTHROPIC_API_KEY;

const SYS = `You are a freight-sustainability RELEVANCE + surface classifier. Given an instrument's METADATA only (identifier, URL, issuer, jurisdiction), return STRICT JSON: {"relevant":true|false,"entity_verdict":"specific_document|portal|uncertain","item_type":"regulation|directive|standard|guidance|framework|technology|innovation|tool|market_signal|initiative|research_finding|regional_data|null","surface_tags":[subset of regulations,operations,market_intel,research],"jurisdiction":"...","confidence":"HIGH|MEDIUM|LOW","rationale":"<=140 chars"}.
relevant=true iff the instrument plausibly bears on sustainability/environmental regulation, cost, market, research, or operations for international freight forwarding (broad: live events/art/film/luxury/auto/humanitarian + batteries/EV/energy/finance/labor/packaging). A navigational portal/index/homepage is entity_verdict=portal (relevant as a SOURCE, item_type=null). Only mark relevant=false when the instrument is clearly off-domain. surface_tags: assess all four independently, multi-tag expected; [] for portals/uncertain.`;

async function classify(row) {
  const user = `Instrument: ${row.instrument_identifier || "(none)"}\nURL: ${row.document_url}\nIssuer/source: ${row.source_name || "(unknown)"} (category ${row.source_category || "?"}, tier ${row.source_tier ?? "?"})\nJurisdiction hint: ${row.jurisdiction || "(unknown)"}\nExisting surface tags: ${(row.surface_tags || []).join(",") || "(none)"}\nClassify.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: HAIKU, max_tokens: 300, system: SYS, messages: [{ role: "user", content: user }] }), signal: AbortSignal.timeout(40000) });
  if (!r.ok) throw new Error(`haiku ${r.status}: ${(await r.text()).slice(0, 100)}`);
  const j = await r.json();
  const cost = (j.usage?.input_tokens || 0) * IN_RATE + (j.usage?.output_tokens || 0) * OUT_RATE;
  const txt = (j.content?.[0]?.text || "").match(/\{[\s\S]*\}/);
  let cls = null; try { cls = JSON.parse(txt[0]); } catch { /* malformed */ }
  return { cls, cost };
}

async function main() {
  // undispositioned rows joined to source metadata
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("census_worklist")
      .select("id, document_url, instrument_identifier, surface_tags, source_id, sources(name, category, base_tier)")
      .is("dryrun_disposition", null).order("id").range(from, from + 999);
    if (error) { console.error("read error:", error.message); break; }
    if (!data?.length) break;
    rows.push(...data.map((d) => ({ id: d.id, document_url: d.document_url, instrument_identifier: d.instrument_identifier, surface_tags: d.surface_tags, source_name: d.sources?.name, source_category: d.sources?.category, source_tier: d.sources?.base_tier, jurisdiction: null })));
    if (data.length < 1000) break;
  }
  rows = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);
  console.log(`\n===== UNIT 3 census classify (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) — ${rows.length} undispositioned rows, budget $${BUDGET} =====\n`);
  if (!EXECUTE) { console.log("dry-run: would classify", rows.length, "rows. Sample:", JSON.stringify(rows.slice(0, 2), null, 1)); return; }

  let spent = 0, done = 0, errs = 0, halted = false;
  const topline = { relevant: 0, not_relevant: 0, portal: 0, uncertain: 0, by_surface: {}, by_disposition: {} };
  const disp = (c) => !c ? "hold" : c.entity_verdict === "portal" ? "portal_source" : (c.relevant === false ? "not_an_item" : (c.entity_verdict === "specific_document" && c.confidence !== "LOW" ? "would_mint" : "hold"));
  // concurrent worker pool
  let idx = 0;
  async function worker() {
    while (idx < rows.length && !halted) {
      const row = rows[idx++];
      try {
        const { cls, cost } = await classify(row);
        spent += cost;
        await sb.from("agent_runs").insert({ intelligence_item_id: null, phase: "unit3-classify", cost_usd_estimated: Number(cost.toFixed(6)), ok: true, detail: `census classify ${row.id}` }).then(()=>{}, ()=>{});
        const d = disp(cls);
        const patch = { dryrun_disposition: d, surface_tags: cls?.surface_tags || row.surface_tags || [], notes: cls ? `unit3-metadata-classify: relevant=${cls.relevant} verdict=${cls.entity_verdict} type=${cls.item_type} conf=${cls.confidence} :: ${(cls.rationale||"").slice(0,120)}` : "unit3-classify: malformed output -> hold" };
        await sb.from("census_worklist").update(patch).eq("id", row.id);
        done++;
        topline.by_disposition[d] = (topline.by_disposition[d] || 0) + 1;
        if (cls?.entity_verdict === "portal") topline.portal++; else if (cls?.relevant === true) topline.relevant++; else if (cls?.relevant === false) topline.not_relevant++; else topline.uncertain++;
        for (const s of (cls?.surface_tags || [])) topline.by_surface[s] = (topline.by_surface[s] || 0) + 1;
        if (done % 50 === 0) console.log(`  ${done}/${rows.length} | $${spent.toFixed(3)} | rel ${topline.relevant} portal ${topline.portal} notrel ${topline.not_relevant}`);
      } catch (e) { errs++; if (errs <= 5) console.warn(`  err ${row.id}: ${String(e.message||e).slice(0,70)}`); }
      if (spent >= BUDGET) { halted = true; console.log(`\n  *** HARD-HALT: classify spend $${spent.toFixed(3)} >= $${BUDGET} budget ***`); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  const file = resolve(ROOT, "scripts/tmp/unit3-classify-result.json");
  writeFileSync(file, JSON.stringify({ classified: done, errors: errs, halted, spent: Number(spent.toFixed(4)), topline }, null, 2));
  console.log(`\n  classified ${done} | errors ${errs} | ${halted ? "HALTED" : "complete"} | spend $${spent.toFixed(3)}`);
  console.log(`  topline: ${JSON.stringify(topline)}`);
  console.log(`  artifact -> ${file}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
