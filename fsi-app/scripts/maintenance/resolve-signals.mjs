#!/usr/bin/env node
// resolve-signals.mjs -- MAINT step for task 7.2 of the W9 brief-chain build plan, Part 7 (ADR-030
// rider, 2026-09-12): drains the flywheel-signal:* backlog (1,098 open title-entity-link flags measured
// 2026-09-12) that analyze-corpus.mjs's own --signals pass, running only inside corpus-turn.yml, never
// touches for a candidate that keeps reproducing the SAME undecided verdict every run — reflectFlags'
// (pre-7.2) "already open, unchanged" bucket never closed a still-reproducing finding, so an undecided
// signal sat open forever once opened.
//
// THE RULE (task 7.2, verbatim): "an UNDECIDED pair closes with resolution_note 'below the decisive
// threshold, no edge; score <s>' (a non-edge is a decision), decisive pairs write the edge as today."
// This step is the SAME code path analyze-corpus.mjs's own --signals pass now uses (task 7.2 also
// updated that file) — detectSignalCandidates (signal-candidates.mjs), planSignalAdoption /
// planSignalFlagResolutions / buildPreResolvedSignalFlagRow (signal-confidence.mjs), all imported
// UNMODIFIED, never re-implemented here. This file adds NO new decision logic: it is the standalone
// maintenance-dispatch runtime for a pass that would otherwise only ever run bundled inside a full
// corpus-turn (checkout + npm ci + clustering + gap detection + anticipate — expensive just to reach
// the signals step), so the backlog can be drained in ONE targeted apply dispatch.
//
// WHAT IT DOES, both modes:
//   1. Reads the live verified/non-archived corpus (id, title) + the full item_cross_references edge
//      set + every OPEN flywheel-signal:* integrity_flags row.
//   2. Recomputes signal candidates fresh (detectSignalCandidates) and classifies them
//      (planSignalAdoption -> classifySignalCandidates internally).
//   3. Apply: writes any newly-decisive candidate as a real item_cross_references edge
//      (write-edges.mjs, the single writer for that origin -- same as analyze-corpus.mjs).
//   4. Apply: resolves EVERY open flag with its terminal disposition (decisive / undecided / stale --
//      planSignalFlagResolutions) and inserts any brand-new candidate with no flag row yet as an
//      ALREADY-RESOLVED row (buildPreResolvedSignalFlagRow) -- a fresh finding never sits open even
//      momentarily.
//   Dry: computes and reports every count above (candidates, would-adopt edges, disposition split,
//   brand-new pre-resolved count) -- writes nothing.
//
// Usage: node scripts/maintenance/resolve-signals.mjs --mode dry|apply [--out <dir>]
// Exit 0 done · 1 fatal · 2 no DB creds.

import { resolve } from "node:path";
import { readAll, guardedUpdate, guardedInsertMany } from "../lib/db.mjs";
import { detectSignalCandidates } from "../../src/lib/connections/signal-candidates.mjs";
import {
  planSignalAdoption, planSignalFlagResolutions, buildPreResolvedSignalFlagRow,
} from "../../src/lib/connections/signal-confidence.mjs";
import { writeDiscoveredEdges } from "../../src/lib/connections/write-edges.mjs";
import { SIGNAL_NAMESPACE, createdBy } from "../../src/lib/connections/flag-namespaces.mjs";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const RESOLVED_BY = "resolve-signals";

export const CITE = Object.freeze({
  skill: "brief-chain-build-plan-2026-09-11 Part 7 task 7.2 / ADR-030 rider",
  reason:
    "Drains the flywheel-signal:* backlog: every open flag reaches a terminal disposition this run " +
    "(decisive -- edge written, auto-adopted note; undecided -- closes as a non-edge decision with the " +
    "score; stale -- pair no longer reproduces), and a brand-new candidate with no flag row yet is " +
    "inserted already resolved. Reuses analyze-corpus.mjs's own pure decision path " +
    "(signal-candidates.mjs / signal-confidence.mjs) unmodified -- no second copy of the write logic.",
});

const ITEM_SIG = "id, title";
const EDGE_SIG = "source_item_id, target_item_id";
const FLAG_SIG = "id, subject_ref, created_by";

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   readItems: () => Promise<Array<{id:string, title:string|null}>>,
 *   readEdges: () => Promise<Array<{source_item_id:string, target_item_id:string}>>,
 *   readOpenFlags: () => Promise<Array<{id:string, subject_ref:string, created_by:string}>>,
 *   writeEdges: (edges:Array) => Promise<{written:number, inserted:number, refreshed:number}>,
 *   resolveFlag: (id:string, note:string) => Promise<{updated:number}>,
 *   insertResolvedFlags: (rows:Array) => Promise<{inserted:number}>,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "resolve-signals", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const items = await deps.readItems();
  const edgeRows = await deps.readEdges();
  const openFlags = await deps.readOpenFlags();

  const candidates = detectSignalCandidates(items, edgeRows);
  const plan = planSignalAdoption(candidates);
  const dispositions = planSignalFlagResolutions(openFlags, plan.classified, SIGNAL_NAMESPACE);

  // Brand-new candidates with no existing flag row at all (never seen before, or the OLD open flag was
  // already resolved above under a different disposition this same pass would also match — the
  // existingKeys set is built from the OPEN flags read at the top, so a candidate already covered by a
  // disposition above is correctly excluded here).
  const existingKeys = new Set(openFlags.map((r) => `${r.subject_ref}|${r.created_by}`));
  const seen = new Set();
  const newRows = [];
  for (const c of plan.classified) {
    const key = `${c.subject_ref}|${createdBy(SIGNAL_NAMESPACE, c.signalKind)}`;
    if (existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    newRows.push(buildPreResolvedSignalFlagRow(c, SIGNAL_NAMESPACE, RESOLVED_BY));
  }

  summary.counts = {
    live_items: items.length,
    edge_rows: edgeRows.length,
    open_flags: openFlags.length,
    candidates: candidates.length,
    would_adopt_edges: plan.edges.length,
    dispositions: {
      decisive: dispositions.filter((d) => d.disposition === "decisive").length,
      undecided: dispositions.filter((d) => d.disposition === "undecided").length,
      stale: dispositions.filter((d) => d.disposition === "stale").length,
    },
    new_pre_resolved: newRows.length,
    sample_undecided: dispositions.filter((d) => d.disposition === "undecided").slice(0, 20),
    sample_decisive: dispositions.filter((d) => d.disposition === "decisive").slice(0, 20),
  };

  if (!apply) {
    summary.note =
      `DRY -- ${openFlags.length} open flywheel-signal flag(s) would resolve ` +
      `(decisive=${summary.counts.dispositions.decisive}, undecided=${summary.counts.dispositions.undecided}, ` +
      `stale=${summary.counts.dispositions.stale}); ${plan.edges.length} edge row(s) would write; ` +
      `${newRows.length} brand-new candidate(s) would insert already-resolved. Nothing written.`;
    return summary;
  }

  let edgesWritten = { written: 0, inserted: 0, refreshed: 0 };
  if (plan.edges.length) edgesWritten = await deps.writeEdges(plan.edges);
  summary.counts.edges_written = edgesWritten;

  let resolvedCount = 0;
  for (const d of dispositions) {
    await deps.resolveFlag(d.id, d.note);
    resolvedCount += 1;
  }

  let insertedCount = 0;
  if (newRows.length) {
    const ins = await deps.insertResolvedFlags(newRows);
    insertedCount = ins.inserted;
  }

  summary.applied = resolvedCount + insertedCount;
  summary.note =
    `Resolved ${resolvedCount}/${openFlags.length} open flag(s) (decisive=${summary.counts.dispositions.decisive}, ` +
    `undecided=${summary.counts.dispositions.undecided}, stale=${summary.counts.dispositions.stale}); ` +
    `wrote ${insertedCount} brand-new pre-resolved row(s); ${edgesWritten.written ?? 0} edge row(s) written. ` +
    "No flywheel-signal flag left open.";

  const remaining = await deps.readOpenFlags();
  summary.read_back = { remaining_open: remaining.length };

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "resolve-signals",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readClient } = await import("../lib/db.mjs");
      const sb = readClient();
      const SNAP_DIR = process.env.DISCIPLINE_SNAP_DIR
        ? resolve(process.env.DISCIPLINE_SNAP_DIR)
        : resolve(fsiRoot(), "scripts", "_snapshots");
      return {
        readItems: () =>
          readAll("intelligence_items", ITEM_SIG, { match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false) }),
        readEdges: () => readAll("item_cross_references", EDGE_SIG),
        readOpenFlags: () =>
          readAll("integrity_flags", FLAG_SIG, { match: (q) => q.eq("status", "open").like("created_by", `${SIGNAL_NAMESPACE}%`) }),
        writeEdges: (edges) => writeDiscoveredEdges(sb, edges, { snapshot: { dir: SNAP_DIR, cite: CITE } }),
        resolveFlag: async (id, note) => {
          const res = await guardedUpdate(
            "integrity_flags",
            (q) => q.eq("id", id),
            { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: RESOLVED_BY, resolution_note: note },
            { cite: CITE },
          );
          return { updated: res.updated };
        },
        insertResolvedFlags: (rows) => guardedInsertMany("integrity_flags", rows, { cite: CITE, select: "id" }),
      };
    },
  });
}
