// load-registry.mjs -- the producer registry loader (lane S8-E0, 2026-10-07; plan Stage 8, spec 09 S1.1 to
// S1.8). The registry is a DIRECTORY (the F51 entry-dir pattern): one JSON file per producer in this
// folder, so the eight domain lanes each add one file and never edit producers.yml. producers.yml's
// "registry producers" step runs scripts/producers/registry/run-registered.mjs, which iterates what this
// loader returns; there is no hand list of registry producers anywhere else.
//
// TO ADD A PRODUCER: add <name>.json here (filename equals the entry's name). Required fields:
//   name          kebab-case id, equal to the filename stem
//   script        fsi-app-relative path under scripts/producers/ or scripts/gen/ (must exist on disk)
//   domain_table  the table the producer feeds (snake_case)
//   source        the source-licence register key (or data_sources key) the rows are attributed to
//   licence       the licence statement for that source, as written in the register
//   dry_capable   must be true: every registry producer is dry by default and takes --apply
//   enabled_env   the runtime kill-switch env var the runner sets to "1" for the run, or null
//   in_all        true: runs in the producer=all sweep; false: runs only when named
// Optional: args (static CLI args, never --apply), pre ({script, args, since_flag}: a fetch stage run
// first, given --since <date> when the dispatch passes one), entity_id (lane L4-E, 2026-10-08: the entity
// the producer's rows describe, `cl:<kind>:<16 hex>`; checked for SHAPE only, never against the live
// entities table; the runner hands it to the producer as PRODUCER_ENTITY_ID_ENV and the producer's write
// path stamps it on the rows it writes, which is what lets an outbox row for those rows reach an item).
// The runner appends --apply itself.
// Unknown fields are refused, so a typo cannot silently do nothing.
//
// Pure apart from reading the directory and checking that each script exists; the existence probe is
// injectable so tests need no files on disk.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertEntityId } from "../../../src/lib/entities/entity-id-shape.mjs";

/** The env var the runner sets on the producer child when the entry carries an entity_id. One name, read by
 *  the producers' shared write path (src/lib/market/write-market-series.mjs entityIdFromEnv). */
export const PRODUCER_ENTITY_ID_ENV = "PRODUCER_ENTITY_ID";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REGISTRY_DIR = HERE;
const FSI_ROOT = resolve(HERE, "..", "..", "..");

const NAME_RE = /^[a-z][a-z0-9-]*$/;
const TABLE_RE = /^[a-z][a-z0-9_]*$/;
const ENV_RE = /^[A-Z][A-Z0-9_]*$/;
const SCRIPT_RE = /^scripts\/(producers|gen)\/[A-Za-z0-9_./-]+\.mjs$/;
const REQUIRED = ["name", "script", "domain_table", "source", "licence", "dry_capable", "enabled_env", "in_all"];
const OPTIONAL = ["args", "pre", "entity_id"];
const PRE_FIELDS = ["script", "args", "since_flag"];
const MODE_FLAGS = ["--apply", "--dry"];

function fail(file, msg) {
  throw new Error(`producer registry: ${file}: ${msg}`);
}

function checkScript(file, label, value, exists, fsiRoot) {
  if (typeof value !== "string" || !SCRIPT_RE.test(value) || value.includes("..")) {
    fail(file, `${label} must match ${SCRIPT_RE} with no ".." segment (got ${JSON.stringify(value)})`);
  }
  if (!exists(resolve(fsiRoot, value))) fail(file, `${label} script does not exist: ${value}`);
}

function checkArgs(file, label, args) {
  if (!Array.isArray(args) || !args.every((a) => typeof a === "string" && a.length > 0)) {
    fail(file, `${label} must be an array of non-empty strings`);
  }
  for (const flag of MODE_FLAGS) {
    if (args.includes(flag)) fail(file, `${label} must not carry ${flag}; the runner owns the mode`);
  }
}

/** Validate one parsed entry. Throws a message naming the file. @returns {object} the entry */
export function validateEntry(file, entry, { exists = existsSync, fsiRoot = FSI_ROOT } = {}) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) fail(file, "entry must be a JSON object");
  for (const f of REQUIRED) if (!(f in entry)) fail(file, `missing required field "${f}"`);
  for (const f of Object.keys(entry)) {
    if (!REQUIRED.includes(f) && !OPTIONAL.includes(f)) fail(file, `unknown field "${f}"`);
  }
  if (typeof entry.name !== "string" || !NAME_RE.test(entry.name)) fail(file, `name must match ${NAME_RE}`);
  if (file !== `${entry.name}.json`) fail(file, `filename must be ${entry.name}.json`);
  if (typeof entry.domain_table !== "string" || !TABLE_RE.test(entry.domain_table)) fail(file, `domain_table must match ${TABLE_RE}`);
  for (const f of ["source", "licence"]) {
    if (typeof entry[f] !== "string" || entry[f].trim() === "") fail(file, `${f} must be a non-empty string`);
  }
  if (entry.dry_capable !== true) fail(file, "dry_capable must be true: a registry producer is dry by default");
  if (entry.enabled_env !== null && (typeof entry.enabled_env !== "string" || !ENV_RE.test(entry.enabled_env))) {
    fail(file, "enabled_env must be null or an UPPER_SNAKE env var name");
  }
  if (typeof entry.in_all !== "boolean") fail(file, "in_all must be a boolean");
  checkScript(file, "script", entry.script, exists, fsiRoot);
  if ("args" in entry) checkArgs(file, "args", entry.args);
  if ("entity_id" in entry) {
    try {
      assertEntityId(entry.entity_id);
    } catch (e) {
      fail(file, `entity_id must be a well-formed entity id cl:<kind>:<16 hex> (${e.message})`);
    }
  }
  if ("pre" in entry) {
    const pre = entry.pre;
    if (pre === null || typeof pre !== "object" || Array.isArray(pre)) fail(file, "pre must be an object");
    for (const f of Object.keys(pre)) if (!PRE_FIELDS.includes(f)) fail(file, `unknown pre field "${f}"`);
    if (!("script" in pre)) fail(file, "pre.script is required");
    checkScript(file, "pre.script", pre.script, exists, fsiRoot);
    if ("args" in pre) checkArgs(file, "pre.args", pre.args);
    if ("since_flag" in pre && (typeof pre.since_flag !== "string" || !/^--[a-z][a-z-]*$/.test(pre.since_flag))) {
      fail(file, "pre.since_flag must be a long flag such as --since");
    }
  }
  return entry;
}

/**
 * Load every <name>.json in `dir`, validate each, refuse duplicate names, return them sorted by filename.
 * @param {string} dir
 * @param {{exists?: (p: string) => boolean, fsiRoot?: string}} [deps]
 * @returns {ReadonlyArray<object>}
 */
export function loadProducerRegistry(dir = REGISTRY_DIR, deps = {}) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const seen = new Map();
  const entries = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      fail(file, `not valid JSON (${e.message})`);
    }
    const entry = validateEntry(file, parsed, deps);
    if (seen.has(entry.name)) fail(file, `duplicate name "${entry.name}" (also ${seen.get(entry.name)})`);
    seen.set(entry.name, file);
    entries.push(entry);
  }
  return Object.freeze(entries);
}

/**
 * Which registry entries a dispatch runs. producer "all" runs the in_all entries; producer "registry" runs
 * the entry named by `only` (even when not in_all), or the in_all entries when `only` is empty. Any other
 * producer value belongs to a non-registry step and selects nothing.
 */
export function selectRuns(entries, { producer, only = "" }) {
  if (only && producer !== "registry") fail("dispatch", `only applies when producer is "registry" (producer is "${producer}")`);
  if (producer === "all" || (producer === "registry" && !only)) return entries.filter((e) => e.in_all);
  if (producer === "registry") {
    const hit = entries.find((e) => e.name === only);
    if (!hit) fail("dispatch", `unknown registry producer "${only}" (known: ${entries.map((e) => e.name).join(", ")})`);
    return [hit];
  }
  return [];
}

/**
 * The child commands for one entry in order: the optional pre stage, then the producer. Mode "apply"
 * appends --apply to the producer only (a fetch stage writes nothing and has no mode). Each command
 * carries the env the runner must add (the entry's kill switch).
 * @returns {Array<{args: string[], env: Record<string,string>}>}
 */
export function buildCommands(entry, { mode, since = "" }) {
  if (mode !== "dry" && mode !== "apply") fail("dispatch", "mode must be dry or apply");
  const env = entry.enabled_env ? { [entry.enabled_env]: "1" } : {};
  const out = [];
  if (entry.pre) {
    const args = [entry.pre.script, ...(entry.pre.args ?? [])];
    if (since && entry.pre.since_flag) args.push(entry.pre.since_flag, since);
    out.push({ args, env });
  }
  const producerEnv = entry.entity_id ? { ...env, [PRODUCER_ENTITY_ID_ENV]: entry.entity_id } : env;
  out.push({ args: [entry.script, ...(entry.args ?? []), ...(mode === "apply" ? ["--apply"] : [])], env: producerEnv });
  return out;
}
