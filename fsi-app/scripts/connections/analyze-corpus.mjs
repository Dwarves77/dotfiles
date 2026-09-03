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
// writer's namespace, dedup-before-insert on (subject_ref, created_by, status='open'), and — the
// completion that reflect applies at singleton scope and this applies per-finding — RESOLVE any open
// flag whose (subject_ref, created_by) is no longer in the freshly-computed set, so the flag table
// tracks the live computation each run instead of accumulating forever. reflectFlags() below is that
// convention generalized (extracted 2026-09, flag-namespaces refactor) to the THREE producers that now
// share it: gap detection (U2), anticipated-coverage detection (U5), and signal-candidate detection
// (L4) — each owns a disjoint namespace (flag-namespaces.mjs) so one writer's dedup/resolve scan can
// never touch another's rows.
//
// U5 (anticipate) reads item_forward_events (migration 274/275) + this same run's already-loaded
// items for topic/instrument context — no new corpus query, per anticipate.mjs's own "no fabrication"
// contract. L4 (signals) is BEHIND --signals (opt-in): it widens the items read to include `title`; a
// default run (no --signals) is byte-identical to before this pass existed.
//
// L4 AUTO-ADOPTION (operator ruling 2026-09-03, supersedes the original "operator review only, never
// auto-adopted" posture — spec 08 §Loop B forbids a human gate in the flywheel path, and 930 open L4
// flags with nobody reviewing them meant the signals could never become edges). signal-confidence.mjs
// (pure, tested there) draws the line from each candidate's own evidence: a DECISIVE candidate is
// written as a real item_cross_references edge through write-edges.mjs (origin='provenance_discovery' —
// the closest CHECK-legal value; the CHECK on item_cross_references.origin, migration 252, admits only
// 'manual'|'agent_semantic'|'entity_extraction'|'provenance_discovery' — a bare 'signal' value is not
// legal and this lane does not add one; write-edges.mjs is already THE writer this origin belongs to).
// An UNDECIDED candidate keeps the pre-existing behavior exactly: an integrity_flags candidate for
// operator review, never auto-adopted. Any EXISTING open flag for a candidate that now classifies
// decisive is resolved in this same pass (resolution_note='auto-adopted:signal:<kind>:<weight>',
// resolved_by='analyze-corpus.mjs') — the audit trail a silent promotion would otherwise lose.
//
// F6 (theme-delta) captures the PRIOR theme set (id + member_ids) before the guardedDelete-all this
// file has always performed, diffs it against the freshly clustered set, and attaches the digest onto
// THIS run's connection_theme_runs.theme_delta column (migration 276) — see the persist step below.
// (Prior to migration 276 the digest rode inside the already-JSONB `args` column as `args.theme_delta`;
// that was a documented placeholder — args is "the CLI args the pass ran with", not a result — and
// migration 276 gives the digest its own durable column. Clean cutover: no dual-write, no read fallback
// to args.theme_delta for old rows.)
//
// Usage: node scripts/connections/analyze-corpus.mjs [--dry] [--signals]
//   --dry      compute + report (themes, gaps, anticipated targets, signal candidates — including the
//              would_adopt/would_flag/would_resolve split), write nothing (default is to write)
//   --signals  ALSO run the L4 signal-candidate pass (opt-in; omitted by default so a normal run is
//              unchanged by this pass's existence). Decisive candidates are written as edges and their
//              stale flags resolved; undecided candidates are reflected as integrity_flags as before.
// Exit 0 done · 1 a write failed verification · 2 no DB creds (cannot run here).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { readAll, guardedDelete, guardedInsertMany, guardedInsert, guardedUpdate } from "../lib/db.mjs";
import { clusterGraph } from "../../src/lib/connections/cluster.mjs";
import { detectGaps } from "../../src/lib/connections/gaps.mjs";
import { computeAnticipatedTargets } from "../../src/lib/connections/anticipate.mjs";
import { diffThemes } from "../../src/lib/connections/theme-delta.mjs";
import { detectSignalCandidates } from "../../src/lib/connections/signal-candidates.mjs";
import { planSignalAdoption, groupStaleFlagsForResolution } from "../../src/lib/connections/signal-confidence.mjs";
import { writeDiscoveredEdges } from "../../src/lib/connections/write-edges.mjs";
import { GAP_NAMESPACE, ANTICIPATE_NAMESPACE, SIGNAL_NAMESPACE, createdBy } from "../../src/lib/connections/flag-namespaces.mjs";
import { surfaceOf } from "../../src/lib/surface-of.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("analyze-corpus: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

const DRY = process.argv.includes("--dry");
const RUN_SIGNALS = process.argv.includes("--signals");
const CITE = {
  skill: "flywheel-build-plan-2026-08-10",
  reason: "U2/U5/F6/L4 analyze-corpus: persist the U1 cluster pass, capture the theme delta, and reflect coverage_gap / anticipated-coverage / signal-candidate findings (guarded path, rule 015).",
};

// write-edges.mjs deliberately RECEIVES its client rather than constructing one (own header: "stays
// import-light and pure of secrets") — same posture backfill-edges.mjs uses for the identical reason.
// Built lazily (only when a --signals --apply run actually has a decisive edge to write) so a --dry or
// no-signals run never constructs a write-capable client it does not use.
const SNAP_DIR = process.env.DISCIPLINE_SNAP_DIR ? resolve(process.env.DISCIPLINE_SNAP_DIR) : resolve(ROOT, "scripts", "_snapshots");
function writeClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/**
 * Dedup-before-insert / resolve-if-stale integrity_flags reflection for ONE producer's namespace.
 * See file header — this is the U2 gap-reflection convention, generalized to gaps/anticipate/signals.
 * @param {string} namespace - one of flag-namespaces.mjs's *_NAMESPACE constants
 * @param {Array<{subjectRef:string, row:object}>} fresh - `row` is the full integrity_flags insert
 *   payload for this finding (category, subject_type, subject_ref, description, recommended_actions,
 *   status:'open', created_by — created_by MUST be inside `namespace`, per the isolation contract).
 * @returns {Promise<{inserted:number, resolved:number, unchanged:number}>}
 */
async function reflectFlags(namespace, fresh) {
  const existingOpen = await readAll("integrity_flags", "id, subject_ref, created_by", {
    match: (q) => q.eq("status", "open").like("created_by", `${namespace}%`),
  });
  const freshKeys = new Set(fresh.map((f) => `${f.subjectRef}|${f.row.created_by}`));
  const existingKeys = new Set(existingOpen.map((r) => `${r.subject_ref}|${r.created_by}`));

  const newRows = fresh.filter((f) => !existingKeys.has(`${f.subjectRef}|${f.row.created_by}`)).map((f) => f.row);
  const staleIds = existingOpen.filter((r) => !freshKeys.has(`${r.subject_ref}|${r.created_by}`)).map((r) => r.id);

  let inserted = 0, resolved = 0;
  if (newRows.length) {
    const res = await guardedInsertMany("integrity_flags", newRows, { cite: CITE, select: "id" });
    inserted = res.inserted;
  }
  if (staleIds.length) {
    const res = await guardedUpdate(
      "integrity_flags",
      (qb) => qb.in("id", staleIds),
      { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "analyze-corpus.mjs", resolution_note: `${namespace} finding no longer detected in the latest analyze-corpus pass` },
      { cite: CITE },
    );
    resolved = res.updated;
  }
  return { inserted, resolved, unchanged: fresh.length - newRows.length };
}

const startedAt = new Date().toISOString();

// ---- 1. Load the real graph: verified, live items (the same population U0's backfill computed edges
// over) + the full item_cross_references edge set (any origin — a theme is "these items are connected",
// not "connected by discovery specifically"). Columns widened beyond U2's original set: topic_tags +
// canonical_instrument_key feed U5 (anticipate)'s coverage-presence measurement; title feeds L4
// (signals, only read when --signals is passed, but loaded unconditionally — one query, not two —
// same "no new query" posture anticipate.mjs's own header documents). ----
const items = await readAll(
  "intelligence_items",
  "id, item_type, jurisdiction_iso, added_date, title, topic_tags, canonical_instrument_key",
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

// ---- 3b. U5 — anticipated-coverage targets from item_forward_events (migration 274/275). Reads the
// SAME already-loaded `items` for topic/instrument context (no new corpus query); the forward-events
// read itself is new (this pass's only new query) since analyze-corpus never touched that table before.
const forwardEvents = await readAll(
  "item_forward_events",
  "id, intelligence_item_id, event_date, date_precision, event_kind, obligation_text, source_span, confidence",
);
const itemTopics = {}, itemInstrumentKeys = {};
for (const it of items) {
  itemTopics[it.id] = Array.isArray(it.topic_tags) ? it.topic_tags : [];
  if (it.canonical_instrument_key) itemInstrumentKeys[it.id] = it.canonical_instrument_key;
}
const anticipated = computeAnticipatedTargets(forwardEvents, { itemTopics, itemInstrumentKeys });
console.log(
  `ANTICIPATE: ${anticipated.length} target(s) from ${forwardEvents.length} forward event(s) ` +
  `(no_coverage=${anticipated.filter((t) => t.reason === "no_coverage").length}, ` +
  `thin_coverage=${anticipated.filter((t) => t.reason === "thin_coverage").length}).`,
);

// ---- 3c. L4 — signal candidates, BEHIND --signals (opt-in; a default run never computes, writes, or
// reflects these). Reads the SAME already-loaded `items` (title) + `edgeRows` — no new query either
// way. signalPlan (signal-confidence.mjs, pure) splits candidates decisive/undecided and builds the
// edges the decisive set implies — see this file's header and that module's own for the evidence rule. ----
const signalCandidates = RUN_SIGNALS ? detectSignalCandidates(items, edgeRows) : [];
const signalPlan = RUN_SIGNALS ? planSignalAdoption(signalCandidates) : { classified: [], decisive: [], undecided: [], edges: [] };
// would_resolve: existing OPEN L4 flags whose (subject_ref, created_by) now classifies decisive — read
// unconditionally under --signals (both --dry, to report the split, and apply, to actually resolve them).
const existingOpenSignalFlags = RUN_SIGNALS
  ? await readAll("integrity_flags", "id, subject_ref, created_by", { match: (q) => q.eq("status", "open").like("created_by", `${SIGNAL_NAMESPACE}%`) })
  : [];
const decisiveFlagKeys = new Set(signalPlan.decisive.map((c) => `${c.subject_ref}|${createdBy(SIGNAL_NAMESPACE, c.signalKind)}`));
const flagsToAutoResolve = existingOpenSignalFlags.filter((r) => decisiveFlagKeys.has(`${r.subject_ref}|${r.created_by}`));
if (RUN_SIGNALS) {
  console.log(
    `SIGNALS: ${signalCandidates.length} candidate(s) ` +
    `(shared_regulation_identifier=${signalCandidates.filter((c) => c.signalKind === "shared_regulation_identifier").length}, ` +
    `shared_title_entity=${signalCandidates.filter((c) => c.signalKind === "shared_title_entity").length}) — ` +
    `would_adopt=${signalPlan.decisive.length} (${signalPlan.edges.length} edge row(s)) would_flag=${signalPlan.undecided.length} ` +
    `would_resolve=${flagsToAutoResolve.length} stale open flag(s) (2026-09-03 auto-adoption rule; see signal-confidence.mjs).`,
  );
}

if (DRY) {
  console.log("\nDRY RUN — nothing written. Re-run without --dry to apply.");
  process.exit(0);
}

// ---- 4. Persist: log a running run row, replace connection_themes, reflect gaps/anticipate/signals,
// capture the theme delta, close the run row. ----
const run = await guardedInsert("connection_theme_runs", {
  started_at: startedAt,
  status: "running",
  args: { dry: false, signals: RUN_SIGNALS },
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

  // F6 (theme-delta): capture the PRIOR theme set BEFORE the wholesale replace, so history survives
  // the guardedDelete-all this pass has always performed (migration 253's own "not append-only" note).
  const priorThemesFull = await readAll("connection_themes", "id, member_ids");
  const priorThemeIds = priorThemesFull.map((r) => r.id);
  if (priorThemeIds.length) {
    await guardedDelete("connection_themes", priorThemeIds, { cite: CITE });
  }
  const insRes = themeRows.length
    ? await guardedInsertMany("connection_themes", themeRows, { cite: CITE, select: "id" })
    : { inserted: 0 };
  console.log(`PERSISTED: ${insRes.inserted} themes (replaced ${priorThemeIds.length} prior).`);

  const themeDelta = diffThemes(priorThemesFull, clustered.themes);
  console.log(
    `THEME DELTA: persisted=${themeDelta.summary.persisted} renamed=${themeDelta.summary.renamed} ` +
    `split=${themeDelta.summary.split} merged=${themeDelta.summary.merged} ` +
    `dissolved=${themeDelta.summary.dissolved} appeared=${themeDelta.summary.appeared}.`,
  );

  // Gap reflection (U2).
  const gapFindings = gaps.map((g) => ({
    subjectRef: g.subject_ref,
    row: {
      category: g.category, subject_type: g.subject_type, subject_ref: g.subject_ref,
      description: g.description, recommended_actions: g.recommended_actions,
      status: "open", created_by: createdBy(GAP_NAMESPACE, g.type),
    },
  }));
  const gapResult = await reflectFlags(GAP_NAMESPACE, gapFindings);
  console.log(`GAPS REFLECTED: ${gapResult.inserted} opened, ${gapResult.resolved} resolved (${gapResult.unchanged} already open, unchanged).`);

  // Anticipated-coverage reflection (U5). category reuses 'coverage_gap' — the closest existing legal
  // value (integrity_flags.category CHECK, migrations 048/050) — distinguished from U2's gaps by the
  // ANTICIPATE_NAMESPACE created_by prefix, never by category.
  const anticipateFindings = anticipated.map((t) => ({
    subjectRef: t.subject_ref,
    row: {
      category: "coverage_gap", subject_type: "system", subject_ref: t.subject_ref,
      description: t.description,
      recommended_actions: ["Confirm whether dedicated coverage of this upcoming obligation is warranted before the date arrives."],
      status: "open", created_by: createdBy(ANTICIPATE_NAMESPACE, t.reason),
    },
  }));
  const anticipateResult = await reflectFlags(ANTICIPATE_NAMESPACE, anticipateFindings);
  console.log(`ANTICIPATE REFLECTED: ${anticipateResult.inserted} opened, ${anticipateResult.resolved} resolved (${anticipateResult.unchanged} already open, unchanged).`);

  // Signal-candidate handling (L4) — only when --signals was passed; otherwise this namespace is left
  // untouched (no write call at all — a default run cannot resolve, insert into, or write edges from it).
  // 2026-09-03 auto-adoption rule (this file's header + signal-confidence.mjs): DECISIVE candidates
  // become real item_cross_references edges (write-edges.mjs, the single writer for that origin) and
  // any of their stale open flags are resolved with an auto-adopted audit trail; UNDECIDED candidates
  // keep the pre-existing reflect-as-flag behavior exactly.
  let signalResult = { inserted: 0, resolved: 0, unchanged: 0 };
  let signalEdgesWritten = { written: 0, inserted: 0, refreshed: 0, skippedForeignOrigin: 0, failedChunks: 0, snapshot: null };
  let signalAutoResolved = 0;
  if (RUN_SIGNALS) {
    if (signalPlan.edges.length) {
      signalEdgesWritten = await writeDiscoveredEdges(writeClient(), signalPlan.edges, { snapshot: { dir: SNAP_DIR, cite: CITE } });
      console.log(
        `SIGNAL EDGES WRITTEN: ${signalEdgesWritten.written} row(s) (${signalEdgesWritten.inserted} new, ${signalEdgesWritten.refreshed} refreshed); ` +
        `${signalEdgesWritten.skippedForeignOrigin} skipped (owned by another origin); ${signalEdgesWritten.failedChunks} chunk failure(s).`,
      );
    }
    if (flagsToAutoResolve.length) {
      const groups = groupStaleFlagsForResolution(flagsToAutoResolve, SIGNAL_NAMESPACE);
      for (const g of groups) {
        const res = await guardedUpdate(
          "integrity_flags",
          (qb) => qb.in("id", g.ids),
          { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "analyze-corpus.mjs", resolution_note: g.resolutionNote },
          { cite: CITE },
        );
        signalAutoResolved += res.updated;
      }
      console.log(`SIGNALS AUTO-RESOLVED: ${signalAutoResolved} stale open flag(s) (candidate now writes as a decisive edge).`);
    }

    const signalFindings = signalPlan.undecided.map((c) => ({
      subjectRef: c.subject_ref,
      row: {
        // 'data_quality' — closest existing legal category (metadata/text the platform holds but
        // discovery's basis set does not use); operator review only — the decisive residue above is
        // what auto-adopts, this is the undecidable remainder (see signal-confidence.mjs).
        category: "data_quality", subject_type: "system", subject_ref: c.subject_ref,
        description: c.description,
        recommended_actions: ["Operator review only — this candidate did not reach auto-adoption confidence (signal-confidence.mjs)."],
        status: "open", created_by: createdBy(SIGNAL_NAMESPACE, c.signalKind),
      },
    }));
    signalResult = await reflectFlags(SIGNAL_NAMESPACE, signalFindings);
    console.log(`SIGNALS REFLECTED: ${signalResult.inserted} opened, ${signalResult.resolved} resolved (${signalResult.unchanged} already open, unchanged).`);
  }

  // F6: attach the theme-delta digest to THIS run's ledger row via its own column (migration 276 —
  // connection_theme_runs.theme_delta jsonb, nullable). `args` reverts to holding only the run's CLI
  // args, matching its migration-253 documented meaning.
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
      args: { dry: false, signals: RUN_SIGNALS },
      theme_delta: themeDelta,
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
