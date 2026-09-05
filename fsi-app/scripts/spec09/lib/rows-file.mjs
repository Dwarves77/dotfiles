// scripts/spec09/lib/rows-file.mjs — shared rows-file plumbing for the spec-09 producers that have no
// live $0 feed to read (reroute-producer.mjs, grid-queue-producer.mjs, oem-roadmap-producer.mjs).
//
// WHY ROWS-FILE-DRIVEN, NOT A LIVE FETCH (same reasoning as scripts/propagation/write-statutory.mjs's own
// header, applied to these three tables). SOURCES.md's own conclusion for these three is unchanged by this
// module: no bulk/API $0 feed was confirmed at authoring time, and this sandbox's egress proxy 403s every
// non-allowlisted host (confirmed 2026-09-05: gov.uk, imo.org, ember-energy.org, api.eia.gov all "CONNECT
// tunnel failed, response 403"), so this session cannot itself fetch a live workbook the way
// fetch-desnz-factors.mjs's runner does. Rather than guess a dataset's byte-level shape from training
// knowledge and risk shipping a fabricated "extraction" (rule 2: never fabricate), each producer instead
// takes a `--rows-file` (JSON) of CALLER-ASSERTED, fully-cited rows — the same shape write-statutory.mjs
// established for "the first writer of a table with no live feed yet". A rows-file is not a shortcut around
// sourcing: every row's `citation` block is REQUIRED (url/title/retrieved_at/quote) and its host is rated
// through the SAME institution class table (`src/lib/sources/host-authority.ts` classTierForHost — SC-13,
// "no LLM guess, no default") every other lane's provenance heal uses, then registered through
// `scripts/lib/db.mjs` registerSource — never a hand-typed tier (rule 18: "get the source, then rate the
// source"). A row whose host classifies ambiguous (ANALYSIS/aggregator/unrecognized) is REFUSED, not
// force-published at a guessed tier.
//
// NEITHER `reroute_events` NOR `grid_connection_queues` carries a `source_id` column (migrations
// 296/297 — see their own headers: no entity_kind fits a "source" subject, and neither table's spec text
// asked for one). Their per-row citation is therefore carried in the guarded write's own `cite` object
// (scripts/lib/db.mjs rule-015: cite + snapshot, one insert per row so each row's snapshot carries its own
// distinct citation) rather than a DB column. `oem_tech_roadmaps.source_id` IS a NOT NULL FK to
// `sources(id)` (migration 296) — for that table `registerCitedSource`'s returned `source_id` is a
// required column value, not just an audit-trail nicety.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hostOf } from "../../lib/institution-key.mjs";
import { classTierForHost } from "../../../src/lib/sources/host-authority.ts";

export class RowsFileError extends Error {}

/** Reads and minimally validates a --rows-file: JSON, either a bare array or `{ rows: [...] }`, non-empty.
 *  Throws RowsFileError (never a raw parse/ENOENT error) so every producer's CLI can catch one error class. */
export function loadRowsFile(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
  } catch (e) {
    throw new RowsFileError(`could not read/parse --rows-file "${path}": ${e.message}`);
  }
  const rows = Array.isArray(raw) ? raw : raw?.rows;
  if (!Array.isArray(rows) || !rows.length) {
    throw new RowsFileError(`--rows-file "${path}" has no rows[] (or is not an array) — refusing to run on an empty file.`);
  }
  return rows;
}

/** Every row-file row REQUIRES a `citation` block (rule 18: a figure with no source is never published).
 *  Returns the validated citation; throws RowsFileError naming exactly what is missing, never guesses. */
export function requireCitation(row, index, where) {
  const c = row?.citation;
  if (!c || typeof c !== "object") {
    throw new RowsFileError(`${where}: row[${index}] has no citation {url, title, retrieved_at, quote} — refused, not guessed.`);
  }
  for (const field of ["url", "title", "retrieved_at", "quote"]) {
    if (typeof c[field] !== "string" || !c[field].trim()) {
      throw new RowsFileError(`${where}: row[${index}].citation.${field} is required and must be a non-empty string.`);
    }
  }
  try {
    new URL(c.url);
  } catch {
    throw new RowsFileError(`${where}: row[${index}].citation.url is not a valid absolute URL: "${c.url}"`);
  }
  return c;
}

/**
 * Registers a rows-file row's citation as a `sources` registry row, rated through the institution class
 * table (SC-13, host-authority.ts) — NEVER a hand-typed tier. Returns `{ refused: true, reason }` for a
 * host the class table cannot classify (ambiguous/aggregator/unrecognized) rather than guessing one; a
 * refused row must not be written (see each producer's caller). `deps.registerSource` defaults to
 * `scripts/lib/db.mjs`'s real one — injectable so this runs under `node --test` with zero DB access.
 */
export async function registerCitedSource(citation, deps) {
  const host = hostOf(citation.url);
  if (!host) {
    return { refused: true, reason: `citation.url has no resolvable host: "${citation.url}"` };
  }
  const tier = classTierForHost(host);
  if (tier == null) {
    return {
      refused: true,
      reason:
        `host "${host}" does not resolve to a codified class in src/lib/sources/host-authority.ts ` +
        `(classTierForHost) — ambiguous hosts are worklisted, never guessed a tier (SC-13).`,
    };
  }
  if (!deps.registerSource) {
    return { refused: true, reason: "no deps.registerSource injected (dry run without DB access) — citation would register at tier " + tier + " if applied." , wouldRegisterTier: tier, host };
  }
  const reg = await deps.registerSource({ url: citation.url, name: citation.title || host, base_tier: tier });
  return { refused: false, source_id: reg.source_id, host, tier, created: reg.created };
}

/** Resolve a live entity's id by EXACT canonical_name match within an already-kind-filtered list (the
 *  caller's own deps.readAll query does the kind filter — this function never re-checks kind). Never
 *  mints an entity: minting is entities/entity_kind territory, out of every spec-09 producer's write set
 *  (migration 296/297's own header note, repeated by scripts/spec09/reroute-producer.mjs's original
 *  header). Returns the entity_id, or null if no live row's canonical_name matches exactly. */
export function resolveEntityByName(list, canonicalName) {
  const match = (Array.isArray(list) ? list : []).find((e) => e.canonical_name === canonicalName);
  return match ? match.entity_id : null;
}
