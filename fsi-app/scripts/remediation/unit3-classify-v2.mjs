#!/usr/bin/env node
// unit3-classify-v2.mjs — ADR-016 fabrication remediation, FAIL-CLOSED census classifier.
// PERMANENT RUBRIC (operator ruling; codify in doctrine): the classifier may NEVER emit a relevance verdict from
// an identifier alone. A row without a REAL title returns unclassifiable_pending_enrichment (NO model call, $0).
// Any model output whose rationale carries assumption language ("likely", "assume", "without access", "unknown
// from", "unavailable", "metadata alone") is a REFUSAL, not a verdict -> held, never counted as relevant. This
// replaces the v1 pass that hallucinated freight topics from bare CELEX numbers (86% fabricated relevance).
// Reads titles from scripts/tmp/census-titles.json (unit3-enrich-titles.mjs). Run: --dry-run | --execute [--limit=N] [--budget=USD]
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assertMeteredCallAllowed } from "../../src/lib/llm/metered-gate.mjs"; // STANDING FINANCIAL LAW — the wall, now LIVE on this lane
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
// Operator hard cap (ruling 2026-07-26, acceleration): $100 program ceiling. Requested budget is CLAMPED to it — the
// runner can never exceed it. NOTE: cap is a CEILING, not a target — the full run's EXPECTED spend is ~$12-17
// (measured per-row from the audit gate); the --budget passed at run time is the real hard-halt, well under this.
const OPERATOR_CAP_USD = 100.0;
const BUDGET = (() => { const a = process.argv.find((x) => x.startsWith("--budget=")); const req = a ? parseFloat(a.slice(9)) : OPERATOR_CAP_USD; return Math.min(req, OPERATOR_CAP_USD); })();
const CONC = 12, HAIKU = "claude-haiku-4-5-20251001", IN_RATE = 1 / 1e6, OUT_RATE = 5 / 1e6;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const KEY = process.env.ANTHROPIC_API_KEY;
const TITLES = JSON.parse(readFileSync(resolve(ROOT, "scripts/tmp/census-titles.json"), "utf8"));
const ASSUMPTION = /\b(likely|assume[ds]?|presumably|without (?:full )?(?:text|access)|unknown from|unavailable|metadata alone|cannot (?:tell|determine)|insufficient|no title)\b/i;

const SYS = `You classify a specific legal instrument's freight-sustainability RELEVANCE + surfaces FROM ITS REAL TITLE. Return STRICT JSON:
{"relevant":true|false,"entity_verdict":"specific_document|portal","item_type":"regulation|directive|standard|guidance|framework|technology|innovation|tool|market_signal|initiative|research_finding|regional_data|null","surface_tags":[subset of regulations,operations,market_intel,research],"confidence":"HIGH|MEDIUM|LOW","rationale":"<=140 chars, MUST cite the concrete subject from the title"}.
HARD RULES: (1) You are given the REAL TITLE. Judge relevance ONLY from what the title actually says. (2) relevant=true ONLY when the title's SUBJECT genuinely bears on sustainability/environmental regulation, cost, market, research, or operations for international freight forwarding (broad: transport modes, emissions, energy, packaging, EPR, batteries/EV, labor/wage, finance/taxonomy, product/ecodesign, due-diligence/reporting). (3) relevant=false for off-domain subjects even inside a monitored register — e.g. protected food-name (PDO/PGI) registrations, medicines/EMA, animal/plant health, fisheries quotas, agricultural market orders, cultural/education. These are NOT freight-sustainability. (4) NEVER guess: your rationale must name the title's actual subject. If the title is genuinely uninformative, return relevant=false confidence=LOW.`;

async function classify(title, row) {
  const user = `TITLE: ${title}\nIdentifier: ${row.instrument_identifier || "(none)"}\nIssuer: ${row.source_name || "?"}\nClassify from the title's actual subject.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: HAIKU, max_tokens: 260, system: SYS, messages: [{ role: "user", content: user }] }), signal: AbortSignal.timeout(40000) });
  if (!r.ok) throw new Error(`haiku ${r.status}`);
  const j = await r.json();
  const cost = (j.usage?.input_tokens || 0) * IN_RATE + (j.usage?.output_tokens || 0) * OUT_RATE;
  const m = (j.content?.[0]?.text || "").match(/\{[\s\S]*\}/);
  let cls = null; try { cls = JSON.parse(m[0]); } catch { /**/ }
  return { cls, cost };
}
const titleFor = (row) => TITLES[row.instrument_identifier] || TITLES["UK:" + row.document_url] || null;

async function main() {
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("census_worklist").select("id, document_url, instrument_identifier, sources(name)").is("dryrun_disposition", null).order("id").range(from, from + 999);
    if (error || !data?.length) break; rows.push(...data.map((d) => ({ id: d.id, document_url: d.document_url, instrument_identifier: d.instrument_identifier, source_name: d.sources?.name }))); if (data.length < 1000) break;
  }
  const GATE = (() => { const a = process.argv.find((x) => x.startsWith("--gate=")); return a ? parseInt(a.slice(7), 10) : 0; })();
  // THE WALL (STANDING FINANCIAL LAW): any mode that makes an Anthropic call (--gate sample OR --execute) must pass
  // the metered-gate FIRST. Throws MeteredCallForbiddenError (exit 1, $0 spent) unless callClass=batch-classification,
  // model=Haiku-allowlist, METERED_BATCH_TOKEN present in env, and a positive cap. Dry-run (no --gate, no --execute)
  // makes zero calls and is exempt. This is the mechanical enforcement the operator required LIVE before any spend.
  if (GATE || EXECUTE) {
    assertMeteredCallAllowed({ callClass: "batch-classification", model: HAIKU, capUsd: BUDGET, env: process.env });
    console.log(`metered-gate PASS: batch-classification / ${HAIKU} / operator token present / hard cap $${BUDGET.toFixed(2)}\n`);
  }
  if (GATE) {
    // RANDOM sample of TITLED rows (lesson-8: sample the actual input distribution), classify, print for hand-verify, NO write
    const titled = rows.filter((r) => { const t = titleFor(r); return t && t.length >= 8; });
    for (let i = titled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [titled[i], titled[j]] = [titled[j], titled[i]]; }
    const sample = titled.slice(0, GATE);
    console.log(`\n===== FAIL-CLOSED re-gate — random ${sample.length} titled rows (of ${titled.length}) =====\n`);
    for (const r of sample) { const t = titleFor(r); try { const { cls } = await classify(t, r); const refuse = ASSUMPTION.test(cls?.rationale || ""); console.log(`[${cls?.relevant === true ? "REL " : cls?.relevant === false ? "NOT " : "??? "}${refuse ? "REFUSE" : "     "}] ${r.instrument_identifier || r.document_url?.slice(0, 30)} | ${t.slice(0, 68)}\n     -> ${(cls?.rationale || "").slice(0, 100)}`); } catch (e) { console.log(`  err ${r.id}: ${e.message}`); } }
    return;
  }
  rows = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);
  console.log(`\n===== UNIT 3 FAIL-CLOSED classify (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) — ${rows.length} undispositioned, budget $${BUDGET} =====`);
  console.log(`titles available: ${Object.keys(TITLES).length}\n`);
  // Cross-restart spend baseline (Unit-2 hardening lesson): the DB agent_runs ledger is the SoT for cumulative spend,
  // so the $BUDGET hard cap holds ACROSS chunked restarts, not per-invocation. Chunking survives the exit-127 teardown:
  // each chunk persists its rows before exiting, so no single termination costs more than one chunk's progress.
  // FAIL-CLOSED METERING (operator directive 2026-07-26): the LEDGER (agent_runs — the platform spend SoT that the MTD
  // tile + cost-meter halt read) is authoritative. Baseline = ledger sum for this acceleration; the per-call ledger
  // insert (below) MUST succeed before the run proceeds — a failed ledger write HALTS, because an unrecorded call is an
  // unmetered call and the wall's authority depends on a complete ledger. agent_runs has NO 'phase'/'ok'/'detail'
  // column (the old insert's silent-failure cause); we tag rows via source_url and set status to an allowed value.
  const LEDGER_TAG = "census-classify-v2";
  let baseline = 0;
  // PAGINATED baseline read — an unpaginated Supabase select caps at 1000 rows, silently undercounting a large ledger
  // and defeating the cross-restart cap (caught in the recoverable-holds sweep: baseline read $0.99 vs true $15.21).
  { const all = [];
    for (let f = 0; ; f += 1000) {
      const { data, error } = await sb.from("agent_runs").select("cost_usd_estimated").like("source_url", `${LEDGER_TAG}%`).range(f, f + 999);
      if (error) { console.error(`FATAL: cannot read ledger baseline — ${error.message}. Refusing to spend against an unknown baseline (fail-closed).`); process.exit(2); }
      if (!data?.length) break; all.push(...data); if (data.length < 1000) break;
    }
    baseline = all.reduce((a, r) => a + (Number(r.cost_usd_estimated) || 0), 0); }
  console.log(`ledger baseline (agent_runs source_url~${LEDGER_TAG}): $${baseline.toFixed(4)} | headroom to cap: $${(BUDGET - baseline).toFixed(2)}`);
  const SPENDFILE = resolve(ROOT, "scripts/tmp/unit3-v2-spend.json");
  if (baseline >= BUDGET) { console.log(`*** ALREADY AT/OVER CAP ($${baseline.toFixed(2)} >= $${BUDGET}) — nothing to spend, exiting ***`); return; }
  // DB-write helper: THROWS on rejection so a constraint failure is a LOUD, COUNTED error — never a silent no-op (the
  // exact bug that dropped ~87% of verdicts: the old unchecked .update() reported API success while the DB rejected).
  async function upd(id, patch) { const { error } = await sb.from("census_worklist").update(patch).eq("id", id); if (error) throw new Error(`DB update rejected (${error.code}): ${error.message}`); }
  let spent = 0, done = 0, pending = 0, refused = 0, errs = 0, halted = false, ledgerFail = null;
  const top = { relevant: 0, not_relevant: 0, portal: 0, pending: 0, refused: 0, by_surface: {} };
  let idx = 0;
  async function worker() {
    while (idx < rows.length && !halted) {
      const row = rows[idx++]; const title = titleFor(row);
      try {
        if (!title || title.length < 8) { // FAIL-CLOSED: no real title -> pending, NO model call
          if (EXECUTE) await upd(row.id, { dryrun_disposition: "hold", hold_reason: "unclassifiable_pending_enrichment", notes: "unit3-v2 fail-closed: no real title available; NOT classified from identifier alone" });
          pending++; top.pending++; continue;
        }
        const { cls, cost } = await classify(title, row); spent += cost;
        // FAIL-CLOSED LEDGER: durably record THIS call in agent_runs BEFORE proceeding. A failed ledger write HALTS the
        // whole run (an unrecorded call is an unmetered call). status must be an allowed value; tag via source_url.
        if (EXECUTE) {
          const { error: le } = await sb.from("agent_runs").insert({ cost_usd_estimated: Number(cost.toFixed(6)), status: "success", model: HAIKU, source_url: LEDGER_TAG });
          if (le) { halted = true; ledgerFail = `LEDGER WRITE FAILED — fail-closed HALT: ${le.message}`; break; }
        }
        const rat = cls?.rationale || "";
        if (!cls || ASSUMPTION.test(rat)) { // REFUSAL: assumption language is not a verdict
          if (EXECUTE) await upd(row.id, { dryrun_disposition: "hold", hold_reason: "refusal-assumption-language", notes: `unit3-v2 REFUSAL (assumption language): ${rat.slice(0, 120)}` });
          refused++; top.refused++; done++; continue;
        }
        // Map the RELEVANCE verdict onto the census mint-dryrun vocabulary (constraint: would_mint | dedup_hit |
        // congruence_reject | invariant_reject | hold). MAPPING (ruled 2026-07-26, in the session log):
        //   relevant + specific  -> would_mint (a GAP)
        //   NOT relevant / off-domain -> invariant_reject (mint would reject as out-of-scope; rollup buckets "other")
        //   portal (source, not a mintable item) -> hold + hold_reason='portal_source'
        // The prior runner wrote 'not_an_item'/'portal_source' (NOT in the constraint) via an UNCHECKED update, so
        // ~87% of verdicts were rejected silently. upd() throws now, and this mapping uses only allowed values.
        let d, holdReason = null;
        if (cls.entity_verdict === "portal") { d = "hold"; holdReason = "portal_source"; }
        else if (cls.relevant === false) { d = "invariant_reject"; }
        else { d = "would_mint"; }
        // hold_reason is set EXPLICITLY (reason for hold; NULL for non-hold) to satisfy census_worklist_check1
        // ((dryrun_disposition='hold') = (hold_reason IS NOT NULL)) — a residual hold_reason on a row we now write as
        // invariant_reject/would_mint would otherwise trip 23514. Clearing it on non-hold writes fixes those rows.
        const patch = { dryrun_disposition: d, hold_reason: holdReason, surface_tags: cls.surface_tags || [], notes: `unit3-v2: relevant=${cls.relevant} verdict=${cls.entity_verdict} type=${cls.item_type} conf=${cls.confidence} :: ${rat.slice(0, 100)}` };
        if (EXECUTE) await upd(row.id, patch);
        if (cls.entity_verdict === "portal") top.portal++;
        else if (cls.relevant === true) { top.relevant++; for (const s of (cls.surface_tags || [])) top.by_surface[s] = (top.by_surface[s] || 0) + 1; } else top.not_relevant++;
        done++;
        if ((done + pending) % 100 === 0) console.log(`  ${done + pending + refused}/${rows.length} | $${spent.toFixed(3)} | rel ${top.relevant} notrel ${top.not_relevant} pending ${pending} refused ${refused}`);
      } catch (e) { errs++; if (errs <= 8) console.warn(`  err ${row.id}: ${String(e.message || e).slice(0, 90)}`); }
      if (baseline + spent >= BUDGET) { halted = true; console.log(`\n  *** HALT: cumulative $${(baseline + spent).toFixed(3)} >= cap $${BUDGET} (baseline $${baseline.toFixed(2)} + this-run $${spent.toFixed(2)}) ***`); }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  const out = { classified: done, pending, refused, portal: top.portal, errors: errs, halted, spent: Number(spent.toFixed(4)), cumulative: Number((baseline + spent).toFixed(4)), topline: top };
  writeFileSync(resolve(ROOT, "scripts/tmp/unit3-v2-result.json"), JSON.stringify(out, null, 2));
  writeFileSync(SPENDFILE, JSON.stringify({ cumulative: Number((baseline + spent).toFixed(4)), last_chunk_rows: done + pending + refused, last_chunk_spent: Number(spent.toFixed(4)) })); // cross-restart baseline
  console.log(`\n  classified ${done} | pending(no-title) ${pending} | refused ${refused} | portal ${top.portal} | ERRORS ${errs} | this-run $${spent.toFixed(3)} | cumulative $${(baseline + spent).toFixed(3)}`);
  if (errs) console.log(`  *** ${errs} write/classify errors this chunk — investigate before trusting counts ***`);
  if (ledgerFail) { console.error(`\n  *** ${ledgerFail} ***\n  Run HALTED fail-closed — the ledger is the wall's authority; fix it before resuming.`); process.exit(3); }
  console.log(`  topline: ${JSON.stringify(top)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
