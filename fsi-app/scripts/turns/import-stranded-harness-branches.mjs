#!/usr/bin/env node
// SHARED-WRITER: harness_runs
// import-stranded-harness-branches.mjs -- one-time import for the harness-run artifact branches that
// piled up under the OLD landing path (deliver-artifact-branch.sh: push a branch, try `gh pr create`,
// fall back to commenting on tracking issue #520 when Actions is refused PR creation -- see
// docs/ops/session-log.d/2026-09-26-harness-landing.md). Per the operator's 2026-09-27 ruling
// ("yes supabase but do not reinvent processes, look at what has already been built"), the NEW landing
// path is a DB row, following the SAME guarded-writer pattern brief_apply_runs already uses
// (recordApplyRunStart/recordApplyRunFinish, scripts/turns/io-preflight.mjs, routed through
// scripts/lib/db.mjs's guardedInsert/guardedUpdate, rule 015). This script is the ONE-TIME migration of
// the 39 branches stranded by the old path into that new table (migration 331, applied 2026-09-27). See
// docs/ops/session-log.d/2026-09-27-harness-runs-db-design.md for the full design + the results of this
// script's real (--apply) run.
//
// DRY MODE (default): for every stranded branch matching a known harness-family prefix, finds the
// run-artifact JSON file(s) that branch adds relative to master, reads each one (git show
// <branch>:<path>), and prints the row it WOULD insert into harness_runs plus a per-family count. Makes
// NO network call beyond git, NO DB call, and NO write. Safe to run repeatedly.
//
// APPLY MODE (--apply): same enumeration, then a plain best-effort insert per row into harness_runs
// (harness metadata, not customer-facing site data -- rule 015's additive-INSERT exemption, same posture
// as record-harness-run.mjs). A row missing a parseable run_id is skipped and logged, never inserted with
// a null primary key. Idempotent by construction: harness_runs.run_id is the primary key, so a re-run
// after a partial failure reports a duplicate-key error for already-inserted rows rather than
// double-inserting them.
//
// USAGE:
//   node scripts/turns/import-stranded-harness-branches.mjs --dry
//   node scripts/turns/import-stranded-harness-branches.mjs --apply

import { execFileSync } from "node:child_process";
import { isMainModule } from "../lib/is-main.mjs";

const FAMILY_PREFIXES = [
  "gate-a-rescan", "maintenance-artifact", "brief-export", "corpus-turn", "downstream-chain",
  "population", "ledger-consume", "source-sweep", "fetch-drain", "propagation-drain",
  "change-detection", "brief-apply", "mint", "forward-events",
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 });
}

/** Lists stranded artifact branches on origin whose name starts with a known harness-family prefix
 * followed by "/". Returns [{ branch, family, githubRunId }]. Pure given `lsRemoteOutput`. */
export function listStrandedBranches(lsRemoteOutput) {
  const out = [];
  for (const line of lsRemoteOutput.split("\n")) {
    const m = line.match(/refs\/heads\/([^\t\s]+)$/);
    if (!m) continue;
    const ref = m[1];
    const slash = ref.indexOf("/");
    if (slash < 0) continue;
    const family = ref.slice(0, slash);
    const rest = ref.slice(slash + 1);
    if (!FAMILY_PREFIXES.includes(family)) continue;
    out.push({ branch: ref, family, githubRunId: /^\d+$/.test(rest) ? rest : null });
  }
  return out;
}

/** Finds the harness-run artifact path(s) a branch adds relative to master (diff --name-only,
 * master...branch), filtered to fsi-app/scripts/harness-runs/**\/*-run-*.json. */
function findArtifactPaths(branch) {
  const diff = git(["diff", "--name-only", `origin/master...origin/${branch}`]);
  return diff
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /scripts\/harness-runs\/.+-run-\d+\.json$/.test(l));
}

function readArtifact(branch, path) {
  try {
    const text = git(["show", `origin/${branch}:${path}`]);
    return JSON.parse(text);
  } catch (e) {
    return { __error: e instanceof Error ? e.message : String(e) };
  }
}

/** Builds the harness_runs row this artifact would land as (shape matches the migration sketch in
 * docs/ops/session-log.d/2026-09-27-harness-runs-db-design.md). Pure. */
export function buildRow(branch, family, artifactPath, artifact) {
  return {
    run_id: artifact?.run_id ?? null,
    harness_family: artifact?.harness_family ?? family,
    harness_version: artifact?.harness_version ?? null,
    started_at: artifact?.started_at ?? null,
    finished_at: artifact?.finished_at ?? null,
    trigger: artifact?.trigger ?? null,
    github_run_id: artifact?.config?.github_run_id ?? null,
    upstream_run_id: artifact?.upstream_run_id ?? null,
    config: artifact?.config ?? null,
    metrics: artifact?.metrics ?? null,
    per_item: artifact?.per_item ?? null,
    defects_found: artifact?.defects_found ?? null,
    full_trace_refs: artifact?.full_trace_refs ?? null,
    source_branch: branch,
    source_artifact_path: artifactPath,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");

  git(["fetch", "--no-tags", "origin"]);
  const ls = git(["ls-remote", "origin"]);
  const branches = listStrandedBranches(ls);

  const rows = [];
  const byFamily = new Map();
  for (const { branch, family } of branches) {
    const paths = findArtifactPaths(branch);
    for (const path of paths) {
      const artifact = readArtifact(branch, path);
      const row = buildRow(branch, family, path, artifact);
      rows.push(row);
      byFamily.set(family, (byFamily.get(family) ?? 0) + 1);
    }
  }

  if (!apply) {
    console.log(`DRY RUN - ${branches.length} stranded branch(es) found, ${rows.length} artifact row(s) would be inserted:\n`);
    for (const [family, count] of [...byFamily.entries()].sort()) {
      console.log(`  ${family}: ${count}`);
    }
    console.log("\nSample rows (first 3):");
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    console.log(`\nTotal: ${rows.length} row(s) across ${byFamily.size} family(ies). No writes performed (dry mode).`);
    return;
  }

  // --apply: this is harness metadata (run records), not customer-facing site data -- a plain best-effort
  // insert per row, same posture as record-harness-run.mjs/recordApplyRunStart, is the right guard level
  // (additive only, rule 015's INSERT exemption; a row that fails to insert is logged and skipped, never
  // fails the whole import).
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("import-stranded-harness-branches: --apply requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.");
    process.exitCode = 1;
    return;
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  let inserted = 0;
  let failed = 0;
  for (const row of rows) {
    if (!row.run_id) {
      console.error(`import-stranded-harness-branches: skipping ${row.source_branch} (${row.source_artifact_path}), no run_id parsed from artifact`);
      failed++;
      continue;
    }
    const { error } = await sb.from("harness_runs").insert(row);
    if (error) {
      console.error(`import-stranded-harness-branches: insert failed for ${row.run_id} (${row.source_branch}): ${error.message}`);
      failed++;
    } else {
      inserted++;
    }
  }
  console.log(`\nAPPLY DONE: inserted ${inserted}, failed ${failed}, of ${rows.length} candidate row(s) across ${byFamily.size} family(ies).`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error("import-stranded-harness-branches: fatal:", e);
    process.exitCode = 1;
  });
}
