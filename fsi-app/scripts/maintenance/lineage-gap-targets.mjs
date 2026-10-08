#!/usr/bin/env node
// SHARED-WRITER: integrity_flags
// lineage-gap-targets.mjs -- consumer of the 'lineage-gap:absent-parent' integrity_flags namespace (lane
// s2a-typed-edges, 2026-10-04). planLinkWrites (src/lib/entities/entity-resolve.mjs) opens one such flag
// whenever an item's text says it implements, amends or depends on an instrument that resolves to NO held
// item; until this step nothing read those flags, so each sat open whether or not its parent was later
// acquired, and the missing parents were never turned into a list anything could act on.
//
// WHAT IT DOES (pure planning is planLineageGapTargets in src/lib/entities/lineage-backfill.mjs; this file
// is the I/O wrapper, per runCli's contract in lib/cli.mjs):
//   1. reads every OPEN lineage-gap flag and the held (non-archived) corpus;
//   2. writes <out>/lineage-gap-targets.json: the discovery target list (identifier, citing item,
//      relationship) for parents still absent, the flags now resolvable, and any residue with its reason;
//   3. in apply mode, resolves each flag whose every named parent is now held (resolution_note names the
//      held parent item ids), through the guarded write path (rule 015). The typed edge itself is written
//      by the linker (the brief-apply lineage step, or backfill-lineage-edges) on its next pass over the
//      citing item; the artifact lists those citing item ids as `relink_item_ids` so the follow-up is data,
//      not memory. No flag waits on a person: a held parent resolves by rule, an absent parent is a target
//      by rule, an unparseable flag is residue with its reason.
// Dry by default (--mode apply to write). The target list is an artifact, not a database write, so it is
// produced in both modes. Reads only the two tables named; no network, no model call.
//
// NOT registered in maintenance.yml by this lane (another lane is restructuring the maintenance runbook);
// registration is the coordinator's follow-up.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readAll, guardedUpdateByIds } from "../lib/db.mjs";
import { planLineageGapTargets, LINEAGE_GAP_CREATED_BY } from "../../src/lib/entities/lineage-backfill.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const STEP = "lineage-gap-targets";
export const ARTIFACT_NAME = "lineage-gap-targets.json";
export const RESOLVED_BY = STEP;

export const CITE = Object.freeze({
  skill: "s2a-typed-edges 2026-10-04 lineage-gap consumer",
  reason:
    "Resolve 'lineage-gap:absent-parent' integrity_flags whose every named parent instrument is now held in " +
    "the corpus: the flag asked for the parent to be acquired and it has been. The record stays (resolved, " +
    "never deleted); flags whose parent is still absent stay open and are listed as discovery targets.",
});

const FLAG_COLUMNS = "id, subject_ref, created_by, description, recommended_actions, status";

/** Pure: the resolution note for one resolvable flag. */
export function buildResolutionNote(entry, todayIso) {
  const parents = entry.parents
    .map((p) => `${p.identifier} -> ${p.parent_item_ids.join("/")}`)
    .join("; ");
  return `parent instrument(s) now held on ${todayIso}: ${parents}. Typed edge is written by the linker's next pass over ${entry.citing_item_id}.`;
}

/** Real default artifact writer; injectable for tests. */
function writeArtifactFile(outDir, name, json) {
  mkdirSync(outDir, { recursive: true });
  const file = resolve(outDir, name);
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  return file;
}

export async function main({ mode = "dry", out = null } = {}, deps) {
  const apply = mode === "apply";
  const todayIso = deps.todayIso ?? new Date().toISOString().slice(0, 10);
  const summary = { step: STEP, mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const flags = await deps.readOpenFlags();
  const corpus = await deps.readCorpus();
  const plan = planLineageGapTargets(flags, corpus);
  const relinkItemIds = [...new Set(plan.resolvable.map((r) => r.citing_item_id))].sort();

  summary.counts = {
    open_flags: flags.length,
    corpus_items: corpus.length,
    targets: plan.targets.length,
    distinct_missing_identifiers: new Set(plan.targets.map((t) => t.identifier)).size,
    would_resolve: plan.resolvable.length,
    residue: plan.residue.length,
  };

  const artifact = {
    generated_for: todayIso,
    mode,
    targets: plan.targets,
    resolvable: plan.resolvable,
    relink_item_ids: relinkItemIds,
    residue: plan.residue,
  };
  const writeArtifact = deps.writeArtifact ?? writeArtifactFile;
  summary.artifact = out ? writeArtifact(out, ARTIFACT_NAME, artifact) : null;
  summary.targets_sample = plan.targets.slice(0, 20);
  summary.residue_sample = plan.residue.slice(0, 20);

  if (!apply) {
    summary.note =
      `DRY -- ${plan.resolvable.length} flag(s) would resolve (every named parent now held); ` +
      `${plan.targets.length} discovery target(s) across ${summary.counts.distinct_missing_identifiers} missing identifier(s); ` +
      `${plan.residue.length} residue. Nothing written to the database.`;
    return summary;
  }

  let updated = 0;
  const writes = [];
  for (const entry of plan.resolvable) {
    const note = buildResolutionNote(entry, todayIso);
    const r = await deps.resolveIds([entry.flag_id], note);
    updated += r.updated;
    writes.push({ flag_id: entry.flag_id, updated: r.updated, snapshot: r.snapshot ?? null });
  }
  summary.applied = updated;
  summary.counts.write = { attempted: plan.resolvable.length, updated, writes: writes.slice(0, 20) };
  const remaining = await deps.readOpenFlags();
  summary.read_back = { remaining_open: remaining.length };
  summary.note = `Resolved ${updated}/${plan.resolvable.length} flag(s); ${remaining.length} remain open (${plan.targets.length} discovery target(s) listed in the artifact).`;
  if (updated < plan.resolvable.length) summary.exitCode = 1;
  return summary;
}

if (isMainModule(import.meta.url)) {
  await runCli({
    step: STEP,
    main,
    needsDb: true,
    buildDeps: async () => ({
      readOpenFlags: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) => q.eq("created_by", LINEAGE_GAP_CREATED_BY).in("status", ["open", "in_review"]),
        }),
      readCorpus: () =>
        readAll("intelligence_items", "id, title, instrument_identifier", { match: (q) => q.eq("is_archived", false) }),
      resolveIds: (ids, note) =>
        guardedUpdateByIds(
          "integrity_flags",
          ids,
          { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: RESOLVED_BY, resolution_note: note },
          { cite: CITE, applyMatch: (q) => q.in("status", ["open", "in_review"]) },
        ),
    }),
  });
}
