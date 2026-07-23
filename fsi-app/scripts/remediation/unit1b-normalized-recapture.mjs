#!/usr/bin/env node
// unit1b-normalized-recapture.mjs — ADR-016 UNIT 1 (operator ruling on the validation finding). Recapture the
// still-held EUR-Lex rows via the /HTML/ CELEX endpoint (Cellar fallback) through refetchThroughLadder, whose
// text is ALREADY normalized by the pipeline's own extractor (htmlToText tag->space, cleanCtl, \s+->space, trim)
// — the SAME form the stored FACT spans were extracted from. This is why /HTML/ matches the substantive spans
// where Chrome innerText (subscript-tight "CO2"/"N2") does not: captures MUST be extracted by the pipeline's
// extractor, never a browser text renderer (permanent lesson, session log 2026-07-23).
//
// ACCEPTANCE (ruled): replace a row when zero SUBSTANTIVE spans fail. Residual failing spans are only
// citation/masthead or stale consolidated-date page-chrome:
//   - citation/masthead residual -> if the item is on the UNIT 2 reground list, replace-anyway (UNIT 2 re-grounds
//     the span at no added cost); if OFF the list, replace the capture but flag the residual claim HELD
//     (citation-metadata pending re-ground), added to NO wave, closes on the next scheduled re-ground.
//   - stale consolidated-date residual -> flag as a version-currency finding for the monitoring/diff unit; never
//     re-ground to a stale value.
// A row with ANY substantive-span failure stays HELD with the reason (genuine, not chrome). Fetch only ($0).
// Run: --dry-run (default) | --execute
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { readClient, guardedUpdate, guardedInsert } from "../lib/db.mjs";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const CALLER = "unit3-remediation";
const SCRATCH_ART = resolve(ROOT, "scripts/tmp/drain-artifact.json");

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { refetchThroughLadder } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = readClient();

const drain = JSON.parse(readFileSync(SCRATCH_ART, "utf8"));
const held = (drain.out || []).filter((r) => r.outcome === "HOLD-fact-drift" || r.outcome === "HOLD-refetch-failed");
const regroundItems = new Set((drain.out || []).filter((r) => r.reground_recommended).map((r) => r.item_id));
// rows already replaced by unit1-eurlex-recapture (clean strict-guard passes) — skip them
const execArt = JSON.parse(readFileSync(resolve(ROOT, "scripts/tmp/unit1-recapture-execute.json"), "utf8"));
const alreadyReplaced = new Set(execArt.results.filter((r) => r.accepted).map((r) => r.id));

const B_HOSTS = /sdir\.no|taxation-customs\.ec\.europa\.eu|dcceew\.gov\.au|umweltbundesamt\.de/i;
const ETS_ITEM = "15f63ea9-4803-4bb4-b1a3-9ccdeb8a3050";
const isEurlexBucket = (r) => !(B_HOSTS.test(r.result_url) || r.item_id === ETS_ITEM);

// span classification — chrome vs substantive
const isConsolidatedDate = (s) => /^Current consolidated version:/i.test(s);
const isCitation = (s) =>
  /^OJ [LC][ ,]/.test(s) ||
  /\bpp\.\s*\d+\s*[-–]\s*\d+/.test(s) ||
  /of the European Parliament and of the Council of /i.test(s) ||
  /^Proposal for a /i.test(s) ||
  /^►M\d/.test(s) ||
  /^(?:\d{2}\/\d{2}\/\d{4}\s*){2,}$/.test(s.trim());
const classify = (s) => isConsolidatedDate(s) ? "consolidated_date" : (isCitation(s) ? "citation" : "substantive");

// CELEX derivation + endpoint candidates (same as unit1-eurlex-recapture)
function deriveCelex(url) {
  let m = decodeURIComponent(url).match(/uri=CELEX:([0-9][A-Z0-9()\-]+)/i);
  if (m) return m[1];
  m = url.match(/\/eli\/(reg|dir|dec)\/(\d{4})\/(\d+)(?:\/(\d{4}-\d{2}-\d{2}))?/i);
  if (m) { const T = { reg: "R", dir: "L", dec: "D" }[m[1].toLowerCase()]; const num = m[3].padStart(4, "0"); return m[4] ? `0${m[2]}${T}${num}-${m[4].replace(/-/g, "")}` : `3${m[2]}${T}${num}`; }
  return null;
}
function endpointsFor(url) {
  const out = []; const push = (u) => { if (u && !out.includes(u)) out.push(u); };
  if (/\/legal-content\/EN\/TXT\/\?uri=/i.test(url)) push(url.replace(/\/EN\/TXT\/\?uri=/i, "/EN/TXT/HTML/?uri="));
  if (/\/legal-content\/EN\/TXT\/HTML\/\?uri=/i.test(url)) push(url);
  const celex = deriveCelex(url);
  if (celex) { push(`https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celex}`); push(`https://publications.europa.eu/resource/celex/${celex}`); }
  return out;
}
async function factSpans(poolRowId) {
  const { data, error } = await sb.from("section_claim_provenance").select("id, source_span").eq("search_result_id", poolRowId).eq("claim_kind", "FACT");
  if (error) return { error: error.message, spans: [] };
  return { error: null, spans: (data || []).map((r) => ({ id: r.id, span: (r.source_span || "").trim() })).filter((r) => r.span) };
}

const targets = held.filter((r) => isEurlexBucket(r) && !alreadyReplaced.has(r.id));
console.log(`\n===== UNIT 1b normalized /HTML/ recapture (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) — ${targets.length} EUR-Lex rows =====\n`);
const results = [];
let replaced = 0, stillHeld = 0, residualFlags = 0, versionFlags = 0, holdResolved = 0;

for (const row of held.filter(isEurlexBucket)) {
  if (alreadyReplaced.has(row.id)) { results.push({ id: row.id, item_id: row.item_id, url: row.result_url, outcome: "ALREADY-REPLACED (unit1 clean)" }); continue; }
  const fs = await factSpans(row.id);
  if (fs.error) { stillHeld++; results.push({ id: row.id, item_id: row.item_id, url: row.result_url, outcome: "STILL-HELD", reason: `span-query error: ${fs.error}` }); continue; }
  let best = null;
  for (const cand of endpointsFor(row.result_url)) {
    let fr; try { fr = await refetchThroughLadder(cand, CALLER); } catch { continue; }
    const t = fr?.text || ""; if (t.length <= 200) continue;
    const misses = fs.spans.filter((s) => !t.includes(s.span));
    const subMiss = misses.filter((m) => classify(m.span) === "substantive");
    const cand_result = { cand, text: t, len: t.length, misses, subMiss };
    if (!best || subMiss.length < best.subMiss.length) best = cand_result;
    if (subMiss.length === 0) break; // clean on substantive — accept
  }
  if (!best || best.subMiss.length > 0) {
    stillHeld++;
    const onList = regroundItems.has(row.item_id);
    const reason = best ? `${best.subMiss.length} SUBSTANTIVE span(s) absent from the current re-fetch — version-currency (instrument amended since grounding, and/or transport render variance), NOT bot-wall/chrome. ${onList ? "On the UNIT2 wave: re-grounds fresh against the current text." : "Off-wave: monitoring/diff-unit finding."}` : "no endpoint fetched";
    if (EXECUTE) {
      const { data: hf } = await sb.from("integrity_flags").select("id, description").eq("subject_ref", row.item_id).eq("created_by", "refetch-capped-worklist").eq("status", "open");
      const flag = (hf || []).find((f) => (f.description || "").includes(row.result_url));
      if (flag) await guardedUpdate("integrity_flags", (qb) => qb.eq("id", flag.id), { description: `ADR-016 UNIT1b HELD (${row.result_url}): ${reason}`.slice(0, 480) }, { cite: { skill: "remediation-discipline", reason: `ADR-016 UNIT1b: record version-currency hold reason for ${row.result_url}` } }).catch(() => {});
    }
    results.push({ id: row.id, item_id: row.item_id, url: row.result_url, outcome: "STILL-HELD", on_unit2_list: regroundItems.has(row.item_id), reason, substantive_misses: best?.subMiss.map((m) => m.span.slice(0, 70)) || [] });
    continue;
  }
  // accept: zero substantive misses -> replace the capture with the normalized /HTML/ text
  const onList = regroundItems.has(row.item_id);
  const citationResiduals = best.misses.filter((m) => classify(m.span) === "citation");
  const dateResiduals = best.misses.filter((m) => classify(m.span) === "consolidated_date");
  if (EXECUTE) {
    await guardedUpdate("agent_run_searches", (qb) => qb.eq("id", row.id), { result_content_excerpt: best.text },
      { cite: { skill: "remediation-discipline", reason: `ADR-016 UNIT1b: normalized /HTML/ recapture via ${best.cand} (${row.old_length}->${best.len}ch); all substantive FACT spans match; ${citationResiduals.length} citation + ${dateResiduals.length} version-date residual(s)` } });
    replaced++;
    // resolve the drain hold-flag for this row (bot-wall capture recovered, substantive complete)
    const { data: hf } = await sb.from("integrity_flags").select("id, description").eq("subject_ref", row.item_id).eq("created_by", "refetch-capped-worklist").eq("status", "open");
    const flag = (hf || []).find((f) => (f.description || "").includes(row.result_url));
    if (flag) { await guardedUpdate("integrity_flags", (qb) => qb.eq("id", flag.id), { status: "resolved" }, { cite: { skill: "remediation-discipline", reason: `ADR-016 UNIT1b: row recaptured full + substantive-complete via ${best.cand}` } }); holdResolved++; }
    // OFF-list citation residuals -> hold the specific claims (no wave add, closes next scheduled reground)
    if (!onList && citationResiduals.length) {
      await guardedInsert("integrity_flags", { category: "source_issue", subject_type: "item", subject_ref: row.item_id, status: "open", created_by: "unit1-residual-citation",
        description: `ADR-016 UNIT1b: capture recaptured full; ${citationResiduals.length} citation-metadata FACT claim(s) pending re-ground (span not in the raw /HTML/ render): ${citationResiduals.map((m) => m.span.slice(0, 50)).join(" | ")}. Item is NOT on the UNIT2 wave; closes on the next scheduled re-ground.`.slice(0, 480),
        recommended_actions: [{ action: "reground_on_schedule", rationale: "citation/masthead FACT span absent from the raw document render; re-ground against the full recaptured text at the next scheduled pass; no added spend." }] }, { cite: { skill: "remediation-discipline", reason: `ADR-016 UNIT1b: hold citation-metadata residual for off-wave item ${row.item_id}` } }).catch(() => {});
      residualFlags++;
    }
    // stale consolidated-date residual -> version-currency finding (never re-ground to a stale value)
    if (dateResiduals.length) {
      await guardedInsert("integrity_flags", { category: "data_quality", subject_type: "item", subject_ref: row.item_id, status: "open", created_by: "unit1-version-currency",
        description: `ADR-016 UNIT1b version-currency finding: stored FACT span(s) reference a consolidated version the live page no longer shows (newer consolidation): ${dateResiduals.map((m) => m.span.slice(0, 60)).join(" | ")}. Information for the monitoring/diff-on-recapture unit; do NOT re-ground to a stale value.`.slice(0, 480),
        recommended_actions: [{ action: "monitor_version_currency", rationale: "a 'Current consolidated version: <date>' claim is not reproducible by any fetch because the instrument was re-consolidated; route to the diff/monitoring unit, not the reground wave." }] }, { cite: { skill: "remediation-discipline", reason: `ADR-016 UNIT1b: version-currency finding for item ${row.item_id}` } }).catch(() => {});
      versionFlags++;
    }
  } else { replaced++; }
  results.push({ id: row.id, item_id: row.item_id, url: row.result_url, outcome: EXECUTE ? "REPLACED" : "WOULD-REPLACE", winning_endpoint: best.cand, new_length: best.len, on_unit2_list: onList, citation_residuals: citationResiduals.map((m) => m.span.slice(0, 60)), version_date_residuals: dateResiduals.map((m) => m.span.slice(0, 60)) });
  console.log(`  ${(EXECUTE ? "REPLACED" : "would-replace").padEnd(13)} ${row.item_id.slice(0, 8)} ${row.result_url.slice(0, 55)} (${row.old_length}->${best.len}; ${onList ? "on-wave" : "off-wave"}; cite-res ${citationResiduals.length}, ver-res ${dateResiduals.length})`);
}

const file = resolve(ROOT, `scripts/tmp/unit1b-recapture-${EXECUTE ? "execute" : "dryrun"}.json`);
writeFileSync(file, JSON.stringify({ mode: EXECUTE ? "execute" : "dryrun", replaced, stillHeld, residualFlags, versionFlags, holdResolved, results }, null, 2));
console.log(`\n  ${EXECUTE ? "REPLACED" : "would replace"}: ${replaced} | STILL-HELD (substantive fail): ${stillHeld} | residual-citation flags: ${residualFlags} | version-currency flags: ${versionFlags} | hold-flags resolved: ${holdResolved}`);
console.log(`  artifact -> ${file}`);
process.exit(0);
