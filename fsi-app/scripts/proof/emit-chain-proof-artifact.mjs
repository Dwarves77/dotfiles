#!/usr/bin/env node
// emit-chain-proof-artifact.mjs -- the chain-proof family's harness-run artifact writer (lane PROOF-1,
// 2026-10-07). .github/workflows/chain-proof.yml calls it `if: always()`, so a firing that stopped early
// still leaves a record. It runs nothing itself: it reads what the job's steps left in the proof's output
// directory (CP_OUT_DIR) and records counts, step outcomes and one defect per failure:
//   replay-report.json          from replay-migrations.mjs
//   harness-runs-local.json     from export-local-harness-runs.mjs (hashed ids only)
//   schema-apply-report.json    from apply-schema-dump.mjs (the production schema dump applied to the oracle database)
//   replay-schema-diff.json     from schema-diff.mjs (the oracle gate: replayed schema vs the dump; counts and names)
//   step-<name>.json            from run-lane-step.mjs, one per later step (ran / skipped with a reason / failed)
// A missing or unreadable input is recorded as missing, never as a clean run.
//
// PUBLIC-REPO RULE: the artifact is uploaded as a workflow artifact on a public repository. It holds counts,
// migration file names, error text from the replay of an EMPTY database, step names and hashed ids. It never
// holds a row, a title or an item id. It is NOT landed into production harness_runs: the job holds no
// production write credential (docs/decisions/ADR-045-chain-proof-on-a-local-stack.md).
//
// REUSE: the envelope is buildRunArtifactEnvelope and the write is writeRunArtifact (scripts/lib/run-artifact.mjs);
// run id and harness version come from resolveHarnessRunContext (scripts/lib/loop-run-id.mjs). The artifact is
// written under <CP_OUT_DIR>/artifact so the run id numbering never reads or writes the committed family dir.
//
// Configuration: CP_OUT_DIR (the output directory), CP_STARTED_AT (ISO time the job started), CP_LOOP_RUN_ID
// (the proof's root loop id; defaults to GITHUB_RUN_ID).
// Prints a markdown summary on stdout for $GITHUB_STEP_SUMMARY.

import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { writeRunArtifact, buildRunArtifactEnvelope } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
import { resolveHarnessRunContext } from "../lib/loop-run-id.mjs";
import { isMainModule } from "../lib/is-main.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");
const FAMILY = "chain-proof";

function readJson(path, readFn) {
  try { return { value: JSON.parse(readFn(path, "utf8")) }; } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

/** Gather the step inputs from the output directory. `readFn` and `listFn` are injectable. */
export function readInputs(outDir, { readFn = readFileSync, listFn = readdirSync } = {}) {
  const replay = readJson(join(outDir, "replay-report.json"), readFn);
  const local = readJson(join(outDir, "harness-runs-local.json"), readFn);
  const schemaApply = readJson(join(outDir, "schema-apply-report.json"), readFn);
  const schemaDiff = readJson(join(outDir, "replay-schema-diff.json"), readFn);
  let names = [];
  try { names = listFn(outDir).filter((n) => /^step-[a-z0-9-]+\.json$/.test(n)).sort(); } catch { names = []; }
  const steps = names.map((n) => readJson(join(outDir, n), readFn).value).filter(Boolean);
  return { replay: replay.value ?? null, replayError: replay.error ?? null, local: local.value ?? null, schemaApply: schemaApply.value ?? null, schemaDiff: schemaDiff.value ?? null, steps };
}

/** Differing objects in one category of a schema diff. PURE. */
function diffCount(diff, cat) {
  const c = diff.categories?.[cat];
  return c ? (c.only_in_replayed ?? 0) + (c.only_in_oracle ?? 0) + (c.changed ?? 0) : 0;
}

/** Build the artifact. PURE. */
export function buildArtifact({ runId, harnessVersion, startedAt, loopRunId = null, inputs }) {
  const { replay, replayError, local, steps, schemaApply = null, schemaDiff = null } = inputs;
  const perItem = [];
  const defects = [];

  if (replay) {
    perItem.push({
      id: "replay-migrations",
      outcome: replay.ok ? "ok" : "failed",
      verdict: `applied ${replay.applied} of ${replay.planned}; failed ${replay.failed}; skipped ${replay.skipped}`,
      counts: { applied: replay.applied, failed: replay.failed, skipped: replay.skipped },
      evidence_refs: ["replay-report.json"],
      error: null,
    });
    for (const f of (replay.files ?? []).filter((x) => x.status === "failed")) {
      defects.push({
        description: `migration ${f.file} did not replay on an empty database`,
        root_cause: `${f.error?.message ?? "unknown"}${f.error?.line ? ` (line ${f.error.line})` : ""}`.slice(0, 300),
        fix_ref: null,
      });
    }
    for (const r of (replay.applied_without_file ?? [])) {
      defects.push({ description: `applied migration ${r.version} ${r.name} has no migration file`, root_cause: "", fix_ref: null });
    }
    for (const c of (replay.post_checks ?? []).filter((x) => !x.ok)) {
      defects.push({ description: `post-replay check failed: ${c.name}`, root_cause: "", fix_ref: null });
    }
  } else {
    perItem.push({ id: "replay-migrations", outcome: "report_missing", verdict: replayError ?? "no replay report", counts: null, evidence_refs: [], error: replayError });
    defects.push({ description: "chain proof produced no replay report", root_cause: replayError ?? "", fix_ref: null });
  }

  if (schemaApply) {
    perItem.push({
      id: "schema-apply",
      outcome: schemaApply.ok ? "ok" : "failed",
      verdict: `public tables ${schemaApply.public_tables}; fatal errors ${schemaApply.fatal_errors}; role errors ${schemaApply.role_errors}`,
      counts: { fatal_errors: schemaApply.fatal_errors, role_errors: schemaApply.role_errors },
      evidence_refs: ["schema-apply-report.json"],
      error: null,
    });
    for (const e of (schemaApply.errors ?? []).slice(0, 30)) defects.push({ description: "production schema dump statement failed locally", root_cause: `line ${e.line}: ${e.message}`.slice(0, 300), fix_ref: null });
  }
  if (schemaDiff) {
    perItem.push({ id: "schema-oracle", outcome: schemaDiff.identical ? "ok" : "failed", verdict: schemaDiff.identical ? "the replayed schema and the production dump are identical" : `${schemaDiff.differing_total} differing object(s) between the replayed schema and the production dump`, counts: Object.fromEntries(Object.keys(schemaDiff.categories ?? {}).map((k) => [k, diffCount(schemaDiff, k)])), evidence_refs: ["replay-schema-diff.json"], error: null });
    for (const [cat, c] of Object.entries(schemaDiff.categories ?? {})) {
      const n = diffCount(schemaDiff, cat);
      if (n === 0) continue;
      const names = [...(c.names_only_in_replayed ?? []).map((x) => "only in replayed: " + x), ...(c.names_only_in_oracle ?? []).map((x) => "only in oracle: " + x), ...(c.names_changed ?? []).map((x) => "changed: " + x)];
      defects.push({ description: `schema oracle: ${n} differing ${cat}`, root_cause: names.slice(0, 8).join("; ").slice(0, 300), fix_ref: null });
    }
  }

  for (const s of steps) {
    perItem.push({
      id: `step:${s.step}`,
      outcome: s.status,
      verdict: s.reason ?? `exit ${s.exit_code}`,
      counts: { seconds: s.seconds ?? 0 },
      evidence_refs: [`step-${s.step}.json`],
      error: s.status === "failed" ? (s.reason ?? "failed") : null,
    });
    if (s.status === "failed") defects.push({ description: `chain proof step ${s.step} (lane ${s.lane}) failed`, root_cause: s.reason ?? "", fix_ref: null });
  }

  const metrics = {
    replay_planned: replay?.planned ?? null,
    replay_applied: replay?.applied ?? null,
    replay_failed: replay?.failed ?? null,
    replay_skipped: replay?.skipped ?? null,
    replay_not_in_inventory: replay?.not_in_inventory?.length ?? null,
    replay_skipped_not_applied: replay?.skipped_not_applied?.length ?? null,
    replay_applied_without_file: replay?.applied_without_file?.length ?? null,
    replay_post_checks_failed: replay ? (replay.post_checks ?? []).filter((c) => !c.ok).length : null,
    replay_public_tables: replay?.post_info?.public_tables ?? null,
    steps_ran: steps.filter((s) => s.status === "ran").length,
    steps_skipped: steps.filter((s) => s.status === "skipped").length,
    steps_failed: steps.filter((s) => s.status === "failed").length,
    local_harness_runs: local?.count ?? null,
    schema_apply_public_tables: schemaApply?.public_tables ?? null,
    schema_apply_fatal_errors: schemaApply?.fatal_errors ?? null,
    schema_apply_role_errors: schemaApply?.role_errors ?? null,
    schema_diff_differing: schemaDiff?.differing_total ?? null,
    schema_diff_tables: schemaDiff ? diffCount(schemaDiff, "tables") : null,
    schema_diff_columns: schemaDiff ? diffCount(schemaDiff, "columns") : null,
    schema_diff_constraints: schemaDiff ? diffCount(schemaDiff, "constraints") : null,
    schema_diff_indexes: schemaDiff ? diffCount(schemaDiff, "indexes") : null,
    schema_diff_functions: schemaDiff ? diffCount(schemaDiff, "functions") : null,
    schema_diff_triggers: schemaDiff ? diffCount(schemaDiff, "triggers") : null,
    schema_diff_policies: schemaDiff ? diffCount(schemaDiff, "policies") : null,
  };

  return buildRunArtifactEnvelope({
    family: FAMILY,
    harnessVersion,
    runId,
    startedAt,
    config: { stack: "local-supabase", production_writes: false, loop_run_id: loopRunId },
    inputsRef: ["replay-report.json", "schema-apply-report.json", "replay-schema-diff.json", "harness-runs-local.json", "step-*.json"],
    perItem,
    metrics,
    defectsFound: defects,
    fullTraceRefs: ["docs/runbooks/maintenance.d/64-chain-proof.md"],
    proposerNotes:
      "Auto-emitted by emit-chain-proof-artifact.mjs from the chain-proof job's output directory. Counts, file names " +
      "and hashed ids only; the job holds no production write credential and this artifact is not landed into " +
      "production harness_runs. Migration NOTICE lines are in the replay-report.json workflow artifact (7 days).",
  });
}

/** Markdown for the job's step summary. PURE. */
export function summaryMarkdown(artifact) {
  const m = artifact.metrics;
  const lines = [
    "## Chain proof",
    "",
    `Oracle (production dump applied): public tables ${m.schema_apply_public_tables ?? "n/a"}, fatal errors ${m.schema_apply_fatal_errors ?? "n/a"}, role errors ${m.schema_apply_role_errors ?? "n/a"}.`,
    `Migration replay (builds the proof schema): applied ${m.replay_applied ?? "n/a"} of ${m.replay_planned ?? "n/a"}, failed ${m.replay_failed ?? "n/a"}, skipped ${m.replay_skipped ?? "n/a"}.`,
    `Steps: ${m.steps_ran} ran, ${m.steps_skipped} skipped, ${m.steps_failed} failed. Local harness_runs rows: ${m.local_harness_runs ?? "n/a"}.`,
    `Schema oracle (replayed vs production dump): ${m.schema_diff_differing ?? "n/a"} differing objects (tables ${m.schema_diff_tables ?? "n/a"}, columns ${m.schema_diff_columns ?? "n/a"}, constraints ${m.schema_diff_constraints ?? "n/a"}, indexes ${m.schema_diff_indexes ?? "n/a"}, functions ${m.schema_diff_functions ?? "n/a"}, triggers ${m.schema_diff_triggers ?? "n/a"}, policies ${m.schema_diff_policies ?? "n/a"}).`,
  ];
  for (const p of artifact.per_item.filter((x) => x.id.startsWith("step:"))) lines.push(`- ${p.id}: ${p.outcome}${p.outcome === "skipped" ? ` (${p.verdict})` : ""}`);
  for (const d of artifact.defects_found) lines.push(`- DEFECT ${d.description}${d.root_cause ? `: ${d.root_cause}` : ""}`);
  return lines.join("\n") + "\n";
}

/** Read the inputs, build the artifact and write it. Everything external is injectable. */
export function emit({ env = process.env, fsiRoot = FSI_ROOT, familyDir, readFn = readFileSync, listFn = readdirSync } = {}) {
  const outDir = env.CP_OUT_DIR;
  if (!outDir) throw new Error("CP_OUT_DIR is not set");
  const dir = familyDir ?? join(outDir, "artifact");
  const inputs = readInputs(outDir, { readFn, listFn });
  const { harnessVersion, runId } = resolveHarnessRunContext({
    family: FAMILY,
    familyDir: dir,
    governingFiles: GOVERNING_FILES[FAMILY],
    fsiRoot,
    upstreamName: null,
    upstreamRunId: null,
  });
  const loopRunId = env.CP_LOOP_RUN_ID || env.GITHUB_RUN_ID || null;
  const artifact = buildArtifact({ runId, harnessVersion, startedAt: env.CP_STARTED_AT || new Date().toISOString(), loopRunId, inputs });
  const outPath = writeRunArtifact(dir, artifact);
  return { outPath, artifact };
}

if (isMainModule(import.meta.url)) {
  const { outPath, artifact } = emit();
  console.error(`emit-chain-proof-artifact: wrote ${outPath}`);
  process.stdout.write(summaryMarkdown(artifact));
}
