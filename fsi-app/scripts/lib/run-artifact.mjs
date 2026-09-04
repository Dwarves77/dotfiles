#!/usr/bin/env node
// run-artifact.mjs — the meta-harness run-artifact layer (Wave MH-1). Writer + reader + a tiny CLI for
// the one-JSON-artifact-per-run convention documented in full at
// fsi-app/scripts/harness-runs/CONVENTION.md. Built per arXiv 2603.28052 ("Meta-Harness," Lee/Finn et
// al.): its ablation found FULL raw traces beat scores-plus-summaries (56.7% vs 38.7%) — summaries
// actively hurt. This module's job is to make sure a harness run's full trace is ALWAYS reachable from
// a small, structured, machine-readable pointer, never replaced by one.
//
// No I/O side effects on import. No network, no DB — this is a filesystem-only, $0 module, same
// discipline as scripts/mint/screen-worklist.mjs.
//
// USAGE (library):
//   import { writeRunArtifact, readRunHistory, hashHarnessVersion } from "./run-artifact.mjs";
//   const version = hashHarnessVersion(["scripts/mint/screen-rules.mjs"], repoRoot);
//   writeRunArtifact(dir, artifact);                    // fail-closed schema validation, then write
//   const { runs, invalid } = readRunHistory(dir);       // sorted ascending by started_at
//
// USAGE (CLI):
//   node scripts/lib/run-artifact.mjs --dir scripts/harness-runs/mint --list

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import crypto from "node:crypto";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// "meta-harness" (Wave MH-4, build plan §3 "self-application") is the meta-harness layer's own family:
// its runs are the waves that build/extend this substrate itself (MH-1..MH-3, and every wave after). Its
// governing files (CONVENTION.md, PROPOSER-RUNBOOK.md, this file, and F28 itself — F28's GOVERNING_FILES
// table) are self-referential by construction — a change to this file is itself a change to one of the
// meta-harness family's own governing files, exactly the "the loop applies to itself" plan §1 describes.
export const ALLOWED_FAMILIES = Object.freeze([
  "mint",
  "screen",
  "fetch-drain",
  "meta-harness",
  "forward-events",
  "source-sweep",
  "ledger-consume",
  "change-detection",
  "propagation",
  "corpus-turn",
]);

const REQUIRED_TOP_LEVEL = Object.freeze([
  "harness_family",
  "harness_version",
  "run_id",
  "started_at",
  "config",
  "inputs_ref",
  "per_item",
  "metrics",
  "defects_found",
  "full_trace_refs",
  "proposer_notes",
]);

const ARRAY_FIELDS = Object.freeze(["inputs_ref", "per_item", "defects_found", "full_trace_refs"]);
const OBJECT_FIELDS = Object.freeze(["config", "metrics"]);
const STRING_FIELDS = Object.freeze([
  "harness_family",
  "harness_version",
  "run_id",
  "started_at",
  "proposer_notes",
]);

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function runIdPattern(family) {
  return new RegExp(`^${family}-run-\\d{3}$`);
}

/**
 * Validate one run artifact against the CONVENTION.md schema. Pure function: no I/O, never throws —
 * returns an array of human-readable error strings (empty = valid). Fail-closed by construction: every
 * required key, every array/object type, every per_item/defects_found entry shape is checked; nothing
 * is inferred or defaulted.
 * @param {object} artifact
 * @returns {string[]} errors, empty if the artifact is valid
 */
export function validateRunArtifact(artifact) {
  const errors = [];
  if (!isPlainObject(artifact)) {
    return ["artifact must be a plain object"];
  }

  for (const key of REQUIRED_TOP_LEVEL) {
    if (!(key in artifact)) errors.push(`missing required field: ${key}`);
  }
  // Stop early on missing keys — type checks below assume presence.
  if (errors.length) return errors;

  for (const key of STRING_FIELDS) {
    if (typeof artifact[key] !== "string") errors.push(`field ${key} must be a string`);
  }
  for (const key of ARRAY_FIELDS) {
    if (!Array.isArray(artifact[key])) errors.push(`field ${key} must be an array`);
  }
  for (const key of OBJECT_FIELDS) {
    if (!isPlainObject(artifact[key])) errors.push(`field ${key} must be an object`);
  }
  if (errors.length) return errors;

  if (!ALLOWED_FAMILIES.includes(artifact.harness_family)) {
    // REGISTRATION-ORDER RULE (see CONVENTION.md's "A new harness family ... gets a new subdirectory
    // and one addition to ALLOWED_FAMILIES in run-artifact.mjs"): a family must be REGISTERED —
    // present in ALLOWED_FAMILIES, this module's own export — before any of its artifacts can ever
    // validate. The bare "is not one of [...]" message that used to stand here named the symptom but
    // not the fix, which is exactly the kind of unhelpful violation message CONVENTION.md's own
    // registration step exists to prevent a reader from having to reverse-engineer. Name the rule, the
    // offending family, and the exact one-line fix, in the message itself.
    errors.push(
      `harness_family "${artifact.harness_family}" is not registered in ALLOWED_FAMILIES ` +
        `(scripts/lib/run-artifact.mjs). RULE: a harness family must be added to ALLOWED_FAMILIES ` +
        `BEFORE any of its run artifacts can validate — registration comes first, artifacts second, ` +
        `never the other way round. FIX: add "${artifact.harness_family}" to ALLOWED_FAMILIES in ` +
        `scripts/lib/run-artifact.mjs, add its governing files to CONVENTION.md's harness_version table ` +
        `and F28's GOVERNING_FILES (.discipline/fitness/functions/F28-harness-run-integrity.mjs), then ` +
        `retry writing this artifact. Currently registered: ${JSON.stringify(ALLOWED_FAMILIES)}.`,
    );
  } else if (!runIdPattern(artifact.harness_family).test(artifact.run_id)) {
    errors.push(
      `run_id "${artifact.run_id}" does not match ^${artifact.harness_family}-run-\\d{3}$`,
    );
  }

  if (Number.isNaN(Date.parse(artifact.started_at))) {
    errors.push(`started_at "${artifact.started_at}" is not a parseable ISO 8601 timestamp`);
  }

  if (artifact.harness_version.trim().length === 0) {
    errors.push("harness_version must not be empty");
  }

  // The paper's core finding, enforced structurally: a run artifact with nowhere to point a reader for
  // the complete trace is the summary-only failure mode the ablation measured against.
  if (artifact.full_trace_refs.length === 0) {
    errors.push("full_trace_refs must be non-empty — a run artifact must point at its full raw trace");
  }
  for (const [i, ref] of artifact.full_trace_refs.entries()) {
    if (typeof ref !== "string" || ref.trim().length === 0) {
      errors.push(`full_trace_refs[${i}] must be a non-empty string path`);
    }
  }

  artifact.per_item.forEach((item, i) => {
    if (!isPlainObject(item)) {
      errors.push(`per_item[${i}] must be an object`);
      return;
    }
    if (typeof item.id !== "string" || item.id.trim().length === 0) {
      errors.push(`per_item[${i}].id must be a non-empty string`);
    }
    if (typeof item.outcome !== "string" || item.outcome.trim().length === 0) {
      errors.push(`per_item[${i}].outcome must be a non-empty string`);
    }
    if ("evidence_refs" in item && !Array.isArray(item.evidence_refs)) {
      errors.push(`per_item[${i}].evidence_refs must be an array when present`);
    }
  });

  artifact.defects_found.forEach((d, i) => {
    if (!isPlainObject(d)) {
      errors.push(`defects_found[${i}] must be an object`);
      return;
    }
    if (typeof d.description !== "string" || d.description.trim().length === 0) {
      errors.push(`defects_found[${i}].description must be a non-empty string`);
    }
    if (typeof d.root_cause !== "string") {
      errors.push(`defects_found[${i}].root_cause must be a string (may be "" if genuinely still open)`);
    }
    if (!("fix_ref" in d)) {
      errors.push(`defects_found[${i}].fix_ref must be present (a string, or null if no fix exists yet)`);
    } else if (d.fix_ref !== null && typeof d.fix_ref !== "string") {
      errors.push(`defects_found[${i}].fix_ref must be a string or null`);
    }
  });

  return errors;
}

/**
 * Write one run artifact to <dir>/<run_id>.json. Fail-closed: throws with every validation error
 * joined into the message (never writes a partial/invalid file) before touching the filesystem.
 * Refuses to overwrite an existing file unless { allowOverwrite: true } — see CONVENTION.md's
 * "screen-v1 loss" for why a harness's own output-writing must not repeat that loss.
 * @param {string} dir
 * @param {object} artifact
 * @param {{allowOverwrite?: boolean}} [opts]
 * @returns {string} the path written
 */
export function writeRunArtifact(dir, artifact, opts = {}) {
  const errors = validateRunArtifact(artifact);
  if (errors.length) {
    throw new Error(`writeRunArtifact: invalid artifact —\n  ${errors.join("\n  ")}`);
  }

  const outPath = join(resolve(dir), `${artifact.run_id}.json`);
  if (existsSync(outPath) && !opts.allowOverwrite) {
    throw new Error(
      `writeRunArtifact: ${outPath} already exists — refusing to overwrite silently ` +
        `(pass { allowOverwrite: true } if this is deliberate). ` +
        `See CONVENTION.md's "screen-v1 loss" for why this default exists.`,
    );
  }

  mkdirSync(resolve(dir), { recursive: true });
  writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  return outPath;
}

function runIdRegExpFor(family) {
  return new RegExp(`^${family}-run-(\\d{3})\\.json$`);
}

/**
 * Highest existing run number for `family` in `dir`, considering BOTH already-written
 * `<family>-run-NNN.json` artifacts and outstanding claim markers under `<dir>/.claims/` (see
 * claimRunId below) — a number a concurrent process has claimed but not yet written to must not be
 * handed out again just because the .json file doesn't exist yet. Returns 0 when neither exists (so
 * the first run_id is `<family>-run-001`, matching nextRunId's convention in screen-worklist.mjs).
 */
function highestClaimedOrWrittenRunNumber(dir, family) {
  const artifactRe = runIdRegExpFor(family);
  const claimRe = new RegExp(`^${family}-run-(\\d{3})\\.json\\.claim$`);
  let max = 0;

  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    entries = [];
  }
  for (const name of entries) {
    const m = artifactRe.exec(name);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }

  let claimEntries = [];
  try {
    claimEntries = readdirSync(join(dir, ".claims"));
  } catch {
    claimEntries = [];
  }
  for (const name of claimEntries) {
    const m = claimRe.exec(name);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }

  return max;
}

/**
 * Collision-safe claim of the next `<family>-run-NNN` run_id under `dir` (Wave MH-5, "run-id collision
 * guard"). `nextRunId`-style scanning alone (screen-worklist.mjs's approach: read the highest existing
 * file, add one) is a classic TOCTOU race — two concurrent processes can both read the same "highest
 * existing" number and both proceed to write `<family>-run-042.json`, and whichever writes second wins
 * silently (or, without `writeRunArtifact`'s overwrite guard, clobbers the first). The atomic primitive
 * here is `mkdirSync(path, { recursive: false })`: POSIX `mkdir` either creates the directory or fails
 * with `EEXIST` — there is no window where two callers can both "succeed" at creating the same path, so
 * the directory itself IS the claim. A `<dir>/.claims/<run_id>.json.claim/` marker directory is created
 * (never removed — its continued existence is what keeps that number retired even after the real
 * artifact is written, so a second caller who raced and lost still can't reuse the number by scanning
 * only *.json files) and its name is what one caller wins.
 *
 * Bounded retry (`maxAttempts`, default 50): on `EEXIST` the candidate number increments and the claim
 * is retried; any other error is rethrown immediately (not a collision — a real filesystem problem).
 * Exhausting `maxAttempts` throws a named error rather than looping forever — that many concurrent
 * claimants (or a `.claims/` directory stuck from a prior crash) is an operational condition a caller
 * should see, not spin against silently.
 *
 * @param {string} dir the family's harness-runs directory (created if it doesn't exist yet)
 * @param {string} family e.g. "mint" — not validated against ALLOWED_FAMILIES here (the caller's own
 *   artifact write will validate it via writeRunArtifact -> validateRunArtifact)
 * @param {{maxAttempts?: number, startAt?: number}} [opts] `startAt` skips the highest-existing scan and
 *   forces the first candidate number — the normal caller never sets this (the scan already picks a safe
 *   starting point); it exists so a test can force a REAL EEXIST collision deterministically (a true
 *   concurrent race is otherwise the only way to exercise the retry branch below, since the scan makes a
 *   single-process collision impossible by construction).
 * @returns {string} the claimed run_id, e.g. "mint-run-007"
 */
export function claimRunId(dir, family, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 50;
  const resolved = resolve(dir);
  const claimsDir = join(resolved, ".claims");
  mkdirSync(claimsDir, { recursive: true });

  let n = opts.startAt ?? highestClaimedOrWrittenRunNumber(resolved, family) + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const runId = `${family}-run-${String(n).padStart(3, "0")}`;
    const claimPath = join(claimsDir, `${runId}.json.claim`);
    try {
      mkdirSync(claimPath, { recursive: false });
      return runId; // won the race for this number — mkdir's atomicity is the whole guarantee
    } catch (err) {
      if (err.code === "EEXIST") {
        n += 1; // someone else (or an earlier attempt this call) already holds this number — try the next
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `claimRunId: could not claim a run_id for family "${family}" under ${resolved} after ` +
      `${maxAttempts} attempts — either an unusually high number of concurrent claimants, or a stale ` +
      `${claimsDir} left over from a previous run (safe to inspect and prune by hand if so).`,
  );
}

/**
 * Read every run artifact in dir. Pure filesystem read: never throws on a corrupt/invalid file — those
 * are reported in `invalid` instead, so one bad file never blocks a proposer lane from reading the rest
 * of the family's history. `runs` is sorted ascending by started_at (ties broken by run_id).
 * @param {string} dir
 * @returns {{runs: object[], invalid: {file:string, reason:string}[]}}
 */
export function readRunHistory(dir) {
  const resolved = resolve(dir);
  if (!existsSync(resolved)) return { runs: [], invalid: [] };

  const files = readdirSync(resolved).filter((f) => f.endsWith(".json")).sort();
  const runs = [];
  const invalid = [];

  for (const file of files) {
    const full = join(resolved, file);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, "utf8"));
    } catch (err) {
      invalid.push({ file, reason: `unparseable JSON: ${err.message}` });
      continue;
    }
    const errors = validateRunArtifact(parsed);
    if (errors.length) {
      invalid.push({ file, reason: errors.join("; ") });
      continue;
    }
    runs.push(parsed);
  }

  runs.sort((a, b) => {
    const byTime = Date.parse(a.started_at) - Date.parse(b.started_at);
    if (byTime !== 0) return byTime;
    return a.run_id < b.run_id ? -1 : a.run_id > b.run_id ? 1 : 0;
  });

  return { runs, invalid };
}

/**
 * Content-hash a harness's own source files into a `harness_version` string: sha256 over
 * "<relative-path>\n<content>\n" per file (sorted by path), truncated to 16 hex chars, prefixed
 * "sha256:". Deterministic — byte-identical files always hash identically; any edit to any listed file
 * changes it. `baseDir` (default cwd) is what paths are made relative to for hashing, so the hash is
 * stable across checkouts at different absolute paths.
 * @param {string[]} filePaths absolute or baseDir-relative paths to hash
 * @param {string} [baseDir]
 * @returns {string} e.g. "sha256:9f2a1c4b7e0d3a5f"
 */
export function hashHarnessVersion(filePaths, baseDir = process.cwd()) {
  const base = resolve(baseDir);
  const entries = filePaths
    .map((p) => {
      const abs = resolve(base, p);
      const rel = relative(base, abs);
      const content = readFileSync(abs, "utf8");
      return { rel, content };
    })
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  // One-shot crypto.hash() over the concatenated "<rel>\n<content>\n" pieces — byte-for-byte the
  // same digest a createHash().update()-per-piece loop would produce (a hash digest over a stream
  // of updates is identical to a digest over the same bytes concatenated first), but deliberately
  // NOT written as createHash(...).update(...): that exact shape text-matches coverage-scan.mjs's
  // WRITE_RE (`.update(` reads as a Supabase row mutation to a regex that cannot tell a hash
  // accumulator from a database call) — the identical false-positive class already on record for
  // src/lib/agent/gate-a-scan.mjs's own md5() (see docs/ops/session-log.md Addendum 71, "Fix lane
  // L-0"). Same fix as that precedent: Node's one-shot digest (crypto.hash), not the two-step hasher.
  const combined = entries.map(({ rel, content }) => `${rel}\n${content}\n`).join("");
  return `sha256:${crypto.hash("sha256", combined, "hex").slice(0, 16)}`;
}

function stringifyMetricValue(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Build a short, scannable "metric headline" from a run's free-form `metrics` object: up to
 * `maxKeys` top-level entries, each truncated to `maxLen` chars, as `key=value`. `metrics` is
 * intentionally family-specific and unconstrained (CONVENTION.md), so this stays family-agnostic —
 * it reads whatever keys the family's own report tallied, in the order it wrote them, rather than
 * hardcoding any family's field names.
 * @param {object} metrics
 * @param {number} [maxKeys]
 * @param {number} [maxLen]
 * @returns {string}
 */
export function metricHeadline(metrics, maxKeys = 3, maxLen = 60) {
  const keys = Object.keys(metrics ?? {});
  if (keys.length === 0) return "(no metrics)";
  return keys
    .slice(0, maxKeys)
    .map((k) => {
      let v = stringifyMetricValue(metrics[k]);
      if (v.length > maxLen) v = `${v.slice(0, maxLen - 1)}…`;
      return `${k}=${v}`;
    })
    .join(" ");
}

/**
 * Build the CLI's --list output: one line per run — run_id, started_at, a metric headline (see
 * metricHeadline), defect count — per CONVENTION.md's lightweight-CLI guidance. Exported so tests
 * can assert on its shape without a subprocess.
 * @param {object[]} runs
 * @returns {string}
 */
export function formatRunListing(runs) {
  if (runs.length === 0) return "(no runs)";
  return runs
    .map(
      (run) =>
        `${run.run_id}  ${run.started_at}  ${metricHeadline(run.metrics)}  defects=${run.defects_found.length}`,
    )
    .join("\n");
}

function parseArgs(argv) {
  const args = { dir: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") args.dir = argv[++i];
    else if (a.startsWith("--dir=")) args.dir = a.slice("--dir=".length);
    else if (a === "--list") args.list = true;
  }
  return args;
}

// ── `list [family]` / `show <family> <run>` — Wave MH-5's bin-guard CLI ─────────────────────────
//
// CONVENTION.md's "Reading" section promises "a lightweight CLI ships in the same module ... so a
// proposer lane (or a human) can survey a family's history without opening every file" — but until
// this wave, that promise only ever had `--dir <path> --list` (kept below, unchanged, for anyone
// already scripted against it) with no shorter, family-name-first form and no per-run `show`. These
// two subcommands are the actual "simple navigability" CONVENTION.md describes:
//
//   node scripts/lib/run-artifact.mjs list                    # every family, one summary line each
//   node scripts/lib/run-artifact.mjs list mint                # one line per mint run (formatRunListing)
//   node scripts/lib/run-artifact.mjs show mint mint-run-003   # one run's full artifact JSON
//   node scripts/lib/run-artifact.mjs show mint 3              # same — numeric shorthand accepted
//
// Both resolve family directories relative to THIS file's own location (scripts/harness-runs/<family>,
// a sibling of scripts/lib/), not cwd — so the CLI works the same regardless of where it's invoked
// from, matching CONVENTION.md's directory layout rather than requiring --dir every time.

const HERE_DIR = (() => {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd(); // import.meta.url can be unavailable in some non-ESM test harnesses; harmless fallback, only used by the CLI's default-root resolution
  }
})();
export const DEFAULT_HARNESS_RUNS_ROOT = resolve(HERE_DIR, "..", "harness-runs");

/**
 * `list` with no family: one summary line per family directory found under `root` — name, run count,
 * invalid-file count, and the latest valid run's id/started_at. Pure-ish (filesystem read via
 * readRunHistory, no writes, never throws — a missing/unreadable root just yields "no families").
 * Exported so the subcommand's exact output shape is testable without a subprocess.
 * @param {string} root
 * @returns {string}
 */
export function listFamiliesSummary(root) {
  let familyNames = [];
  try {
    familyNames = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    familyNames = [];
  }
  if (familyNames.length === 0) return `(no harness-run families found under ${root})`;

  return familyNames
    .map((name) => {
      const { runs, invalid } = readRunHistory(join(root, name));
      const latest = runs.at(-1);
      const latestDesc = latest ? `${latest.run_id} (${latest.started_at})` : "(no valid runs)";
      const invalidNote = invalid.length ? `, ${invalid.length} invalid file(s)` : "";
      return `${name}: ${runs.length} run(s)${invalidNote} — latest: ${latestDesc}`;
    })
    .join("\n");
}

/**
 * Accepts either a full run_id ("mint-run-007") or a bare/short number ("7", "007") for `show`'s
 * second argument, and returns the resolved run_id. Anything else is returned unchanged — `show`'s own
 * "no such file" handling reports the problem rather than this function guessing further.
 * @param {string} family
 * @param {string} runArg
 * @returns {string}
 */
export function resolveRunIdArg(family, runArg) {
  if (typeof runArg !== "string") return runArg;
  if (runIdPattern(family).test(runArg)) return runArg;
  if (/^\d{1,3}$/.test(runArg)) return `${family}-run-${runArg.padStart(3, "0")}`;
  return runArg;
}

/**
 * Read and parse one run artifact file at `path`. Pure filesystem read, throws (never process.exit —
 * that's the CLI wrapper's job) on a missing file or unparseable JSON, so `show`'s test coverage can
 * assert on the exact error without spawning a subprocess.
 * @param {string} path
 * @returns {object}
 */
export function loadRunArtifactJSON(path) {
  if (!existsSync(path)) {
    throw new Error(`no such run artifact: ${path}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`);
  }
  return parsed;
}

function cliList(family) {
  if (!family) {
    console.log(listFamiliesSummary(DEFAULT_HARNESS_RUNS_ROOT));
    return;
  }
  const dir = join(DEFAULT_HARNESS_RUNS_ROOT, family);
  const { runs, invalid } = readRunHistory(dir);
  console.log(formatRunListing(runs));
  if (invalid.length) {
    console.error(`\n${invalid.length} invalid file(s) in ${dir}:`);
    for (const inv of invalid) console.error(`  ${inv.file}: ${inv.reason}`);
  }
}

function cliShow(family, runArg) {
  if (!family || !runArg) {
    console.error("Usage: node scripts/lib/run-artifact.mjs show <family> <run>");
    process.exit(1);
  }
  const runId = resolveRunIdArg(family, runArg);
  const path = join(DEFAULT_HARNESS_RUNS_ROOT, family, `${runId}.json`);
  try {
    console.log(JSON.stringify(loadRunArtifactJSON(path), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === "list") {
    cliList(argv[1] ?? null);
    return;
  }
  if (argv[0] === "show") {
    cliShow(argv[1], argv[2]);
    return;
  }

  // Legacy form, kept working unchanged: --dir <path> --list.
  const args = parseArgs(argv);
  if (!args.dir) {
    console.error(
      "Usage: node scripts/lib/run-artifact.mjs list [family]\n" +
        "       node scripts/lib/run-artifact.mjs show <family> <run>\n" +
        "       node scripts/lib/run-artifact.mjs --dir path/to/harness-runs/<family> --list",
    );
    process.exit(1);
  }
  const { runs, invalid } = readRunHistory(args.dir);
  if (args.list) {
    console.log(formatRunListing(runs));
    if (invalid.length) {
      console.error(`\n${invalid.length} invalid file(s) in ${args.dir}:`);
      for (const inv of invalid) console.error(`  ${inv.file}: ${inv.reason}`);
    }
    return;
  }
  console.log(JSON.stringify({ runs, invalid }, null, 2));
}

// Only run main() when this file is executed directly (not when imported by the test suite) — same
// guard as screen-worklist.mjs.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
