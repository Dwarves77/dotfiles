// load-host-verdicts.mjs: reads every committed `host-verdicts-NNN.json` batch in this directory and
// returns ONE Map<host, verdict> for resolve-provisional-sources.mjs / enumerate-unclassified-hosts.mjs
// (lane S1-B, 2026-10-04). Mirrors the ledger-verdicts pattern (scripts/turns/run-ledger-consume.mjs's
// discoverVerdictsFiles: numbered batches, ascending, injectable fs) so there is one verdict-file idiom.
//
// WHY. A host the built-in class table cannot place used to park a `provisional_sources` row until a person
// edited RULED_HOST_TIER in code. A session lane now classifies such hosts into a committed batch and the
// resolver applies it by rule. See README.md.
//
// RULES (each enforced below, each tested):
//   - later batch wins per host (batches are applied in ascending number order);
//   - an entry's `class` must be a key of HOST_CLASS_TIER (host-authority.ts), never a free tier number: an
//     entry that carries a `tier` field, or names an unknown class, is REJECTED;
//   - rejection is PER ENTRY and never throws: the rest of the batch still applies and every rejection is
//     returned with its reason, so one bad line cannot block the resolver (no human gate, rule 6);
//   - a file that is not valid JSON or has no `entries` array is rejected whole, reported, never thrown;
//   - `verdict_source` must be "session-lane"; `evidence` (the page title or self-description the lane read)
//     must be a non-empty string; `generated_at` must parse as a date.
// The filename pattern is `host-verdicts-NNN.json` only, so `host-verdicts-000.fixture.json` (the test
// fixture) is never picked up by the real discovery.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isKnownHostClass } from "../../../src/lib/sources/host-authority.ts";

export const HOST_VERDICTS_DIR = dirname(fileURLToPath(import.meta.url));
const HOST_VERDICT_SOURCE = "session-lane";
const BATCH_FILENAME_RE = /^host-verdicts-(\d+)\.json$/;

/** Normalizes a host the way host-authority.ts does (www stripped, lowercased, no trailing dot). */
export function normalizeVerdictHost(host) {
  return String(host || "").trim().replace(/^www\./, "").toLowerCase().replace(/\.$/, "");
}

/** Committed batch filenames under `dir`, ascending by batch number, as absolute paths. A missing
 *  directory yields [] (no batches yet is not an error). @param {string} dir @param {{readdirSyncImpl?: Function}} [opts] */
export function discoverHostVerdictFiles(dir = HOST_VERDICTS_DIR, opts = {}) {
  let names;
  try {
    names = (opts.readdirSyncImpl ?? readdirSync)(dir);
  } catch {
    return [];
  }
  return names
    .map((name) => ({ name, m: BATCH_FILENAME_RE.exec(name) }))
    .filter((x) => x.m)
    .sort((a, b) => Number.parseInt(a.m[1], 10) - Number.parseInt(b.m[1], 10) || (a.name < b.name ? -1 : 1))
    .map((x) => join(dir, x.name));
}

/** Pure per-entry validation. Returns an array of error strings (empty = valid). */
export function validateHostVerdictEntry(entry) {
  const errors = [];
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return ["entry is not an object"];
  if (typeof entry.host !== "string" || normalizeVerdictHost(entry.host) === "") errors.push("host is required");
  else if (/[/\s:]/.test(normalizeVerdictHost(entry.host))) errors.push("host must be a bare hostname");
  if (Object.prototype.hasOwnProperty.call(entry, "tier")) errors.push("a verdict names a class, never a tier number");
  if (!isKnownHostClass(entry.class)) errors.push(`unknown class ${JSON.stringify(entry.class)}`);
  if (typeof entry.evidence !== "string" || entry.evidence.trim() === "") errors.push("evidence is required");
  if (entry.verdict_source !== HOST_VERDICT_SOURCE) errors.push(`verdict_source must be "${HOST_VERDICT_SOURCE}"`);
  if (typeof entry.generated_at !== "string" || Number.isNaN(Date.parse(entry.generated_at))) {
    errors.push("generated_at must be an ISO date-time");
  }
  return errors;
}

/**
 * Load every batch. PURE apart from the injected fs. Never throws.
 * @param {{ dir?: string, files?: string[], readdirSyncImpl?: Function, readFileSyncImpl?: Function }} [opts]
 *   `files` overrides discovery (a test names its fixture explicitly).
 * @returns {{ verdicts: Map<string, {host:string, class:string, evidence:string, verdict_source:string, generated_at:string, batch:string}>,
 *             batches: string[], entries: number, rejected: Array<{batch:string, host:string|null, reason:string}> }}
 */
export function loadHostVerdicts(opts = {}) {
  const readFile = opts.readFileSyncImpl ?? ((p) => readFileSync(p, "utf8"));
  const files = opts.files ?? discoverHostVerdictFiles(opts.dir, opts);
  const verdicts = new Map();
  const batches = [];
  const rejected = [];
  let entries = 0;
  for (const file of files) {
    const batch = String(file).split(/[\\/]/).pop().replace(/\.json$/, "");
    let parsed;
    try {
      parsed = JSON.parse(readFile(file));
    } catch (e) {
      rejected.push({ batch, host: null, reason: `batch file unreadable or not JSON: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) {
      rejected.push({ batch, host: null, reason: "batch has no entries array" });
      continue;
    }
    batches.push(batch);
    for (const entry of parsed.entries) {
      entries += 1;
      const errors = validateHostVerdictEntry(entry);
      if (errors.length) {
        rejected.push({ batch, host: typeof entry?.host === "string" ? entry.host : null, reason: errors.join("; ") });
        continue;
      }
      const host = normalizeVerdictHost(entry.host);
      verdicts.set(host, {
        host,
        class: entry.class,
        evidence: entry.evidence,
        verdict_source: entry.verdict_source,
        generated_at: entry.generated_at,
        batch,
      });
    }
  }
  return { verdicts, batches, entries, rejected };
}
