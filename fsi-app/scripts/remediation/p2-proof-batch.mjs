#!/usr/bin/env node
// P2 PROOF BATCH — depth-brief generation from catalogued instruments (operator authorization 2026-07-29).
// Measures per-brief cost, audit score, wall time so the policy proposal carries MEASURED numbers.
//
// SPEND DISCIPLINE (fail-closed): openMeteredBatch asserts the metered gate (RULE 2a/2b/2c) + writes the
// batch marker BEFORE any spend — it THROWS unless the scoped class amendment (depth-brief-generation,
// Haiku, $6 cap, named task) matches AND METERED_BATCH_TOKEN is present. Document capture is $0 (free
// ladder — node fetch / stored text; Browserless stays frozen); ONLY Haiku synthesis is metered. A running
// cost ledger HALTS the batch before the $6 cap. No silent model escalation: Haiku only.
//
// AUDIT (Gate-A grounding): for each generated brief, every factual token (figure + deadline-date, via the
// SHARED extractor/matcher) MUST be verbatim in the captured source. A brief PASSES iff orphan_count==0
// (Haiku stated nothing not in the source). Full-batch audit score = fraction passing; <90% => BATCH FAILS.
import { resolve } from "node:path"; import { pathToFileURL } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(resolve(process.cwd(), ".env.local"));
const { streamMessagesText } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/agent/anthropic-stream.mjs")).href);
const { openMeteredBatch } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/llm/metered-emit.mjs")).href);
const { assertMeteredCallAllowed } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/llm/metered-gate.mjs")).href);
const { extractFactualTokens } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/agent/gate-a-scan.mjs")).href);
const { containsToken } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/agent/gate-a-match.mjs")).href);
const { fetchAllRows } = await import(pathToFileURL(resolve(process.cwd(), "src/lib/db/paginate.mjs")).href);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TASK = "P2 proof batch: depth-brief generation from catalogued instruments";
const MODEL = "claude-haiku-4-5-20251001";
const CAP_USD = 6.0;
// Haiku 4.5 pricing (USD per MTok): $1 input / $5 output. Tunable if pricing moves.
const HAIKU_IN = 1.0, HAIKU_OUT = 5.0;
const costOf = (i, o) => (i / 1e6) * HAIKU_IN + (o / 1e6) * HAIKU_OUT;
const N = Number((process.argv.find((a) => a.startsWith("--n=")) || "--n=5").slice(4));
const EXECUTE = process.argv.includes("--execute");

const SYSTEM = `You are a regulatory analyst producing a grounded fact brief from a SINGLE primary source document.
STRICT GROUNDING RULE: state ONLY facts — figures, percentages, monetary amounts, capacities, dates — that appear
VERBATIM in the provided source text. Never invent, round, derive, or infer a number or date that is not literally
present. If a fact is not in the source, do not state it. Prefer prose that quotes the source's own figures exactly
(same digits, same units). Write ~6-10 short sections: what the instrument is, who it binds, key requirements with
their exact figures/dates, and what is unresolved. Every figure you write MUST be copy-exact from the source.`;

async function captureFreeText(row) {
  // $0 capture. NECP: use the already-extracted text. Otherwise fetch the URL and strip to text (free).
  if (/gov\.si|energy\.ec\.europa\.eu/.test(row.document_url) && existsSync(resolve(process.cwd(), "scripts/tmp/si-necp-en.txt"))) {
    return readFileSync(resolve(process.cwd(), "scripts/tmp/si-necp-en.txt"), "utf8");
  }
  // SOFT-ROADBLOCK LADDER (RD-14 shape, $0, same transport). EUR-Lex answers a cold request with HTTP 202 and a
  // near-empty body (anti-bot warm-up), which is 2xx — so `res.ok` is TRUE and a naive caller reads it as a real
  // but empty page. Probed 2026-07-30: the SAME url retried moments later returns 200 with the full 353KB text.
  // So: browser UA, and retry while the response is a soft roadblock (202, or too little text to be a document).
  // Bounded at 3 attempts; a still-empty capture after the ladder is an HONEST SKIP, never a fabricated brief.
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
  const toText = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(row.document_url, { redirect: "follow", signal: ctrl.signal,
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" } });
      clearTimeout(t);
      if (res.ok) {
        const text = toText(await res.text());
        if (text.length >= 800) return text;           // real document
        if (res.status !== 202 && attempt === 3) return text; // genuinely thin page, report as-is
      } else if (res.status !== 429 && res.status < 500) {
        return null;                                    // hard client error — not a warm-up, do not hammer
      }
    } catch { /* transport error — fall through to the backoff and retry */ }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return null;
}

function auditGrounding(brief, sourceText) {
  const { figures, deadlines } = extractFactualTokens(brief);
  const toks = [...figures, ...deadlines];
  const orphans = toks.filter((tk) => !containsToken(sourceText, tk));
  return { tokens: toks.length, orphanCount: orphans.length, orphans: orphans.slice(0, 12), grounded: orphans.length === 0 };
}

// ── Preflight: ASSERT the metered gate BEFORE any spend (throws if unauthorized; fail-closed) ──
try {
  assertMeteredCallAllowed({ callClass: "depth-brief-generation", model: MODEL, capUsd: CAP_USD, task: TASK, env: process.env });
} catch (e) {
  console.error(`GATE REFUSED (fail-closed): ${e.message}`);
  process.exit(1);
}
if (!EXECUTE) { console.log(`GATE OK (assert): depth-brief-generation / ${MODEL} / cap $${CAP_USD} authorized. DRY — no marker, no Haiku calls.`); process.exit(0); }
// EXECUTE: open the metered batch — writes the batch marker AT GRANT per the structural rule.
const batch = await openMeteredBatch(sb, { callClass: "depth-brief-generation", model: MODEL, capUsd: CAP_USD, task: TASK, windowMs: 3 * 3600 * 1000, env: process.env });
console.log(`METERED BATCH OPEN (marker written): model=${MODEL} cap=$${CAP_USD} marker=${batch.markerId ?? "n/a"}`);

// ── Select N dual-verified firm-core catalogued instruments (CELEX preferred — free EUR-Lex capture) ──
const rows = await fetchAllRows((f, t) => sb.from("census_worklist")
  .select("id,document_url,instrument_identifier,title,identity_scheme,notes")
  .eq("dryrun_disposition", "would_mint").eq("identity_resolves", true).eq("identity_host_registered", true)
  .eq("identity_scheme", "celex").order("id").range(f, t));
const firm = rows.filter((r) => ((r.notes || "").split("[low-relevance]").length - 1) === 0).slice(0, N * 3);

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("no ANTHROPIC_API_KEY"); process.exit(1); }

const results = []; let spent = 0; const t0 = Date.now();
for (const row of firm) {
  if (results.length >= N) break;
  if (spent > CAP_USD - 0.5) { console.log(`HALT: cost ledger $${spent.toFixed(3)} approaching cap $${CAP_USD}`); break; }
  const src = await captureFreeText(row);
  if (!src || src.length < 800) { console.log(`  skip ${row.instrument_identifier}: capture empty/short`); continue; }
  const srcClip = src.slice(0, 60000); // bound the input (cost control)
  const b0 = Date.now();
  let out;
  try {
    out = await streamMessagesText({ apiKey, body: { model: MODEL, max_tokens: 2000, system: SYSTEM,
      messages: [{ role: "user", content: `PRIMARY SOURCE (${row.title || row.instrument_identifier}):\n\n${srcClip}\n\n---\nWrite the grounded fact brief now. Copy every figure exactly from the source above.` }] } });
  } catch (e) { console.log(`  skip ${row.instrument_identifier}: synthesis error ${e.message}`); continue; }
  const c = costOf(out.usage.input_tokens, out.usage.output_tokens);
  spent += c;
  // PER-CALL PERSISTENCE (fail-closed metering): write this call's cost to the ledger IMMEDIATELY, before
  // the audit — a crash loses at most the in-flight call, never a completed call's spend trace. Subject-less
  // (catalogued instrument, not yet an intelligence_item) → traces to the batch marker by model+window.
  const { error: ledgerErr } = await sb.from("agent_runs").insert({
    fetch_method: "depth-brief-generation", cost_usd_estimated: c, status: "success", model: MODEL,
    intelligence_item_id: null, source_id: null,
    started_at: new Date(b0).toISOString(), created_at: new Date().toISOString(),
    errors: [{ depthBrief: { batchMarker: batch.markerId, instrument: row.instrument_identifier, inTok: out.usage.input_tokens, outTok: out.usage.output_tokens, capUsd: CAP_USD } }],
  });
  // FAIL-CLOSED (error-swallow case file): a console.error here would let the batch keep SPENDING while its
  // spend trace silently stops persisting — exactly the "unchecked write reports success" class. Halt instead.
  if (ledgerErr) {
    console.error(`  LEDGER WRITE FAILED for ${row.instrument_identifier}: ${ledgerErr.message}`);
    throw new Error(`HALT (fail-closed metering): per-call ledger write failed after $${c.toFixed(4)} of spend on ${row.instrument_identifier}. Untraced spend is forbidden; the batch stops here. In-memory total so far $${spent.toFixed(4)}.`);
  }
  const audit = auditGrounding(out.text, src);
  const wall = (Date.now() - b0) / 1000;
  results.push({ id: row.instrument_identifier, title: (row.title || "").slice(0, 50), inTok: out.usage.input_tokens, outTok: out.usage.output_tokens, costUsd: c, wallSec: wall, ...audit });
  console.log(`  [${results.length}/${N}] ${row.instrument_identifier}: $${c.toFixed(4)} ${wall.toFixed(1)}s tokens=${audit.tokens} orphans=${audit.orphanCount} grounded=${audit.grounded}`);
}

const totalWall = (Date.now() - t0) / 1000;
const graded = results.length;
const passed = results.filter((r) => r.grounded).length;
const auditScore = graded ? passed / graded : 0;
const avgCost = graded ? spent / graded : 0;
console.log(`\n===== P2 PROOF BATCH RESULT =====`);
console.log(`briefs generated=${graded} | total spend=$${spent.toFixed(4)} (cap $${CAP_USD}) | avg per-brief=$${avgCost.toFixed(4)}`);
console.log(`audit (Gate-A grounding, orphan-free): ${passed}/${graded} = ${(auditScore * 100).toFixed(1)}% | threshold 90% => ${auditScore >= 0.9 ? "PASS" : "FAIL"}`);
console.log(`total wall=${totalWall.toFixed(1)}s | avg per-brief=${graded ? (totalWall / graded).toFixed(1) : "n/a"}s`);
console.log(`envelope math: $${avgCost.toFixed(4)}/brief => ~$49 remaining buys ~${avgCost > 0 ? Math.floor(49 / avgCost) : 0} briefs`);
console.log(`PER-BRIEF:`, JSON.stringify(results.map((r) => ({ id: r.id, cost: +r.costUsd.toFixed(4), tokens: r.tokens, orphans: r.orphanCount, grounded: r.grounded })), null, 0));
const worst = results.filter((r) => !r.grounded).slice(0, 3);
if (worst.length) console.log(`UNGROUNDED SAMPLES (Haiku figures not in source):`, JSON.stringify(worst.map((r) => ({ id: r.id, orphans: r.orphans }))));

// ── CLOSING ASSERTION: the PERSISTED ledger must match the in-memory console total ──────────────────────
// The 2026-07-29 crashed run reported $0.0438 to console and persisted NOTHING (the per-call write did not
// exist yet), so the spend was real and untraceable. A reported number that was never read back from the DB
// is not evidence. This asserts stored-outcome (count + sum) and sweeps for rows that do not trace to THIS
// marker. Any mismatch exits non-zero — the batch result is not claimed clean unless the ledger agrees.
const persisted = await fetchAllRows((f, t) => sb.from("agent_runs")
  .select("id,cost_usd_estimated,errors,created_at")
  .eq("fetch_method", "depth-brief-generation")
  .gte("created_at", batch.windowStart).lte("created_at", batch.windowEnd)
  .order("id").range(f, t));
const mine = persisted.filter((r) => r?.errors?.[0]?.depthBrief?.batchMarker === batch.markerId);
const strays = persisted.length - mine.length;
const persistedSum = mine.reduce((a, r) => a + Number(r.cost_usd_estimated || 0), 0);
const countOk = mine.length === graded;
const sumOk = Math.abs(persistedSum - spent) < 0.0005;
console.log(`\n===== LEDGER READ-BACK (persisted vs console) =====`);
console.log(`rows persisted for this marker: ${mine.length} (expected ${graded}) => ${countOk ? "MATCH" : "MISMATCH"}`);
console.log(`persisted spend: $${persistedSum.toFixed(4)} vs console $${spent.toFixed(4)} => ${sumOk ? "MATCH" : "MISMATCH"}`);
console.log(`rows in window NOT tracing to this marker (absence sweep): ${strays} => ${strays === 0 ? "CLEAN" : "INVESTIGATE"}`);
if (!countOk || !sumOk || strays !== 0) {
  console.error(`METERING ASSERTION FAILED — spend trace does not reconcile. Batch result NOT clean.`);
  process.exit(2);
}
console.log(`METERING ASSERTION PASS: every dollar spent has a persisted, marker-traced ledger row.`);
