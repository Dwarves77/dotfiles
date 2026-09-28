#!/usr/bin/env node
// SHARED-WRITER: harness_runs
// record-harness-run.mjs -- lane HARNESS-LANDING (2026-09-27), migration 331. Lands a harness-run
// artifact (fsi-app/scripts/harness-runs/CONVENTION.md) into the `harness_runs` table, replacing the
// old deliver-artifact-branch.sh path (push a branch, try `gh pr create`, fall back to commenting on
// tracking issue #520 -- see docs/ops/session-log.d/2026-09-26-harness-landing.md). Per operator ruling
// 2026-09-27 ("yes supabase but do not reinvent processes, look at what has already been built"), this
// follows the SAME posture `brief_apply_runs`'s writer already uses (scripts/turns/io-preflight.mjs's
// recordApplyRunStart: a plain `sb.from(table).insert(...)`, exempt from rule 015 because an INSERT is
// additive, never a mutation of existing state) -- best-effort, logs and never throws, so a DB hiccup
// never fails the harness run itself (the artifact JSON on disk, written unconditionally by
// writeRunArtifact, stays the run's own local record regardless of this table write's outcome).
//
// Unlike brief_apply_runs (a two-phase start/finish row keyed to a cooldown gate), a harness-run
// artifact is fully built before this module ever sees it, so this is a SINGLE insert, not a
// start-then-update pair.

/**
 * Inserts one harness-run artifact's row into `harness_runs`. Best-effort: logs and returns { ok:
 * false, error } on failure rather than throwing, so a DB outage never fails the harness run whose
 * artifact JSON (writeRunArtifact's own output) already landed on disk regardless.
 * @param {object} sb a Supabase client (service-role write client)
 * @param {object} artifact the full run-artifact object (CONVENTION.md schema), already validated/
 *   stamped by writeRunArtifact
 * @param {{log?: (msg:string)=>void}} [opts]
 * @returns {Promise<{ok: true, run_id: string} | {ok: false, error: string}>}
 */
export async function recordHarnessRun(sb, artifact, { log = () => {} } = {}) {
  const row = {
    run_id: artifact.run_id,
    harness_family: artifact.harness_family,
    harness_version: artifact.harness_version ?? null,
    started_at: artifact.started_at,
    trigger: artifact.trigger ?? null,
    github_run_id: artifact?.config?.github_run_id ?? null,
    upstream_run_id: artifact.upstream_run_id ?? null,
    config: artifact.config ?? {},
    inputs_ref: artifact.inputs_ref ?? [],
    per_item: artifact.per_item ?? [],
    metrics: artifact.metrics ?? {},
    defects_found: artifact.defects_found ?? [],
    full_trace_refs: artifact.full_trace_refs ?? [],
  };
  try {
    const { error } = await sb.from("harness_runs").insert(row);
    if (error) {
      log(`record-harness-run: insert failed for ${artifact.run_id} (best-effort, run continues): ${error.message}`);
      return { ok: false, error: error.message };
    }
    log(`record-harness-run: landed ${artifact.run_id} in harness_runs`);
    return { ok: true, run_id: artifact.run_id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`record-harness-run: insert threw for ${artifact.run_id} (best-effort, run continues): ${msg}`);
    return { ok: false, error: msg };
  }
}

// ── CLI. Reads one artifact JSON file, lands it, ALWAYS exits 0 (best-effort posture, see header) so a
// DB hiccup never fails the calling workflow step -- the artifact JSON on disk is the run's own durable
// local record regardless of this table write's outcome.
//
// USAGE: node scripts/lib/record-harness-run.mjs --file scripts/harness-runs/<family>/<run-id>.json
import { readFileSync } from "node:fs";
import { isMainModule } from "./is-main.mjs";

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const file = fileIdx >= 0 ? args[fileIdx + 1] : null;
  if (!file) {
    console.error("record-harness-run: --file <path-to-artifact.json> is required.");
    process.exit(0); // best-effort: never fail the calling step over a usage error either
  }
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`record-harness-run: could not read/parse ${file} (best-effort, continuing): ${e instanceof Error ? e.message : String(e)}`);
    process.exit(0);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("record-harness-run: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set (best-effort, continuing without landing this run in harness_runs).");
    process.exit(0);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const outcome = await recordHarnessRun(sb, artifact, { log: (msg) => console.log(msg) });
  if (!outcome.ok) console.error(`record-harness-run: ${outcome.error}`);
  process.exit(0); // best-effort, always
}
