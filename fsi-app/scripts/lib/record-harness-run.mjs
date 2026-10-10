#!/usr/bin/env node
// SHARED-WRITER: harness_runs
// record-harness-run.mjs -- lane HARNESS-LANDING (2026-09-27), migration 331. Lands a harness-run
// artifact (fsi-app/scripts/harness-runs/CONVENTION.md) into the `harness_runs` table, replacing the
// old deliver-artifact-branch.sh path (push a branch, try `gh pr create`, fall back to commenting on
// tracking issue #520 -- see docs/ops/session-log.d/2026-09-26-harness-landing.md). Per operator ruling
// 2026-09-27 ("yes supabase but do not reinvent processes, look at what has already been built"), this
// follows the SAME posture `brief_apply_runs`'s writer already uses (scripts/turns/io-preflight.mjs's
// recordApplyRunStart: a plain `sb.from(table).insert(...)`, exempt from rule 015 because an INSERT is
// additive, never a mutation of existing state).
//
// REWRITTEN (lane HARNESS-RUN-NUMBER, 2026-09-29, coordinator finding from GitHub run 36610847827):
// PR #824 stopped committing harness-run artifacts back to the tree (deliver-artifact-branch.sh now
// lands straight into harness_runs, no branch/commit/push). That silently broke the NUMBER every family
// runner claims for its own artifact: `claimRunId` (scripts/lib/run-artifact.mjs) scans the family's own
// `scripts/harness-runs/<family>/*.json` directory on disk, which is now permanently stuck at whatever
// was last COMMITTED -- every fresh CI checkout sees the same stale "highest existing" number and claims
// the same next one, so every run after #824 tried to insert the SAME run_id. `harness_runs_pkey`'s
// unique constraint correctly rejected the duplicate, but this module's old posture logged that as
// "best-effort, run continues" and ALWAYS exited 0 -- the insert failure never surfaced, so nothing since
// 12:43 UTC on 2026-09-29 actually landed (source-sweep run 36610847827, fetch-drain 36611354265,
// ledger-consume 36611354387, all landed=0 failed=1, all step SUCCESS).
//
// TWO changes close this (CLAUDE.md rule 15, "a proof that does not execute is not a proof"):
//
// 1. RENUMBER AT LAND TIME. Before inserting, `recordHarnessRun` asks `harness_runs` itself (via
//    scripts/lib/harness-run-number.mjs's `nextRunNumberFromHarnessRuns`, deps-injected as `readAllFn`
//    so this is testable without a DB) for the family's OWN max existing run number and claims max+1,
//    overwriting whatever (possibly stale, locally-scanned) run_id the artifact carries on disk. The
//    durable record is the source of truth for "what number is next", never a directory listing that can
//    silently stop being current. When the DB read itself fails (network, no creds routed through here,
//    a real outage) this falls back to the artifact's OWN run_id unchanged -- the local scan is now only
//    ever a fallback, never the primary source (keeps F28's family-sequence semantics: monotonic
//    `<family>-run-NNN` per family, one row per number -- the authority for "what's next" moves, the
//    shape does not). A duplicate-key collision on a DB-derived number (two landings racing between the
//    read and the insert) re-derives and retries, bounded, rather than giving up on the first collision.
// 2. FAIL LOUD. `recordHarnessRun` still never THROWS (a DB hiccup mid-insert is caught, not propagated)
//    but the CLI (`runCli` below) now returns a NON-ZERO exit for any insert failure that isn't a missing
//    credential -- deliver-artifact-branch.sh (rewritten alongside this) now PROPAGATES that into a
//    failed step, so a landing that does not land fails the run instead of reporting SUCCESS. Missing
//    credentials still self-skip at exit 2 (rule 15: "New verifiers self-skip (exit 2) without creds
//    rather than crash, so a no-cred run is diagnosable, never a false red") -- that is the ONE case that
//    stays non-fatal, because it is not evidence the row didn't land, it's evidence this invocation was
//    never going to try.
//
// Unlike brief_apply_runs (a two-phase start/finish row keyed to a cooldown gate), a harness-run
// artifact is fully built before this module ever sees it, so this is a SINGLE insert, not a
// start-then-update pair.
//
// CI NO-CRED FAIL-LOUD (lane RW-WF, 2026-10-03, after research-walker.yml run 37096258352 landed zero
// rows while every step reported SUCCESS). research-assessment.yml wires NEXT_PUBLIC_SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY at job-level env: (every step inherits them); research-walker.yml's own
// landing step had no such secrets reachable (only the earlier "chained dry-run guard" step's own env:
// carried them, scoped to that one step), so this module's exit-2 self-skip fired every single dispatch
// and the workflow's `|| echo "best-effort..."` swallowed it -- CLAUDE.md rule 17 ("a runtime is not
// done until the harness has recorded the outcome in harness_runs") was violated silently. The real
// job-level secrets wiring fix lives in research-walker.yml; THIS module closes the second half (CLAUDE.md
// rule 15, "a proof that does not execute is not a proof"): a no-cred run in GitHub Actions is now a
// FAILURE (exit 1), not a self-skip (exit 2) -- detected via GITHUB_ACTIONS=true, which every real
// Actions runner sets automatically and which no local developer shell sets. A developer running this
// script locally without SUPABASE_* creds still gets the clean exit-2 self-skip (rule 15's original
// intent: diagnosable, never a false red, for the case that was never going to try). `isGitHubActions`
// is deps-injectable so both branches are proven without depending on the real process environment.

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { formatRunId, nextRunNumberFromHarnessRuns } from "./harness-run-number.mjs";

// ONE VALUE, TWO PLACES (lane HARNESS-1, 2026-10-10). The ledger row's run_id and the artifact file's name
// (CONVENTION.md: "Filename = run_id + .json") are the same value, or the artifact cannot be found from the
// ledger row. [CONFIRMED] A local dry-run-structured-actions run wrote structured-actions-run-003.json (the
// directory's own max+1) while this module stored structured-actions-run-001 (harness_runs' own max+1,
// `renumbered: true`): two numbering authorities, one file left under the loser's name. When the caller
// passes `artifactPath`, this module now owns the reconciliation in both directions:
//   1. BEFORE the insert, a ledger number whose filename another artifact already holds in the artifact's
//      directory is skipped (never clobbered; a committed historical run-001.json is not overwritten by a
//      ledger row that happens to be numbered 001). The number stays above the ledger's max, so the ledger
//      stays unique and monotonic.
//   2. AFTER a landed insert, the file is renamed to the landed id and its run_id field rewritten.
// A failed insert leaves the file exactly as written.

/** Smallest number >= startNum whose artifact filename in `dir` is free (the artifact's own file counts as free). */
function firstFreeNumber(family, startNum, dir, ownPath) {
  let n = startNum;
  for (;;) {
    const p = join(dir, `${formatRunId(family, n)}.json`);
    if (!existsSync(p) || resolve(p) === resolve(ownPath)) return n;
    n += 1;
  }
}

/** Renames `artifactPath` to `<dir>/<runId>.json` and rewrites its run_id. Returns {path} or {error}. */
function reconcileArtifactFile(artifactPath, runId) {
  try {
    if (!existsSync(artifactPath)) return { error: `artifact file ${artifactPath} does not exist, so it could not be renamed to ${runId}` };
    const target = join(dirname(artifactPath), `${runId}.json`);
    if (resolve(target) !== resolve(artifactPath) && existsSync(target)) {
      return { error: `artifact file ${target} already exists, refusing to overwrite it with the artifact landed as ${runId}` };
    }
    const parsed = JSON.parse(readFileSync(artifactPath, "utf8"));
    parsed.run_id = runId;
    writeFileSync(target, JSON.stringify(parsed, null, 2) + "\n", "utf8");
    if (resolve(target) !== resolve(artifactPath)) unlinkSync(artifactPath);
    return { path: target };
  } catch (e) {
    return { error: `artifact file ${artifactPath} could not be reconciled with ${runId}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** True when a Supabase/Postgres error looks like a unique-constraint violation on `harness_runs_pkey`
 *  (Postgres code 23505, or the message text when the client doesn't surface a `.code`). Used only to
 *  decide whether a DB-derived run number is worth RETRYING (another landing raced us between the read
 *  and the insert) -- any other error is a real failure and is never retried here. */
function isUniqueViolation(error) {
  if (!error) return false;
  if (error.code === "23505") return true;
  const msg = String(error.message ?? "").toLowerCase();
  return msg.includes("duplicate key") || msg.includes("unique constraint");
}

/** The `harness_runs` row shape (CONVENTION.md field mapping), everything except `run_id` -- `run_id`
 *  is filled in separately by the caller once the land-time number is resolved (see recordHarnessRun). */
function baseRow(artifact) {
  return {
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
}

/** Minimal `readAllFn(table, columns, {match, orderBy})` built over a Supabase client, matching the
 *  contract `nextRunNumberFromHarnessRuns` expects (same shape as scripts/lib/db.mjs's `readAll`, not
 *  imported from there to keep this module's own dependency graph small -- db.mjs pulls in the guarded
 *  write path and a `.ts` classifier this module has no other reason to load). No pagination: a single
 *  family's `harness_runs` row count is nowhere near the 1000-row PostgREST page limit at this project's
 *  scale, and adding it back is a one-line change if that ever stops being true. */
function makeReadAllFn(sb) {
  return async (table, columns, { match, orderBy } = {}) => {
    let q = sb.from(table).select(columns);
    const orderCols = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
    for (const col of orderCols) q = q.order(col);
    if (match) q = match(q);
    const { data, error } = await q;
    if (error) throw new Error(`readAllFn(${table}): ${error.message}`);
    return data ?? [];
  };
}

/**
 * Inserts one harness-run artifact's row into `harness_runs`, first renumbering its `run_id` against the
 * table's own max for that family (see this module's header). Never throws: a DB hiccup (network, a
 * genuine outage) is caught and returned as `{ok: false, error}` -- but unlike the pre-2026-09-29
 * posture, the CALLER (see `runCli` below) is responsible for treating that as a real failure, not for
 * silently continuing.
 * @param {object} sb a Supabase client (service-role write client)
 * @param {object} artifact the full run-artifact object (CONVENTION.md schema), already validated/
 *   stamped by writeRunArtifact
 * @param {{log?: (msg:string)=>void, readAllFn?: Function, maxRenumberAttempts?: number, artifactPath?: string|null}} [opts]
 *   `artifactPath`, when given, is the artifact's file: the ledger id and the file name are made one value (see
 *   this module's "ONE VALUE, TWO PLACES" block); the outcome then carries `artifact_path`, or `artifact_error`
 *   when a landed row's file could not be reconciled.
 *   `readAllFn` overrides the default Supabase-backed reader (deps-injected so tests run without a DB,
 *   same pattern plan-quarantine-disposition.mjs/write-statutory.mjs already use for this exact table).
 * @returns {Promise<{ok: true, run_id: string, renumbered: boolean, artifact_path?: string, artifact_error?: string} | {ok: false, error: string, run_id: string}>}
 */
export async function recordHarnessRun(sb, artifact, { log = () => {}, readAllFn = null, maxRenumberAttempts = 3, artifactPath = null } = {}) {
  const effectiveReadAllFn = readAllFn || makeReadAllFn(sb);
  const row = baseRow(artifact);

  let runId = artifact.run_id;
  let renumbered = false;
  let numberIsDbDerived = false;
  try {
    const nextNum = await nextRunNumberFromHarnessRuns(effectiveReadAllFn, artifact.harness_family);
    const freeNum = artifactPath ? firstFreeNumber(artifact.harness_family, nextNum, dirname(artifactPath), artifactPath) : nextNum;
    const candidate = formatRunId(artifact.harness_family, freeNum);
    numberIsDbDerived = true;
    if (candidate !== artifact.run_id) {
      log(
        `record-harness-run: renumbering ${artifact.run_id} -> ${candidate} (harness_runs' own max+1 ` +
          `for family "${artifact.harness_family}"; the artifact's own locally-scanned number is stale)`,
      );
      renumbered = true;
    }
    runId = candidate;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(
      `record-harness-run: could not read harness_runs to derive family "${artifact.harness_family}"'s ` +
        `next run number (falling back to the artifact's own run_id ${artifact.run_id}): ${msg}`,
    );
  }

  for (let attempt = 0; attempt < maxRenumberAttempts; attempt++) {
    try {
      const { error } = await sb.from("harness_runs").insert({ ...row, run_id: runId });
      if (!error) {
        log(`record-harness-run: landed ${runId} in harness_runs${renumbered ? ` (renumbered from ${artifact.run_id})` : ""}`);
        if (!artifactPath) return { ok: true, run_id: runId, renumbered };
        const reconciled = reconcileArtifactFile(artifactPath, runId);
        if (reconciled.error) {
          log(`record-harness-run: ${reconciled.error}`);
          return { ok: true, run_id: runId, renumbered, artifact_error: reconciled.error };
        }
        if (reconciled.path !== resolve(artifactPath)) log(`record-harness-run: artifact file renamed to ${basename(reconciled.path)} to match the ledger id`);
        return { ok: true, run_id: runId, renumbered, artifact_path: reconciled.path };
      }
      const canRetry = numberIsDbDerived && isUniqueViolation(error) && attempt < maxRenumberAttempts - 1;
      if (canRetry) {
        log(`record-harness-run: insert collided on ${runId} (${error.message}); re-deriving the next number and retrying`);
        try {
          const nextNum = await nextRunNumberFromHarnessRuns(effectiveReadAllFn, artifact.harness_family);
          const freeNum = artifactPath ? firstFreeNumber(artifact.harness_family, nextNum, dirname(artifactPath), artifactPath) : nextNum;
          runId = formatRunId(artifact.harness_family, freeNum);
          renumbered = true;
          continue;
        } catch (e2) {
          const msg2 = e2 instanceof Error ? e2.message : String(e2);
          log(`record-harness-run: could not re-derive the next number after a collision (${msg2}); reporting the original insert failure`);
        }
      }
      log(`record-harness-run: insert failed for ${runId}: ${error.message}`);
      return { ok: false, error: error.message, run_id: runId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`record-harness-run: insert threw for ${runId}: ${msg}`);
      return { ok: false, error: msg, run_id: runId };
    }
  }
  const exhausted = `exhausted ${maxRenumberAttempts} renumbering attempts for family "${artifact.harness_family}"`;
  log(`record-harness-run: ${exhausted}`);
  return { ok: false, error: exhausted, run_id: runId };
}

// ── CLI. Reads one artifact JSON file and lands it. Deps-injected (`runCli`) so the exit-code contract
// below is unit-testable without spawning a process or reaching a real Supabase host -- see
// record-harness-run.test.mjs.
//
// EXIT CODES (rule 15: fail loud, self-skip only for a missing credential, and only outside CI):
//   0 -- landed (or renumbered-and-landed).
//   1 -- a real failure: bad usage (no --file), an unreadable/unparseable artifact file, the insert
//        itself failed for any reason other than a missing credential, OR (lane RW-WF, 2026-10-03)
//        credentials are missing WHILE running in GitHub Actions (GITHUB_ACTIONS=true) -- see this
//        file's header. A calling workflow step must check this exit code explicitly (never swallow it
//        with `|| echo ...`), the same pattern scripts/turns/deliver-artifact-branch.sh already uses.
//   2 -- self-skip: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set, AND not running in
//        GitHub Actions. Not evidence the row didn't land; evidence this invocation was never going to
//        try (a developer's local shell). Never treated as a failure.
//
// USAGE: node scripts/lib/record-harness-run.mjs --file scripts/harness-runs/<family>/<run-id>.json
import { isMainModule } from "./is-main.mjs";

/**
 * @param {string[]} args CLI args (process.argv.slice(2) shape)
 * @param {{log?: Function, errorLog?: Function, readFileFn?: Function, envUrl?: string, envKey?: string,
 *   isGitHubActions?: boolean, createClientFn?: (url: string, key: string) => object}} [deps] every
 *   field is optional; the real CLI invocation below supplies none of them (falls through to
 *   process.env / a real Supabase client). `isGitHubActions` defaults to reading GITHUB_ACTIONS from
 *   process.env (every real Actions runner sets it to "true"; a local developer shell never does) --
 *   injectable so both the CI-fail-loud and the local-self-skip branches are tested without depending
 *   on the real process environment (lane RW-WF, 2026-10-03).
 * @returns {Promise<number>} the process exit code to use.
 */
export async function runCli(args, deps = {}) {
  const {
    log = (m) => console.log(m),
    errorLog = (m) => console.error(m),
    readFileFn = readFileSync,
    envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    envKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
    isGitHubActions = process.env.GITHUB_ACTIONS === "true",
    createClientFn = null,
  } = deps;

  const fileIdx = args.indexOf("--file");
  const file = fileIdx >= 0 ? args[fileIdx + 1] : null;
  if (!file) {
    errorLog("record-harness-run: --file <path-to-artifact.json> is required.");
    return 1; // usage error -- fail loud, this is not a DB hiccup (rule 15)
  }

  let artifact;
  try {
    artifact = JSON.parse(readFileFn(file, "utf8"));
  } catch (e) {
    errorLog(`record-harness-run: could not read/parse ${file}: ${e instanceof Error ? e.message : String(e)}`);
    return 1; // a real caller/data error, never silenced as best-effort (rule 15)
  }

  if (!envUrl || !envKey) {
    if (isGitHubActions) {
      errorLog(
        "record-harness-run: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set while running " +
          "in GitHub Actions (GITHUB_ACTIONS=true) -- this is a FAILURE, not a self-skip (CLAUDE.md rule " +
          "17: a runtime that no-ops cleanly with no creds has not recorded anything in harness_runs). " +
          "Wire the secrets at job-level env: for this job, the same way research-assessment.yml does.",
      );
      return 1;
    }
    errorLog(
      "record-harness-run: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set -- self-skip " +
        "(no-cred case, rule 15): diagnosable, never a false red.",
    );
    return 2;
  }

  let sb;
  if (createClientFn) {
    sb = createClientFn(envUrl, envKey);
  } else {
    const { createClient } = await import("@supabase/supabase-js");
    sb = createClient(envUrl, envKey, { auth: { persistSession: false } });
  }

  const outcome = await recordHarnessRun(sb, artifact, { log, artifactPath: file });
  if (!outcome.ok) {
    errorLog(`record-harness-run: ${outcome.error}`);
    return 1; // the insert genuinely failed -- fail the step, never best-effort-silenced (rule 15)
  }
  if (outcome.artifact_error) {
    errorLog(`record-harness-run: row ${outcome.run_id} landed but ${outcome.artifact_error}`);
    return 1; // the ledger id and the artifact name disagree -- fail loud, never silent (rule 15)
  }
  return 0;
}

if (isMainModule(import.meta.url)) {
  const code = await runCli(process.argv.slice(2));
  process.exit(code);
}
