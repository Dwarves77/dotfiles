// scripts/proof/steps/manifest.mjs -- PROOF-3 (lane proof3-chain-steps, 2026-10-07): load and validate the chain
// proof's step manifest (chain-steps.json) against the repo's own hop registry.
//
// The manifest maps the hops of fsi-app/.discipline/governance/loop-hops.d (01 to 13) to the script each
// workflow runs, in apply mode, with a read-back assertion per step. This module owns three things and
// nothing else: reading the manifest, reading the hop registry, and the structural validation the tests and
// the runner both call (so a manifest that the tests accept is a manifest the runner accepts).
//
// A hop registry file is the source of truth for which workflow consumes which; the manifest is checked against
// it, never against a second hand-kept list: every hop must be covered by a step whose workflow file is the hop's
// consumer and whose upstream workflow name is the hop's producer, and the steps must run in hop order.
//
// Template variables in assertion SQL and var queries use {{name}} and {{name.stepId}}; the names are fixed by
// TEMPLATE_VARS below and a value is only ever inlined after the pattern check in substitute().

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MANIFEST = join(HERE, "chain-steps.json");
export const DEFAULT_HOPS_DIR = resolve(HERE, "..", "..", "..", ".discipline", "governance", "loop-hops.d");

export const ASSERTION_KINDS = Object.freeze(["count", "max", "growth", "any_of", "snapshot_changed"]);
export const STEP_KINDS = Object.freeze(["script", "assert", "check"]);
export const EVENTS = Object.freeze(["workflow_dispatch", "workflow_run"]);
/** Variables a template may name. `run_id`, `started_at` and `upstream_run_id` also take a `.stepId` suffix. */
export const TEMPLATE_VARS = Object.freeze(["run_id", "started_at", "loop_run_id", "upstream_run_id"]);

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;
const STEP_ID_RE = /^[a-z][a-z0-9-]*$/;
/** What a substituted value may look like: digits, letters, ISO timestamps, dashes, commas. Never a quote. */
const SAFE_VALUE_RE = /^[0-9A-Za-z:.+\- ,_]*$/;

/** Read and parse the manifest. @param {string} [path] @param {typeof readFileSync} [readFn] */
export function loadManifest(path = DEFAULT_MANIFEST, readFn = readFileSync) {
  return JSON.parse(readFn(path, "utf8"));
}

/**
 * Read the hop registry: one entry per loop-hops.d file, in numeric order.
 * @param {string} [dir] @param {typeof readdirSync} [listFn] @param {typeof readFileSync} [readFn]
 * @returns {{num: string, id: string, producerName: string, producerFile: string, consumerFile: string, consumerName: string}[]}
 */
export function loadHops(dir = DEFAULT_HOPS_DIR, listFn = readdirSync, readFn = readFileSync) {
  return listFn(dir)
    .filter((n) => /^\d\d-.+\.json$/.test(n))
    .sort()
    .map((n) => {
      const j = JSON.parse(readFn(join(dir, n), "utf8"));
      return {
        num: n.slice(0, 2),
        id: j.id,
        producerName: j.producer.name,
        producerFile: j.producer.file,
        consumerFile: j.consumer.file,
        consumerName: j.consumer.name,
      };
    });
}

/** Replace {{name}} / {{name.stepId}} in `template` from `vars` (a flat map keyed "name" or "name.stepId"). PURE.
 *  Throws on an unknown variable or a value that is not safe to inline into SQL. */
export function substitute(template, vars) {
  return String(template).replace(/\{\{\s*([a-z_]+(?:\.[a-z][a-z0-9-]*)?)\s*\}\}/g, (_, key) => {
    const base = key.split(".")[0];
    if (!TEMPLATE_VARS.includes(base)) throw new Error(`unknown template variable {{${key}}}`);
    if (!(key in vars) || vars[key] === null || vars[key] === undefined) throw new Error(`template variable {{${key}}} has no value yet`);
    const v = String(vars[key]);
    if (!SAFE_VALUE_RE.test(v)) throw new Error(`template variable {{${key}}} holds a value that is not safe to inline`);
    return v;
  });
}

/** Every {{...}} key named in a string. PURE. */
export function templateKeys(template) {
  return [...String(template).matchAll(/\{\{\s*([a-z_]+(?:\.[a-z][a-z0-9-]*)?)\s*\}\}/g)].map((m) => m[1]);
}

/** One assertion's own structural errors. PURE. Returns strings prefixed with where. */
export function validateAssertion(a, where) {
  const errors = [];
  const at = (m) => errors.push(`${where}: ${m}`);
  if (!a || typeof a !== "object") return [`${where}: must be an object`];
  if (typeof a.id !== "string" || !STEP_ID_RE.test(a.id)) at(`id must match ${STEP_ID_RE}`);
  if (!ASSERTION_KINDS.includes(a.kind)) { at(`kind must be one of ${ASSERTION_KINDS.join(", ")}`); return errors; }
  const checkTable = (t, w) => { if (typeof t !== "string" || !IDENT_RE.test(t)) errors.push(`${w}: table must be a plain identifier (got ${JSON.stringify(t)})`); };
  const checkPred = (p, w) => { if (typeof p !== "string" || p.trim() === "") errors.push(`${w}: predicate must be a non-empty string`); };
  const checkMin = (m, ms, w) => {
    const okNum = Number.isInteger(m) && m >= 0;
    const okSql = typeof ms === "string" && /^\s*select\b/i.test(ms);
    if (!okNum && !okSql) errors.push(`${w}: min must be a non-negative integer or minSql must be a SELECT`);
  };
  if (a.kind === "any_of") {
    if (!Array.isArray(a.of) || a.of.length < 2) at("any_of needs at least two alternatives");
    else a.of.forEach((alt, i) => {
      const w = `${where} of[${i}]`;
      checkTable(alt.table, w); checkPred(alt.predicate, w); checkMin(alt.min, alt.minSql, w);
    });
    return errors;
  }
  checkTable(a.table, where);
  if (a.kind === "snapshot_changed") {
    if (typeof a.snapshot !== "string" || !STEP_ID_RE.test(a.snapshot)) at("snapshot must name a snapshot key");
    checkMin(a.min, a.minSql, where);
    return errors;
  }
  checkPred(a.predicate, where);
  if (a.kind === "max") {
    if (!Number.isInteger(a.max) || a.max < 0) at("max must be a non-negative integer");
  } else {
    checkMin(a.min, a.minSql, where);
  }
  if (a.kind === "growth" && a.direction !== undefined && !["up", "down"].includes(a.direction)) at('direction must be "up" or "down"');
  return errors;
}

/**
 * Validate a manifest against the hop registry. PURE. Returns human-readable errors (empty = valid).
 * Rules: unique step ids; every step has a kind, a prelude-compatible script (script steps) and at least one
 * explicit assertion; every hop of the registry is covered by a step whose workflow file and upstream workflow
 * name are the hop's consumer and producer; a chained step names an upstream step that runs earlier; hops run in
 * numeric order; every template key an assertion or var query names is one that exists by then.
 * @param {object} manifest @param {ReturnType<typeof loadHops>} hops
 */
export function validateManifest(manifest, hops) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") return ["manifest must be an object"];
  if (!Array.isArray(manifest.shell_prelude) || manifest.shell_prelude.length === 0) errors.push("shell_prelude must be a non-empty array of lines");
  if (!Array.isArray(manifest.steps) || manifest.steps.length === 0) return [...errors, "steps must be a non-empty array"];

  const byId = new Map();
  const covered = new Map();
  let lastHop = 0;
  manifest.steps.forEach((s, i) => {
    const where = `step[${i}] ${s?.id ?? "(no id)"}`;
    if (!s || typeof s !== "object") { errors.push(`${where}: must be an object`); return; }
    if (typeof s.id !== "string" || !STEP_ID_RE.test(s.id)) errors.push(`${where}: id must match ${STEP_ID_RE}`);
    if (byId.has(s.id)) errors.push(`${where}: duplicate step id`);
    if (!STEP_KINDS.includes(s.kind)) errors.push(`${where}: kind must be one of ${STEP_KINDS.join(", ")}`);
    if (typeof s.title !== "string" || s.title.trim() === "") errors.push(`${where}: title is required`);

    if (s.kind === "script") {
      if (!Array.isArray(s.script) || s.script.length === 0 || s.script.some((l) => typeof l !== "string")) errors.push(`${where}: script must be a non-empty array of lines`);
      if (typeof s.family !== "string" || s.family === "") errors.push(`${where}: family is required (the harness_runs row the step must land)`);
      if (!EVENTS.includes(s.event)) errors.push(`${where}: event must be one of ${EVENTS.join(", ")}`);
      if (typeof s.workflow !== "string" || typeof s.workflow_file !== "string") errors.push(`${where}: workflow and workflow_file are required`);
      if (typeof s.loop !== "boolean") errors.push(`${where}: loop must be true or false (does the step inherit the sweep's loop run id)`);
    }
    if (s.kind === "check" && s.check !== "hop-order") errors.push(`${where}: a check step must name check "hop-order"`);

    const explicit = Array.isArray(s.assertions) ? s.assertions : [];
    if (s.kind !== "check" && explicit.length === 0) errors.push(`${where}: every step needs at least one explicit assertion`);
    const aids = new Set();
    explicit.forEach((a, j) => {
      errors.push(...validateAssertion(a, `${where} assertion[${j}] ${a?.id ?? ""}`));
      if (a?.id && aids.has(a.id)) errors.push(`${where}: duplicate assertion id ${a.id}`);
      if (a?.id) aids.add(a.id);
    });

    // chained steps: upstream must be an earlier step
    if (s.upstream) {
      const up = byId.get(s.upstream.step);
      if (!up) errors.push(`${where}: upstream step ${s.upstream.step} must appear earlier in the manifest`);
      else if (up.workflow && s.upstream.name !== up.workflow) errors.push(`${where}: upstream name ${JSON.stringify(s.upstream.name)} is not the workflow name of step ${s.upstream.step} (${JSON.stringify(up.workflow)})`);
    } else if (s.kind === "script" && s.event === "workflow_run") {
      errors.push(`${where}: a workflow_run step must name its upstream`);
    }

    // template keys must be resolvable: a .stepId suffix names an earlier step (or this one)
    const keyBearers = [];
    for (const a of explicit) {
      for (const f of [a?.predicate, a?.minSql, ...(a?.of ?? []).flatMap((x) => [x.predicate, x.minSql])]) if (typeof f === "string") keyBearers.push(f);
    }
    for (const q of s.var_queries ?? []) if (typeof q?.sql === "string") keyBearers.push(q.sql);
    for (const f of keyBearers) {
      let keys;
      try { keys = templateKeys(f); } catch { keys = []; }
      for (const k of keys) {
        const [base, suffix] = k.split(".");
        if (!TEMPLATE_VARS.includes(base)) errors.push(`${where}: unknown template variable {{${k}}}`);
        else if (suffix && suffix !== s.id && !byId.has(suffix)) errors.push(`${where}: template {{${k}}} names a step that has not run yet`);
        else if (base === "upstream_run_id" && !s.upstream) errors.push(`${where}: {{upstream_run_id}} needs an upstream step`);
      }
    }

    if (s.hop !== null && s.hop !== undefined) {
      if (!/^\d\d$/.test(String(s.hop))) errors.push(`${where}: hop must be a two digit hop number or null`);
      else {
        const n = Number(s.hop);
        if (n < lastHop) errors.push(`${where}: hop ${s.hop} runs after hop ${String(lastHop).padStart(2, "0")}; hops must run in numeric order`);
        lastHop = Math.max(lastHop, n);
        if (!covered.has(s.hop)) covered.set(s.hop, []);
        covered.get(s.hop).push(s);
      }
    }
    byId.set(s.id, s);
  });

  // every hop of the registry covered, and matching the hop's consumer and producer
  for (const hop of hops) {
    const steps = covered.get(hop.num) ?? [];
    if (steps.length === 0) { errors.push(`hop ${hop.num} (${hop.id}) is not covered by any step`); continue; }
    for (const s of steps) {
      if (s.workflow_file !== hop.consumerFile) errors.push(`hop ${hop.num}: step ${s.id} runs ${s.workflow_file}, the hop's consumer is ${hop.consumerFile}`);
      if (s.upstream?.name !== hop.producerName) errors.push(`hop ${hop.num}: step ${s.id} chains from ${JSON.stringify(s.upstream?.name)}, the hop's producer is ${JSON.stringify(hop.producerName)}`);
    }
  }
  for (const num of covered.keys()) if (!hops.some((h) => h.num === num)) errors.push(`step names hop ${num}, which loop-hops.d does not have`);

  // a root step (hop null) must be the upstream of some later step, otherwise it feeds nothing
  for (const s of manifest.steps) {
    if (s.kind === "script" && (s.hop === null || s.hop === undefined) && s.event === "workflow_dispatch") {
      const feeds = manifest.steps.some((t) => t.upstream?.step === s.id);
      if (!feeds) errors.push(`root step ${s.id} feeds no later step`);
    }
  }
  return errors;
}
