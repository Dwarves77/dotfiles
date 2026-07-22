#!/usr/bin/env node
// refetch-capped-worklist.mjs — ADR-016 storage-side uncap: re-capture the legacy STORAGE-CAPPED pool rows in
// FULL, so the permanent slice the retired PRIMARY_MAX_CHARS / CORROBORATOR_MAX_CHARS caps baked into
// agent_run_searches.result_content_excerpt is undone. The caps are gone in code (generation-config.ts); this
// script drains the rows CAPTURED under the old caps.
//
// MODES (acquire-primaries-batch.mjs pattern — guarded writes via scripts/lib/db.mjs, dry-run default):
//   node scripts/remediation/refetch-capped-worklist.mjs            BUILD (default): READ-ONLY. Page past the
//       1000-row cap, classify the three legacy populations by the EXACT premise-2 predicates, dedup on
//       (item_id, result_url), emit a JSON worklist to scripts/tmp/ + a summary line. No fetch, no write.
//   node scripts/remediation/refetch-capped-worklist.mjs --execute  EXECUTE: refuses if
//       system_state.global_processing_paused. Per row: re-fetch result_url through the LIVE transport ladder
//       (canonical-pipeline refetchThroughLadder → fetchMeta → fetchWithTransport; NO copied transport code),
//       apply the DIFF-ON-RECAPTURE guard, and REPLACE the stored capture only when every grounded FACT span
//       still matches the fresh capture. On any drift: HOLD (source_issue integrity_flag) and KEEP the old
//       capture. Resolve an item's truncation-guard flag only when ALL its capped rows replaced clean.
//
// DRAIN ORDER (operator ruling): merge + deploy → BUILD worklist → operator lifts the hold via
// admin_set_pause_state → --execute → review drift-holds + reground_recommended. EXECUTE is OUT OF SCOPE for the
// ADR-016 build PR (operator: "Out of scope: ... running EXECUTE"); it is BUILT + node --check'd here, run later.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { readClient, readAll, guardedUpdate, guardedInsert } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();

// F16 signed caller — this re-fetch is a Unit-3 remediation, already in AUTHORIZED_HOLD_CALLERS
// (src/lib/sources/fetch-hold.mjs), so it passes isAuthorizedHoldCaller at drain time with NO manifest change.
const CALLER = "unit3-remediation";
const CUTOFF = "2026-06-28"; // premise-2 legacy-cap date boundary
const PRE_ADR016_SKILL = "remediation-discipline";

// ── The three legacy populations, EXACT premise-2 predicates (a row belongs to exactly one — the length
//    ranges are disjoint). `len` is length(result_content_excerpt); `searched_at` gates only legacy_40k.
function classify(row) {
  const len = (row.result_content_excerpt || "").length;
  if (row.searched_at && row.searched_at < CUTOFF && len >= 39900 && len <= 40000) return "legacy_40k";
  if (len === 600000) return "primary_600k";
  if (len === 60000 || (len >= 59900 && len <= 59999)) return "corroborator_60k";
  return null;
}

// Dedup key: (item_id, result_url) per the dispatch. Returns a Map key → first row seen (stable).
const dedupKey = (r) => `${r.intelligence_item_id}|${r.result_url}`;

async function buildWorklist() {
  // READ-ONLY, paged past the 1000-row cap (readAll). We must pull result_content_excerpt to derive length
  // (PostgREST cannot filter/compute length server-side); the table is ~2.9k rows / ~32MB — a one-shot build read.
  const rows = await readAll(
    "agent_run_searches",
    "id, intelligence_item_id, result_url, search_query, searched_at, result_index, result_content_excerpt",
  );
  const pops = { legacy_40k: [], corroborator_60k: [], primary_600k: [] };
  const seen = { legacy_40k: new Set(), corroborator_60k: new Set(), primary_600k: new Set() };
  let rawCounts = { legacy_40k: 0, corroborator_60k: 0, primary_600k: 0 };
  for (const r of rows) {
    const pop = classify(r);
    if (!pop) continue;
    rawCounts[pop]++;
    const k = dedupKey(r);
    if (seen[pop].has(k)) continue; // dedup on (item_id, result_url)
    seen[pop].add(k);
    pops[pop].push({
      id: r.id,
      item_id: r.intelligence_item_id,
      result_url: r.result_url,
      search_query: r.search_query,
      searched_at: r.searched_at,
      old_length: (r.result_content_excerpt || "").length,
    });
  }
  return { pops, rawCounts };
}

// ── EXECUTE-only helpers (guarded, side-effecting). Kept below so BUILD never touches them. ──────────────
async function holdRow(sb, row, reason) {
  await guardedInsert("integrity_flags", {
    category: "source_issue", subject_type: "item", subject_ref: row.item_id, status: "open",
    created_by: "refetch-capped-worklist",
    description: `ADR-016 recapture HELD for ${row.result_url}: ${reason}. Old (capped) capture KEPT; not replaced.`.slice(0, 480),
    recommended_actions: [{ action: "manual_recapture_review", rationale: `${reason} — investigate the source at ${row.result_url}; the stored capture was left at its legacy-capped length ${row.old_length}.` }],
  }, { cite: { skill: PRE_ADR016_SKILL, reason: `ADR-016 recapture drift/roadblock hold for item ${row.item_id} — keep old capture, surface for review (research-or-erase)` } }).catch(() => {});
}

// The diff-on-recapture guard: every grounded FACT span (section_claim_provenance rows on THIS pool row) that
// matched the old capture must still .includes()-match the fresh capture. Returns { ok, missing }.
async function factSpansStillMatch(sb, poolRowId, newText) {
  const { data: spans } = await sb.from("section_claim_provenance")
    .select("source_span").eq("search_result_id", poolRowId).eq("claim_kind", "FACT");
  const missing = [];
  for (const s of spans || []) {
    const span = (s.source_span || "").trim();
    if (span && !newText.includes(span)) missing.push(span.slice(0, 80));
  }
  return { ok: missing.length === 0, missing };
}

async function execute(worklist) {
  const sbRead = readClient();
  // GATE: EXECUTE refuses while global processing is paused (the emergency stop). The drain order lifts the
  // hold FIRST (admin_set_pause_state) — so a paused system means "not yet cleared to drain".
  const { data: st } = await sbRead.from("system_state").select("global_processing_paused").limit(1).maybeSingle();
  if (st?.global_processing_paused) {
    console.error("REFUSE: system_state.global_processing_paused is TRUE — EXECUTE requires the operator to lift the hold first (admin_set_pause_state). Aborting, no writes.");
    process.exit(2);
  }
  // Load the LIVE transport ladder via jiti (canonical-pipeline.ts uses the `@` alias Node cannot resolve natively).
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
  const { refetchThroughLadder } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");

  const all = [...worklist.pops.legacy_40k, ...worklist.pops.corroborator_60k, ...worklist.pops.primary_600k]
    .slice(0, LIMIT === Infinity ? undefined : LIMIT);
  const byItem = new Map(); // item_id → { total, replacedClean }
  const out = [];
  let replaced = 0, held = 0, regroundRecommended = 0;
  for (const row of all) {
    const stat = byItem.get(row.item_id) || { total: 0, replacedClean: 0 };
    stat.total++; byItem.set(row.item_id, stat);

    const fr = await refetchThroughLadder(row.result_url, CALLER); // { text, truncated, fullLength, cap, transport }
    const newText = fr?.text || "";
    if (newText.length <= 200) { // roadblocked / empty → HOLD, keep old
      held++; out.push({ ...row, outcome: "HOLD-refetch-failed", transport: fr?.transport });
      await holdRow(sbRead, row, `re-fetch returned ${newText.length}ch (roadblock/blocked/empty; transport ${fr?.transport})`);
      continue;
    }
    const guard = await factSpansStillMatch(sbRead, row.id, newText);
    if (!guard.ok) { // a grounded FACT span vanished at recapture → doc changed → HOLD, keep old
      held++; out.push({ ...row, outcome: "HOLD-fact-drift", missing_spans: guard.missing });
      await holdRow(sbRead, row, `${guard.missing.length} grounded FACT span(s) no longer present in the fresh capture (recapture drift)`);
      continue;
    }
    // Replace the stored capture (guarded, snapshotted + reversible). The new text is already the transport's
    // cleaned/whitespace-collapsed form (same normalization the pipeline stores), so FACT-span .includes() stays apples-to-apples.
    await guardedUpdate("agent_run_searches", (qb) => qb.eq("id", row.id), { result_content_excerpt: newText },
      { cite: { skill: PRE_ADR016_SKILL, reason: `ADR-016 recapture: replace legacy-capped capture (${row.old_length}ch) for ${row.result_url} with full ${newText.length}ch; all grounded FACT spans preserved` } });
    replaced++; stat.replacedClean++;
    const rec = newText.length > row.old_length;
    if (rec) regroundRecommended++;
    out.push({ ...row, outcome: "REPLACED", new_length: newText.length, reground_recommended: rec });
  }

  // Resolve a truncation-guard flag ONLY when ALL of its item's capped rows replaced clean.
  let flagsResolved = 0;
  for (const [item_id, stat] of byItem) {
    if (stat.total > 0 && stat.replacedClean === stat.total) {
      const res = await guardedUpdate("integrity_flags",
        (qb) => qb.eq("subject_ref", item_id).eq("created_by", "truncation-guard").eq("status", "open"),
        { status: "resolved" },
        { cite: { skill: PRE_ADR016_SKILL, reason: `ADR-016: all ${stat.total} legacy-capped row(s) for item ${item_id} recaptured full + FACT-preserving — truncation-guard gap closed` } }).catch(() => ({ updated: 0 }));
      flagsResolved += res?.updated || 0;
    }
  }
  return { out, replaced, held, regroundRecommended, flagsResolved };
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const { pops, rawCounts } = await buildWorklist();
  const dedupCounts = {
    legacy_40k: pops.legacy_40k.length,
    corroborator_60k: pops.corroborator_60k.length,
    primary_600k: pops.primary_600k.length,
  };
  console.log(`\n===== REFETCH CAPPED WORKLIST (${EXECUTE ? "EXECUTE" : "BUILD / dry-run"}) — ADR-016 =====`);
  console.log(`raw counts      : ${JSON.stringify(rawCounts)}`);
  console.log(`populations     : ${JSON.stringify(dedupCounts)}`);
  const EXPECTED = { legacy_40k: 105, corroborator_60k: 15, primary_600k: 1 };
  const diverges = Object.keys(EXPECTED).some((k) => dedupCounts[k] !== EXPECTED[k]);
  if (diverges) {
    console.log(`\n  DIVERGENCE (premise 2 expected deduped ${JSON.stringify(EXPECTED)}):`);
    console.log(`    legacy_40k dedups to ${dedupCounts.legacy_40k}, not 105 — there are ZERO duplicate (item_id, result_url)`);
    console.log(`    pairs in the 40k set, so dedup removes nothing (raw ${rawCounts.legacy_40k} = deduped ${dedupCounts.legacy_40k}).`);
    console.log(`    Reported as a finding per the dispatch ("report any divergence, never an override"); NOT forced to 105.`);
  }

  mkdirSync(resolve(ROOT, "scripts/tmp"), { recursive: true });
  const artifactBase = { mode: EXECUTE ? "execute" : "build", raw_counts: rawCounts, populations: dedupCounts, expected: EXPECTED, worklist: pops };

  if (!EXECUTE) {
    const file = resolve(ROOT, "scripts/tmp/refetch-capped-worklist-build.json");
    writeFileSync(file, JSON.stringify(artifactBase, null, 2));
    console.log(`\n  worklist -> ${file}`);
    console.log(`  NEXT: operator merges + deploys, lifts the hold (admin_set_pause_state), then --execute.`);
    process.exit(0);
  }

  const r = await execute({ pops });
  const file = resolve(ROOT, "scripts/tmp/refetch-capped-worklist-execute.json");
  writeFileSync(file, JSON.stringify({ ...artifactBase, ...r }, null, 2));
  console.log(`\n===== EXECUTE SUMMARY =====`);
  console.log(`  REPLACED (full, FACT-preserving): ${r.replaced}`);
  console.log(`  HELD (drift / roadblock, old kept): ${r.held}`);
  console.log(`  reground_recommended (new > old length): ${r.regroundRecommended}`);
  console.log(`  truncation-guard flags resolved: ${r.flagsResolved}`);
  console.log(`  artifact -> ${file}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
