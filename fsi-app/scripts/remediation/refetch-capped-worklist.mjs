#!/usr/bin/env node
// SHARED-WRITER: integrity_flags, agent_run_searches
// refetch-capped-worklist.mjs — ADR-016 storage-side uncap: re-capture the legacy STORAGE-CAPPED pool rows in
// FULL, so the permanent slice the retired PRIMARY_MAX_CHARS / CORROBORATOR_MAX_CHARS caps baked into
// agent_run_searches.result_content is undone. The caps are gone in code (generation-config.ts); this
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
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Guarded (lane L41, 2026-09-17): the maintenance.yml dispatch injects the env and carries no .env.local, and
// the unguarded load crashed the dry BUILD run with ENOENT before it read a row (the same defect holdings-audit
// fixed for itself). Fitness F48 keeps every live script on this form.
loadLocalEnvFile();
const EXECUTE = process.argv.includes("--execute");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();

// F16 signed caller — this re-fetch is a Unit-3 remediation, already in AUTHORIZED_HOLD_CALLERS
// (src/lib/sources/fetch-hold.mjs), so it passes isAuthorizedHoldCaller at drain time with NO manifest change.
const CALLER = "unit3-remediation";
const CUTOFF = "2026-06-28"; // premise-2 legacy-cap date boundary
const PRE_ADR016_SKILL = "remediation-discipline";

// ── The three legacy populations, EXACT premise-2 predicates (a row belongs to exactly one — the length
//    ranges are disjoint). The length is `agent_run_searches.result_chars` (migration 322, trigger-maintained,
//    backfilled by 323), NEVER the length of `result_content`: reading `result_content` for every row decompressed
//    ~239 MB of stored text per run and hit the statement timeout (maintenance chain fire 2026-10-07, F-RED-1;
//    `paginated read failed at offset 0: canceling statement due to statement timeout`). `searched_at` gates only
//    legacy_40k. A NULL result_chars (no content) never matches a class.
//
// SERVER FILTER BOUNDS (lane OPS-1, coordinator ruling 2026-10-07). result_chars is the Postgres character count,
// the old test was the JS UTF-16 length, and the two differ for characters outside the Basic Multilingual Plane.
// So the server-side prefilter is the class ranges WIDENED by 1 percent on each side (lower bound floored, upper
// bound ceiled), so a row classify() would place in a class is never excluded by the server; classify() then makes
// the final placement from the same result_chars, so server and client agree by construction.
//   class             exact range        widened server range
//   legacy_40k        39900..40000       39501..40400
//   corroborator_60k  59900..60000       59301..60600   (60000 itself, and 59900..59999)
//   primary_600k      600000             594000..606000
export const CLASS_RANGES = {
  legacy_40k: [39900, 40000],
  corroborator_60k: [59900, 60000],
  primary_600k: [600000, 600000],
};
export const SERVER_RANGES = Object.fromEntries(
  Object.entries(CLASS_RANGES).map(([k, [lo, hi]]) => [k, [Math.floor(lo * 0.99), Math.ceil(hi * 1.01)]]),
);
/** PostgREST `.or()` filter string over result_chars from SERVER_RANGES. */
export const SERVER_OR_FILTER = Object.values(SERVER_RANGES)
  .map(([lo, hi]) => `and(result_chars.gte.${lo},result_chars.lte.${hi})`)
  .join(",");
export const WORKLIST_COLUMNS = "id, intelligence_item_id, result_url, search_query, searched_at, result_index, result_chars";

export function classify(row) {
  const len = Number.isInteger(row.result_chars) ? row.result_chars : -1;
  const [l40lo, l40hi] = CLASS_RANGES.legacy_40k;
  const [c60lo, c60hi] = CLASS_RANGES.corroborator_60k;
  if (row.searched_at && row.searched_at < CUTOFF && len >= l40lo && len <= l40hi) return "legacy_40k";
  if (len === CLASS_RANGES.primary_600k[0]) return "primary_600k";
  if (len >= c60lo && len <= c60hi) return "corroborator_60k";
  return null;
}

// Dedup key: (item_id, result_url) per the dispatch. Returns a Map key → first row seen (stable).
const dedupKey = (r) => `${r.intelligence_item_id}|${r.result_url}`;

export async function buildWorklist(readAllFn = readAll) {
  // READ-ONLY, paged past the 1000-row cap (readAll). Never selects result_content: the length is the stored
  // result_chars, prefiltered server-side on the widened SERVER_RANGES (see the header above).
  const rows = await readAllFn("agent_run_searches", WORKLIST_COLUMNS, { match: (q) => q.or(SERVER_OR_FILTER) });
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
      old_length: r.result_chars,
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
// matched the old capture must still .includes()-match the fresh capture. Returns { ok, missing, error }.
// ERROR-SWALLOW GUARD (agent/run error-swallow post-mortem, CLAUDE.md): the `error` is destructured and checked.
// If it were dropped, a failed read would leave `spans` undefined, the loop would iterate nothing, and the guard
// would PASS VACUOUSLY — an UNGUARDED replacement over a query failure. On any query error the row is treated as
// un-verifiable (ok:false + error), so the caller HOLDS and keeps the old capture rather than replacing blind.
async function factSpansStillMatch(sb, poolRowId, newText) {
  const { data: spans, error } = await sb.from("section_claim_provenance")
    .select("source_span").eq("search_result_id", poolRowId).eq("claim_kind", "FACT");
  if (error) return { ok: false, missing: [], error: error.message };
  const missing = [];
  for (const s of spans || []) {
    const span = (s.source_span || "").trim();
    if (span && !newText.includes(span)) missing.push(span.slice(0, 80));
  }
  return { ok: missing.length === 0, missing, error: null };
}

async function execute(worklist) {
  const sbRead = readClient();
  // GATE: EXECUTE refuses while global processing is paused (the emergency stop). The drain order lifts the
  // hold FIRST (admin_set_pause_state) — so a paused system means "not yet cleared to drain".
  // ERROR-SWALLOW GUARD (agent/run post-mortem) on the MOST safety-critical read: a dropped `error` here would
  // leave `st` undefined, `st?.global_processing_paused` falsy, and EXECUTE would sail past the emergency stop.
  // Fail CLOSED — if the pause state cannot be read, refuse to proceed (same posture as if it were paused).
  const { data: st, error: stErr } = await sbRead.from("system_state").select("global_processing_paused").limit(1).maybeSingle();
  if (stErr) {
    console.error(`REFUSE: could not read system_state.global_processing_paused (${stErr.message}) — failing CLOSED, EXECUTE aborts, no writes.`);
    process.exit(2);
  }
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
    await guardedUpdate("agent_run_searches", (qb) => qb.eq("id", row.id), { result_content: newText },
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

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
