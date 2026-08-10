#!/usr/bin/env node
// analyze-corpus.mjs — PILLAR A3 / flywheel U2. Cluster the connection graph into themes, persist them,
// detect coverage gaps, and reflect deduped `coverage_gap` integrity_flags. $0: no LLM, no paid fetch —
// pure computation over data U0 (discover/backfill) and U1 (cluster.mjs) already produced.
//
// THIN ORCHESTRATOR, same posture as backfill-edges.mjs (U0): load real data -> hand it to the pure
// engines (cluster.mjs, gaps.mjs) -> persist via the guarded path (rule 015). No scoring/business logic
// lives here; every decision of substance is inside the pure, independently-tested src/lib/connections/
// modules this script wires together.
//
// READS the graph U0/U1 already established (item_cross_references), it does NOT re-run discovery —
// that stays backfill-edges.mjs's job. connection_themes is a CACHE of this pass (migration 253):
// every run REPLACES its full contents (guardedDelete-all + guardedInsertMany), never appends.
// connection_theme_runs is the append-only audit ledger (rule 15 — the execution record).
//
// Gap reflection mirrors the one existing guarded-path integrity_flags convention in this repo
// (scripts/verify/run-data-audit-lane.mjs's block-state reflect): read existing OPEN rows for this
// writer's namespace, dedup-before-insert on (category, subject_ref, created_by, status='open'), and
// — the completion that reflect applies at singleton scope and this applies per-gap — RESOLVE any open
// flag whose (subject_ref, created_by) is no longer in the freshly-computed gap set, so the flag table
// tracks the live computation each run instead of accumulating forever.
//
// Usage: node scripts/connections/analyze-corpus.mjs [--dry]
//   --dry   compute + report (themes, gaps), write nothing (default is to write)
// Exit 0 done · 1 a write failed verification · 2 no DB creds (cannot run here).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedDelete, guardedInsertMany, guardedInsert, guardedUpdate } from "../lib/db.mjs";
import { clusterGraph } from "../../src/lib/connections/cluster.mjs";
import { detectGaps } from "../../src/lib/connections/gaps.mjs";
import { surfaceOf } from "../../src/lib/surface-of.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("analyze-corpus: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

const DRY = process.argv.includes("--dry");
const CITE = {
  skill: "flywheel-build-plan-2026-08-10",
  reason: "U2 analyze-corpus: persist the U1 cluster pass to connection_themes and reflect coverage_gap findings (guarded path, rule 015).",
};
const GAP_NAMESPACE = "flywheel-gap:"; // created_by prefix — this writer's dedup/resolve namespace, never touches another writer's flags

const startedAt = new Date().toISOString();

// ---- 1. Load the real graph: verified, live items (the same population U0's backfill computed edges
// over) + the full item_cross_references edge set (any origin — a theme is "these items are connected",
// not "connected by discovery specifically"). ----
const items = await readAll(
  "intelligence_items",
  "id, item_type, jurisdiction_iso, added_date",
  { match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false) },
);
const edgeRows = await readAll("item_cross_references", "source_item_id, target_item_id, basis, score");

const nodes = items.map((it) => ({ id: it.id, item_type: it.item_type, dates: it.added_date }));
const edges = edgeRows.map((e) => ({ source: e.source_item_id, target: e.target_item_id, score: e.score, basis: e.basis }));
console.log(`analyze-corpus: ${nodes.length} live items, ${edges.length} edge rows loaded${DRY ? " (DRY RUN)" : ""}.`);

// ---- 2. Workspace profile jurisdictions — read the field directly (not via workspace/profile.ts,
// a .ts module with @/ path aliases this plain-ESM script can't resolve without a TS loader; same
// shape, single relevant field, zero added surface). Single-workspace today (one workspace_settings
// row) — take the first if present; degrade to {} (no home jurisdictions -> gaps.mjs fires nothing
// for type A) if the table is empty, never guess. ----
const wsRows = await readAll("workspace_settings", "jurisdiction_weights");
const jurisdictions = wsRows[0]?.jurisdiction_weights && typeof wsRows[0].jurisdiction_weights === "object" ? wsRows[0].jurisdiction_weights : {};
const jurisdictionsByMember = {};
for (const it of items) if (it.jurisdiction_iso) jurisdictionsByMember[it.id] = it.jurisdiction_iso;

// ---- 3. Cluster (U1) + detect gaps (U2), both pure. ----
const clustered = clusterGraph(nodes, edges, { surfaceOf: (t) => surfaceOf(t) });
const gaps = detectGaps(clustered.themes, { profile: { jurisdictions }, jurisdictionsByMember });

console.log(
  `CLUSTERED: ${clustered.themes.length} themes (${clustered.nodesClustered} nodes, ${clustered.edgesUsed} undirected edges, ` +
  `${clustered.rounds} label-propagation rounds).`,
);
console.log(`GAPS: ${gaps.length} detected (${["jurisdiction_span_gap", "surface_gap", "pivot_operations_gap"]
  .map((t) => `${t}=${gaps.filter((g) => g.type === t).length}`).join(", ")}).`);

if (DRY) {
  console.log("\nDRY RUN — nothing written. Re-run without --dry to apply.");
  process.exit(0);
}

// ---- 4. Persist: log a running run row, replace connection_themes, reflect gaps, close the run row. ----
const run = await guardedInsert("connection_theme_runs", {
  started_at: startedAt,
  status: "running",
  args: { dry: false },
  nodes_read: nodes.length,
  edges_read: edges.length,
}, { cite: CITE, select: "id" });
const runId = run.inserted.id;

try {
  const themeRows = clustered.themes.map((t) => ({
    id: t.id,
    member_ids: t.members,
    dominant_signals: t.dominantSignals,
    surfaces: t.surfaces,
    density: t.density,
    convergence: t.convergence,
    pivots: t.pivots,
  }));

  const priorThemeIds = (await readAll("connection_themes", "id")).map((r) => r.id);
  if (priorThemeIds.length) {
    await guardedDelete("connection_themes", priorThemeIds, { cite: CITE });
  }
  const insRes = themeRows.length
    ? await guardedInsertMany("connection_themes", themeRows, { cite: CITE, select: "id" })
    : { inserted: 0 };
  console.log(`PERSISTED: ${insRes.inserted} themes (replaced ${priorThemeIds.length} prior).`);

  // Gap reflection: dedup-before-insert + resolve-if-stale, scoped to this writer's created_by namespace
  // so it never touches an integrity_flags row another writer opened.
  const existingOpen = await readAll("integrity_flags", "id, subject_ref, created_by", {
    match: (q) => q.eq("category", "coverage_gap").eq("status", "open").like("created_by", `${GAP_NAMESPACE}%`),
  });
  const freshKeys = new Set(gaps.map((g) => `${g.subject_ref}|${GAP_NAMESPACE}${g.type}`));
  const existingKeys = new Set(existingOpen.map((r) => `${r.subject_ref}|${r.created_by}`));

  const newGapRows = gaps
    .filter((g) => !existingKeys.has(`${g.subject_ref}|${GAP_NAMESPACE}${g.type}`))
    .map((g) => ({
      category: g.category,
      subject_type: g.subject_type,
      subject_ref: g.subject_ref,
      description: g.description,
      recommended_actions: g.recommended_actions,
      status: "open",
      created_by: `${GAP_NAMESPACE}${g.type}`,
    }));
  const staleIds = existingOpen.filter((r) => !freshKeys.has(`${r.subject_ref}|${r.created_by}`)).map((r) => r.id);

  let gapsInserted = 0, gapsResolved = 0;
  if (newGapRows.length) {
    const gapRes = await guardedInsertMany("integrity_flags", newGapRows, { cite: CITE, select: "id" });
    gapsInserted = gapRes.inserted;
  }
  if (staleIds.length) {
    const resolveRes = await guardedUpdate(
      "integrity_flags",
      (qb) => qb.in("id", staleIds),
      { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "analyze-corpus.mjs", resolution_note: "gap no longer detected in the latest analyze-corpus pass" },
      { cite: CITE },
    );
    gapsResolved = resolveRes.updated;
  }
  console.log(`GAPS REFLECTED: ${gapsInserted} opened, ${gapsResolved} resolved (${gaps.length - newGapRows.length} already open, unchanged).`);

  await guardedUpdate(
    "connection_theme_runs",
    (qb) => qb.eq("id", runId),
    {
      finished_at: new Date().toISOString(),
      status: "ok",
      nodes_clustered: clustered.nodesClustered,
      edges_used: clustered.edgesUsed,
      themes_written: insRes.inserted,
      gaps_flagged: gaps.length,
      rounds: clustered.rounds,
    },
    { cite: CITE },
  );

  // Read-back verification (per the dispatch verification contract): themes table row count matches
  // what we just wrote, and the run row closed 'ok'.
  const verifyThemes = await readAll("connection_themes", "id");
  const verifyRun = await readAll("connection_theme_runs", "id,status", { match: (q) => q.eq("id", runId) });
  const ok = verifyThemes.length === insRes.inserted && verifyRun[0]?.status === "ok";
  console.log(`\nVERIFY: connection_themes row count == inserted (${verifyThemes.length}==${insRes.inserted}), run row status='ok' -> ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("analyze-corpus: FAILED —", e?.message || e);
  try {
    await guardedUpdate(
      "connection_theme_runs",
      (qb) => qb.eq("id", runId),
      { finished_at: new Date().toISOString(), status: "error", error_message: String(e?.message || e).slice(0, 2000) },
      { cite: CITE },
    );
  } catch { /* best-effort close-out; the thrown error above is the real signal */ }
  process.exit(1);
}
