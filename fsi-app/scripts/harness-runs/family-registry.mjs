#!/usr/bin/env node
// family-registry.mjs, the harness family descriptor loader (lane N2, 2026-09-19, build plan section 6.8
// Rule A: "a harness family is a directory with a descriptor, never a line in three shared files").
//
// WHY THIS EXISTS. On 2026-09-18 three lanes (M8, M9b, M9a) each registered or touched a harness family
// and each stopped the merge train, because registering a family meant appending to the SAME spot in
// three files at once: GOVERNING_FILES (scripts/harness-runs/governing-files.mjs), ALLOWED_FAMILIES
// (scripts/lib/run-artifact.mjs), and two places in CONVENTION.md (the directory-layout block and the
// harness_version table, which F28-harness-run-integrity.test.mjs's CONVENTION-TABLE-PARITY test parses).
// Three lanes racing to append to the same three shared files is a structural collision, not a discipline
// failure, nothing about "append carefully" fixes a race on the same insertion point.
//
// THE FIX: a harness family is now a DIRECTORY with a family.json descriptor, nothing else. Registering a
// new family means adding a new subdirectory under scripts/harness-runs/ with its own family.json, no
// shared file is edited, so two lanes registering two different families in the same window cannot
// collide (proven by this module's own test: a fixture with two new family directories added side by side
// loads both). GOVERNING_FILES and ALLOWED_FAMILIES are now DERIVED from FAMILIES (see governing-files.mjs
// and run-artifact.mjs), not hand-maintained, this module is the one place that reads the descriptors off
// disk and turns them into the FAMILIES array everything else derives from.
//
// SHAPE of family.json (one per family directory):
//   {
//     "family": "<dir name>",           // must equal the directory name, no rename-without-moving
//     "registered": "YYYY-MM-DD",       // when this family entered the harness-run convention
//     "registered_by": "<lane or task>", // the lane/task/wave that registered it
//     "governing_files": ["...", ...],  // non-empty array of fsi-app-relative path strings
//     "rationale": "<prose>"            // why these files, in the family's own words
//   }
// No unknown keys. A descriptor that fails validation throws a NAMED error (never silently skipped) , 
// same fail-closed posture as scripts/lib/run-artifact.mjs's validateRunArtifact.
//
// No I/O side effects on import, loadFamilies() is a function, not a top-level read, so importing this
// module never touches the filesystem; only calling loadFamilies() (or the frozen FAMILIES export below,
// which calls it once at import time deliberately, mirroring GOVERNING_FILES/ALLOWED_FAMILIES's own
// "computed once, frozen, exported" shape) does. $0, no network, no DB, same discipline as
// governing-files.mjs and run-artifact.mjs.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE_DIR = (() => {
  try {
    return resolve(fileURLToPath(import.meta.url), "..");
  } catch {
    return process.cwd();
  }
})();

// scripts/harness-runs/ itself, the directory this module lives in and scans.
export const HARNESS_RUNS_DIR = HERE_DIR;

const REQUIRED_KEYS = Object.freeze(["family", "registered", "registered_by", "governing_files", "rationale"]);
const ALLOWED_KEYS = new Set(REQUIRED_KEYS);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Nothing under a family's own pending/ directory is ever a governing file (lane N3, 2026-09-19, build
// plan section 6.8 Rule B): a pending/ file is a lane's own acknowledgment that a run is owed, never
// content whose bytes should move the family's harness_version. Matches a "pending" path segment
// anywhere in the string, not only a leading one, since governing_files entries are family-relative in
// spirit but some carry a leading "../" (e.g. a workflow file) or a src/ prefix.
const PENDING_SEGMENT_RE = /(^|\/)pending\//;

/** Thrown for any invalid family.json descriptor. Named so a caller can distinguish this from a plain
 * filesystem/parse error and so a violation message always names the offending file. */
export class FamilyDescriptorError extends Error {
  constructor(message) {
    super(message);
    this.name = "FamilyDescriptorError";
  }
}

/**
 * Validate one parsed family.json object against the shape family-registry.mjs requires. Pure, no I/O.
 * @param {string} dirName the directory the descriptor was read from (family must equal this)
 * @param {unknown} descriptor the parsed JSON
 * @returns {string[]} errors, empty if valid
 */
export function validateFamilyDescriptor(dirName, descriptor) {
  const errors = [];
  if (descriptor === null || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    return [`${dirName}/family.json must be a plain JSON object`];
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in descriptor)) errors.push(`${dirName}/family.json is missing required field: ${key}`);
  }
  for (const key of Object.keys(descriptor)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`${dirName}/family.json has unknown field: ${key}`);
  }
  if (errors.length) return errors; // type checks below assume presence

  if (descriptor.family !== dirName) {
    errors.push(
      `${dirName}/family.json's "family" field ("${descriptor.family}") must equal its own directory name ("${dirName}")`,
    );
  }
  if (typeof descriptor.registered !== "string" || !DATE_RE.test(descriptor.registered)) {
    errors.push(`${dirName}/family.json's "registered" must be a YYYY-MM-DD date string, got ${JSON.stringify(descriptor.registered)}`);
  } else if (Number.isNaN(Date.parse(descriptor.registered))) {
    errors.push(`${dirName}/family.json's "registered" ("${descriptor.registered}") does not parse as a valid date`);
  }
  if (typeof descriptor.registered_by !== "string" || descriptor.registered_by.trim().length === 0) {
    errors.push(`${dirName}/family.json's "registered_by" must be a non-empty string`);
  }
  if (!Array.isArray(descriptor.governing_files) || descriptor.governing_files.length === 0) {
    errors.push(`${dirName}/family.json's "governing_files" must be a non-empty array`);
  } else {
    descriptor.governing_files.forEach((f, i) => {
      if (typeof f !== "string" || f.trim().length === 0) {
        errors.push(`${dirName}/family.json's governing_files[${i}] must be a non-empty string`);
      } else if (PENDING_SEGMENT_RE.test(f)) {
        errors.push(
          `${dirName}/family.json's governing_files[${i}] ("${f}") is under a pending/ directory, ` +
            `nothing under pending/ is ever a governing file (build plan section 6.8, Rule B)`,
        );
      }
    });
  }
  if (typeof descriptor.rationale !== "string") {
    errors.push(`${dirName}/family.json's "rationale" must be a string`);
  }

  return errors;
}

/**
 * Read every immediate subdirectory of `harnessRunsDir` that contains a family.json, validate each, and
 * return them as an array of descriptors sorted by `registered` then `family` (deterministic, no shared
 * counter or insertion point for two new families to collide on, which is the exact 2026-09-18 collision
 * this module exists to make impossible). A subdirectory with no family.json is skipped (not every
 * directory under scripts/harness-runs/ is a family, `.claims/` markers, a family's own `traces/`
 * subdirectory, etc.). Throws FamilyDescriptorError, named, on the FIRST invalid descriptor found, a
 * fail-closed posture matching validateRunArtifact/writeRunArtifact's own "never proceed on invalid data".
 * @param {string} [harnessRunsDir] defaults to this module's own directory
 * @returns {object[]} validated descriptors, sorted by registered then family
 */
export function loadFamilies(harnessRunsDir = HARNESS_RUNS_DIR) {
  const resolved = resolve(harnessRunsDir);
  let entries = [];
  try {
    entries = readdirSync(resolved, { withFileTypes: true });
  } catch (err) {
    throw new FamilyDescriptorError(`family-registry: cannot read ${resolved}: ${err.message}`);
  }

  const descriptors = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const descriptorPath = join(resolved, entry.name, "family.json");
    if (!existsSync(descriptorPath)) continue; // not every subdirectory is a family (traces/, .claims/, ...)

    let raw;
    try {
      raw = readFileSync(descriptorPath, "utf8");
    } catch (err) {
      throw new FamilyDescriptorError(`family-registry: cannot read ${descriptorPath}: ${err.message}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new FamilyDescriptorError(`family-registry: ${descriptorPath} is not valid JSON: ${err.message}`);
    }
    const errors = validateFamilyDescriptor(entry.name, parsed);
    if (errors.length) {
      throw new FamilyDescriptorError(`family-registry: invalid descriptor ${descriptorPath}: ${errors.join("; ")}`);
    }
    descriptors.push(Object.freeze({ ...parsed, governing_files: Object.freeze([...parsed.governing_files]) }));
  }

  descriptors.sort((a, b) => {
    if (a.registered !== b.registered) return a.registered < b.registered ? -1 : 1;
    return a.family < b.family ? -1 : a.family > b.family ? 1 : 0;
  });

  return descriptors;
}

// Computed once at import time and frozen, the same "read the tree once, export a frozen value" shape
// GOVERNING_FILES and ALLOWED_FAMILIES already used before this lane, so every importer of FAMILIES sees
// one consistent snapshot per process, never a second disk read mid-request.
export const FAMILIES = Object.freeze(loadFamilies());
