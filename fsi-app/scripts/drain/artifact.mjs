// artifact.mjs: the judgement-drain family's harness-run artifact (lane G6-DRAIN, 2026-10-06, CONVENTION.md shape).
//
// One artifact per drain run, written through the shared writer (scripts/lib/run-artifact.mjs), never a second
// copy of the envelope. It records the switch state the run read, the kinds and counts it planned, the leases it
// held and released, and the batch PRs it opened. Emission is code (rule 17): plan-drain.mjs --finish calls it on
// every run that planned work. A run that stopped at STEP 0 (switch off) writes nothing: it read nothing and
// planned nothing, and an off drain firing on a schedule must not leave a file behind each time.
// The session lands the artifact into harness_runs with scripts/turns/deliver-artifact-branch.sh (a database
// write, no commit), the same landing every other family uses.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeRunArtifact, buildRunArtifactEnvelope, claimRunId, hashHarnessVersion } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";

export const FAMILY = "judgement-drain";
const FSI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Pure. Build the run-artifact fields from a finished plan. No I/O.
 * @param {{plan: object, prs?: Record<string,string>, finishedAt: string}} o
 */
export function buildDrainRun({ plan, prs = {}, finishedAt }) {
  const kinds = plan.kinds ?? [];
  const leases = plan.leases ?? [];
  const perItem = kinds.flatMap((k) =>
    k.batches.flatMap((b) =>
      b.item_ids.map((id) => ({
        id: `${k.kind}:${id}`,
        outcome: "planned",
        verdict: `batch ${b.batch_path}`,
        evidence_refs: [b.batch_path],
        error: null,
      })),
    ),
  );
  const defects = [];
  for (const k of kinds) {
    if (k.export_error) defects.push({ description: `${k.kind}: export failed`, root_cause: k.export_error, fix_ref: null });
    for (const r of k.residue?.lease_held ?? []) defects.push({ description: `${k.kind}: item ${r.id} left out (${r.reason})`, root_cause: r.holder ? `held by ${r.holder}` : "lease not taken", fix_ref: null });
  }
  for (const l of leases) {
    if (!l.released) defects.push({ description: `lease on ${l.kind}:${l.id} not released`, root_cause: l.release_error ?? "release returned false (already released or taken over)", fix_ref: null });
  }
  const config = {
    switch: plan.switch ?? null,
    drain: plan.drain,
    holder: plan.holder ?? null,
    plan_run_id: plan.run_id,
    kinds: kinds.map((k) => ({ kind: k.kind, mode: k.mode ?? "pending", pending_exported: k.pending_exported, planned: k.batches.reduce((a, b) => a + b.count, 0), batches: k.batches.map((b) => b.batch_path), apply_workflow: k.apply_workflow, pr: prs[k.kind] ?? null })),
    leases_held: leases.length,
    leases_released: leases.filter((l) => l.released).length,
    finished_at: finishedAt,
  };
  const metrics = { kinds_planned: plan.totals?.kinds_planned ?? 0, batches: plan.totals?.batches ?? 0, items: plan.totals?.items ?? 0, leases_held: leases.length, leases_released: config.leases_released, prs_opened: Object.keys(prs).length };
  return { config, perItem, metrics, defectsFound: defects };
}

/**
 * Claim a run id, build and write the artifact; returns the path written.
 * @param {{plan: object, prs?: Record<string,string>, finishedAt: string}} o
 * @param {{familyDir?: string, fsiRoot?: string}} [paths]
 */
export function emitJudgementDrainArtifact(o, { familyDir = resolve(FSI_ROOT, "scripts/harness-runs", FAMILY), fsiRoot = FSI_ROOT } = {}) {
  const { config, perItem, metrics, defectsFound } = buildDrainRun(o);
  const envelope = buildRunArtifactEnvelope({
    family: FAMILY,
    harnessVersion: hashHarnessVersion(GOVERNING_FILES[FAMILY], fsiRoot),
    runId: claimRunId(familyDir, FAMILY),
    startedAt: o.plan.generated_at,
    config,
    inputsRef: ["scripts/drain/plan-drain.mjs"],
    perItem,
    metrics,
    defectsFound,
    fullTraceRefs: ["docs/runbooks/maintenance.d/"],
    proposerNotes: o.plan.drain === "on"
      ? "Auto-emitted by plan-drain.mjs --finish after the drain session planned, authored and handed off its batches; the apply workflows run on merge."
      : "The drain was off at STEP 0; nothing was planned.",
  });
  return writeRunArtifact(familyDir, envelope);
}
