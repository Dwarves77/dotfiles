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
import { join, resolve, relative } from "node:path";

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
    errors.push(
      `harness_family "${artifact.harness_family}" is not one of ${JSON.stringify(ALLOWED_FAMILIES)}`,
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) {
    console.error("Usage: node scripts/lib/run-artifact.mjs --dir path/to/harness-runs/<family> --list");
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
