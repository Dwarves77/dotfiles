#!/usr/bin/env node
// unit1-eurlex-recapture.mjs — ADR-016 follow-through UNIT 1. Recapture the 27 held rows from the drain
// (23 EUR-Lex bot-wall shells + the ICS2 FAQ / sdir.no / DCCEEW rows + the two EU-ETS PDFs) through the
// OFFICIAL CELEX document endpoints (bucket A) or a full-ladder retry (bucket B), guarded by
// factSpansStillMatch (error-checked). Replace a stored capture ONLY if every grounded FACT span on that pool
// row still .includes()-matches the fresh text; otherwise the row stays HELD. Fetch only, no model calls ($0).
//
// PREMISE (verified read-only before build): the held EUR-Lex rows are bot-wall SHELL renders, not content
// drift — the JS-viewer URL `/legal-content/EN/TXT/?uri=X` returns a shell, but `/legal-content/EN/TXT/HTML/?uri=X`
// and the Cellar endpoint `publications.europa.eu/resource/celex/{CELEX}` return the full text (100K-173K chars).
//
// Emits an outcome artifact (scripts/tmp/unit1-recapture-{dryrun,execute}.json) + the residual list needing the
// Chrome render path. Flag reconciliation (the 27 hold flags + 4 truncation-guard flags) runs in the paired
// unit1-reconcile-flags.mjs AFTER the Chrome residual is handled, so per-item "all rows clean" is final.
// Run: --dry-run (default, fetch + guard, no write) | --execute (guardedUpdate the passing captures)

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync } from "node:fs";
import { readClient, guardedUpdate } from "../lib/db.mjs";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const CALLER = "unit3-remediation"; // F16-authorized signed caller (fetch-hold), no manifest change

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { refetchThroughLadder } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = readClient();

const art = JSON.parse(readFileSync(resolve(ROOT, "scripts/tmp/drain-artifact.json"), "utf8"));
const held = (art.out || []).filter((r) => r.outcome === "HOLD-fact-drift" || r.outcome === "HOLD-refetch-failed");

// Bucket B (ladder retry -> Chrome fallback): the 3 named non-EUR-Lex rows + the two EU-ETS PDFs (item 15f63ea9).
const B_HOSTS = /sdir\.no|taxation-customs\.ec\.europa\.eu|dcceew\.gov\.au|umweltbundesamt\.de/i;
const ETS_ITEM = "15f63ea9-4803-4bb4-b1a3-9ccdeb8a3050";
const bucketOf = (r) => (B_HOSTS.test(r.result_url) || r.item_id === ETS_ITEM) ? "B" : "A";

// CELEX derivation from an EUR-Lex URL (CELEX: uri, or eli/{type}/{year}/{num}[/{consolidation-date}]).
function deriveCelex(url) {
  let m = decodeURIComponent(url).match(/uri=CELEX:([0-9][A-Z0-9()\-]+)/i);
  if (m) return m[1];
  m = url.match(/\/eli\/(reg|dir|dec)\/(\d{4})\/(\d+)(?:\/(\d{4}-\d{2}-\d{2}))?/i);
  if (m) {
    const T = { reg: "R", dir: "L", dec: "D" }[m[1].toLowerCase()];
    const num = m[3].padStart(4, "0");
    return m[4] ? `0${m[2]}${T}${num}-${m[4].replace(/-/g, "")}` : `3${m[2]}${T}${num}`;
  }
  return null;
}
// Ordered endpoint candidates for a held EUR-Lex URL: the /HTML/ raw render (handles CELEX:/OJ:/comnat: uris),
// then the CELEX-derived /HTML/ + Cellar endpoints. All are non-bot-walled.
function endpointsFor(url) {
  const out = [];
  const push = (u) => { if (u && !out.includes(u)) out.push(u); };
  if (/\/legal-content\/EN\/TXT\/\?uri=/i.test(url)) push(url.replace(/\/EN\/TXT\/\?uri=/i, "/EN/TXT/HTML/?uri="));
  if (/\/legal-content\/EN\/TXT\/HTML\/\?uri=/i.test(url)) push(url);
  if (/\/legal-content\/EN\/TXT\/PDF\/\?uri=/i.test(url)) push(url.replace(/\/EN\/TXT\/PDF\/\?uri=/i, "/EN/TXT/HTML/?uri="));
  const celex = deriveCelex(url);
  if (celex) {
    push(`https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celex}`);
    push(`https://publications.europa.eu/resource/celex/${celex}`);
  }
  return out;
}

// The drain's diff-on-recapture guard, error-checked (agent/run error-swallow class): on any query error the
// row is un-verifiable -> not ok -> caller keeps it HELD.
async function factSpansStillMatch(poolRowId, newText) {
  const { data: spans, error } = await sb.from("section_claim_provenance")
    .select("source_span").eq("search_result_id", poolRowId).eq("claim_kind", "FACT");
  if (error) return { ok: false, missing: [], error: error.message };
  const missing = [];
  for (const s of spans || []) { const span = (s.source_span || "").trim(); if (span && !newText.includes(span)) missing.push(span.slice(0, 80)); }
  return { ok: missing.length === 0, missing, error: null };
}

console.log(`\n===== UNIT 1 EUR-Lex recapture (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) — ${held.length} held rows =====\n`);
const results = [];
let replaced = 0;
for (const row of held) {
  const bucket = bucketOf(row);
  const candidates = bucket === "A" ? endpointsFor(row.result_url) : [row.result_url];
  let accepted = null; const tried = [];
  for (const cand of candidates) {
    let fr;
    try { fr = await refetchThroughLadder(cand, CALLER); } catch (e) { tried.push({ cand, err: String(e?.message || e).slice(0, 90) }); continue; }
    const t = fr?.text || "";
    if (t.length <= 200) { tried.push({ cand, len: t.length, transport: fr?.transport, note: "roadblock/short" }); continue; }
    const g = await factSpansStillMatch(row.id, t);
    tried.push({ cand, len: t.length, transport: fr?.transport, guard: g.error ? `error:${g.error}` : (g.ok ? "PASS" : `missing ${g.missing.length}`), missing: g.ok ? undefined : g.missing });
    if (g.error) continue;        // fail closed on a guard-query error
    if (g.ok) { accepted = { cand, text: t, len: t.length, transport: fr?.transport }; break; }
  }
  if (accepted && EXECUTE) {
    await guardedUpdate("agent_run_searches", (qb) => qb.eq("id", row.id), { result_content_excerpt: accepted.text },
      { cite: { skill: "remediation-discipline", reason: `ADR-016 UNIT1: recapture held bot-wall row via ${accepted.cand} (${row.old_length}->${accepted.len}ch); all grounded FACT spans preserved` } });
    replaced++;
  }
  const outcome = accepted ? (EXECUTE ? "REPLACED" : "WOULD-REPLACE") : "STILL-HELD";
  console.log(`  [${bucket}] ${outcome.padEnd(13)} ${row.item_id.slice(0, 8)} ${row.result_url.slice(0, 70)}${accepted ? ` (${row.old_length}->${accepted.len} via ${accepted.cand.includes("publications.europa.eu") ? "cellar" : accepted.cand.includes("/HTML/") ? "html" : "ladder"})` : ""}`);
  results.push({ id: row.id, item_id: row.item_id, url: row.result_url, bucket, drain_outcome: row.outcome, old_length: row.old_length, accepted: !!accepted, winning_endpoint: accepted?.cand, new_length: accepted?.len || null, tried });
}

const accepted = results.filter((r) => r.accepted);
const stillHeld = results.filter((r) => !r.accepted);
console.log(`\n===== SUMMARY (${EXECUTE ? "applied" : "dry-run"}) =====`);
console.log(`  ${EXECUTE ? "REPLACED" : "would replace"}: ${accepted.length}  (bucket A ${accepted.filter(r => r.bucket === "A").length} / bucket B ${accepted.filter(r => r.bucket === "B").length})`);
console.log(`  STILL-HELD (needs Chrome render): ${stillHeld.length}`);
stillHeld.forEach((r) => console.log(`    - [${r.bucket}] ${r.item_id.slice(0, 8)} ${r.url}`));
const file = resolve(ROOT, `scripts/tmp/unit1-recapture-${EXECUTE ? "execute" : "dryrun"}.json`);
writeFileSync(file, JSON.stringify({ mode: EXECUTE ? "execute" : "dryrun", replaced: EXECUTE ? replaced : undefined, would_replace: accepted.length, still_held: stillHeld.length, results }, null, 2));
console.log(`  artifact -> ${file}`);
process.exit(0);
