#!/usr/bin/env node
// uk-series-code-reconcile.mjs -- MAINT step, task 7.4e (brief-chain build plan, ADR-030 rider,
// 2026-09-12): reconciles the live `instrument_identifier` on legislation.gov.uk `intelligence_items`
// rows whose series code disagrees with their own `source_url`.
//
// THE DEFECT [CONFIRMED, coordinator's live SQL, 2026-09-12]: 268 live items carry a legislation.gov.uk
// `source_url`; 19 of them carry `instrument_identifier` "UK uksi <year>/<n>" while the URL path is
// "/wsi/<year>/<n>" -- a Welsh Statutory Instrument, a DIFFERENT series from a UK-wide uksi at the same
// year/number. 0 have a year/number mismatch; 2 have identifiers not in the "UK <type> <year>/<n>" shape.
// Example: 00a8c0d9-405a-48d9-a01b-9c14c4101155, "The Single Use Carrier Bags Charge (Wales) Regulations
// 2010", identifier "UK uksi 2010/2880", URL https://www.legislation.gov.uk/wsi/2010/2880. Consequence:
// `src/lib/sources/target-match.mjs`'s own-URL match (`identifierInUrl`, reusing
// `src/lib/coverage/identity.mjs`'s `classifyIdentifier`/`UK_TYPES`) correctly refuses -- uksi 2010/2880
// and wsi 2010/2880 are different instruments -- and the item quarantined at ground (brief-apply run
// 34712340105).
//
// THE DERIVER FIX (source-side, this same task): `scripts/mint/export-census-rows.mjs`'s
// `resolveIdentity` (census/mint time) now derives `instrument_identifier` for a fresh legislation.gov.uk
// row ONLY from the URL's own series-code segment (`deriveUkLegislationIdentifier`/
// `parseUkLegislationUrlId`, both new) -- never a pre-existing/defaulted value, never "uksi" as a
// fallback. THIS SCRIPT is the reconciliation half: the 19 rows above were minted before that fix
// existed, so their stored `instrument_identifier` is stale and needs a one-time, targeted rewrite.
//
// REUSE, NOT RE-DERIVATION (reuse-before-construction): `classifyHost`/`parseUkLegislationUrlId` from
// `scripts/mint/export-census-rows.mjs` (the same URL-side parse the deriver fix uses) and
// `classifyIdentifier` from `src/lib/coverage/identity.mjs` (the same identifier-side parse
// `identifierInUrl`/the own-URL target match already use) -- no second UK series-code parser anywhere in
// this file.
//
// PURE DECISION FUNCTION (`planItemSeriesCode`), four outcomes, each reported, NEVER guessed:
//   - `match`                    -- identifier's series code already agrees with the URL's. No write.
//   - `mismatch`                 -- series codes differ, year/number agree. Rewrites `instrument_identifier`
//                                    to the URL's own code, year/number UNTOUCHED.
//   - `non_uk_url`               -- `source_url` is not a legislation.gov.uk host. Skipped, reported.
//   - `url_series_unrecognized`  -- the URL carries no recognized UK_TYPES segment. Skipped, reported.
//   - `identifier_not_uk_shaped` -- `instrument_identifier` is not "UK <type> <year>/<n>" shaped (the
//                                    live corpus's 2 non-conforming rows). Skipped, reported, never guessed.
//   - `year_number_mismatch`     -- identifier and URL agree on series but DISAGREE on year/number (0 live
//                                    rows as of 2026-09-12, but a different defect class -- reported, never
//                                    silently patched by this script, which touches series code alone).
//
// GUARDED WRITE (rule 015): `scripts/lib/db.mjs`'s `guardedUpdate`, one row at a time (each mismatch has
// its OWN new value, so `guardedUpdateByIds`'s one-shared-patch shape does not fit -- see
// `backfill-format-type.mjs`'s header for when that shape DOES apply). `applyMatch` re-checks the row's
// OLD `instrument_identifier` at write time (optimistic concurrency: a row changed since this run's own
// read is left untouched, never clobbered). Snapshot + read-back via `guardedUpdate` itself.
//
// REVERSAL: `--arg restore:<id,id,...>` (this same script) -- same mechanism as `record-hollow-sweep.mjs`
// / `canonical-key-dedup.mjs`: scans `scripts/_snapshots/*.jsonl` for THIS script's own prior-state
// entries (matched by `_cite.reason` containing this file's CITE marker) and replays the prior
// `instrument_identifier` via `guardedUpdate`; refuses (never guesses) any id with no matching snapshot
// entry, reported in `missing_ids`. Every apply-mode row also carries its own `restore_sql` in the report
// (the durable, cross-dispatch reversal path -- `scripts/_snapshots/` is `.gitignore`'d and does not
// survive a fresh GitHub Actions checkout, same caveat those two siblings' headers name).
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { classifyHost, parseUkLegislationUrlId } from "../mint/export-census-rows.mjs";
import { classifyIdentifier } from "../../src/lib/coverage/identity.mjs";
import { runCli, fsiRoot } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "environmental-policy-and-innovation",
  reason:
    "MAINT uk-series-code-reconcile (task 7.4e, brief-chain build plan 2026-09-11, ADR-030 rider): " +
    "rewrites a live legislation.gov.uk intelligence_items row's instrument_identifier series code (e.g. " +
    "'uksi' -> 'wsi') to match its own source_url path segment -- the URL is the authoritative source, " +
    "never a pre-existing/defaulted value. Year and number are read from the URL too but never rewritten " +
    "unless they already match the identifier's own (a year/number mismatch is a different, reported-only " +
    "defect class this script does not touch). Fixes the own-URL target-match refusal " +
    "(src/lib/sources/target-match.mjs's identifierInUrl) that quarantined these items at ground.",
});

export const RESTORE_CITE = Object.freeze({
  skill: "environmental-policy-and-innovation",
  reason: "MAINT uk-series-code-reconcile --arg restore: reversal -- replays this step's own db.mjs prior-state snapshot for an id it rewrote, verbatim.",
});

export const RESTORE_ARG_PREFIX = "restore:";

// The exact SQL this step's own read + JS-decision reproduces (kept here as citable text, never executed
// by this script -- readCandidates below does the equivalent read via readAll/ilike).
export const SELECTION_SQL = `select id, source_url, instrument_identifier from intelligence_items
where is_archived = false and source_url ilike '%legislation.gov.uk%';`;

// ── pure: per-item decision ──────────────────────────────────────────────────────────────────────────

/**
 * The series-code reconciliation decision for one live intelligence_items row. Pure -- no I/O, no
 * guessing: every non-`match`/`mismatch` outcome is a named, reported refusal.
 * @param {{id:string, source_url:string|null, instrument_identifier:string|null}} item
 * @returns {{id:string, status:string, reason?:string, url_series?:string, identifier_series?:string,
 *   old_identifier?:string|null, new_identifier?:string}}
 */
export function planItemSeriesCode(item) {
  const id = item?.id;
  const sourceUrl = item?.source_url ?? null;
  const instrumentIdentifier = item?.instrument_identifier ?? null;

  const host = classifyHost(sourceUrl);
  if (host !== "uk_legislation") {
    return { id, status: "non_uk_url", reason: "source_url is not a legislation.gov.uk host" };
  }

  const urlId = parseUkLegislationUrlId(sourceUrl);
  if (!urlId) {
    return { id, status: "url_series_unrecognized", reason: "source_url carries no recognized UK series-code segment (never guessed)" };
  }

  const cls = classifyIdentifier(instrumentIdentifier);
  if (cls.scheme !== "uk-legislation") {
    return {
      id,
      status: "identifier_not_uk_shaped",
      reason: `instrument_identifier ("${instrumentIdentifier ?? ""}") is not "UK <type> <year>/<n>" shaped -- refused, never guessed`,
      url_series: urlId.type,
    };
  }

  const [idType, idYear, idNumber] = cls.normalized.split("/");
  if (idYear !== urlId.year || idNumber !== urlId.number) {
    return {
      id,
      status: "year_number_mismatch",
      reason: `identifier year/number (${idYear}/${idNumber}) differs from the URL's (${urlId.year}/${urlId.number}) -- a different defect class; this script touches series code only, never year/number`,
      url_series: urlId.type,
      identifier_series: idType,
    };
  }

  if (idType === urlId.type) {
    return { id, status: "match", url_series: urlId.type };
  }

  return {
    id,
    status: "mismatch",
    url_series: urlId.type,
    identifier_series: idType,
    old_identifier: instrumentIdentifier,
    new_identifier: `UK ${urlId.type} ${urlId.year}/${urlId.number}`,
  };
}

/** Pure: runs planItemSeriesCode over every candidate row and buckets by status. */
export function planSelection(items) {
  const plans = (items ?? []).map(planItemSeriesCode);
  const byStatus = {};
  for (const p of plans) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  return { plans, byStatus, mismatches: plans.filter((p) => p.status === "mismatch") };
}

function sqlLiteral(v) {
  return v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
}

/** A self-contained SQL restore statement for one rewritten row, from THIS run's own "before" value. Pure. */
export function buildRestoreSql({ id, old_identifier }) {
  return `UPDATE intelligence_items SET instrument_identifier = ${sqlLiteral(old_identifier)} WHERE id = '${id}';`;
}

// ── pure: restore (same shape as record-hollow-sweep.mjs / canonical-key-dedup.mjs) ─────────────────────

/** Scan every db.mjs snapshot entry for the LATEST prior-state row this step itself wrote for each
 *  requested id (matched by table + a substring of `_cite.reason`). `entries` must already be in write
 *  order (oldest first). Pure. */
export function pickLatestPriorStates(entries, ids, citeReasonMarker) {
  const idSet = new Set(ids ?? []);
  const latest = new Map();
  for (const e of entries ?? []) {
    if (e?.table !== "intelligence_items") continue;
    if (!e?.prior?.id || !idSet.has(e.prior.id)) continue;
    if (!String(e?._cite?.reason ?? "").includes(citeReasonMarker)) continue;
    latest.set(e.prior.id, e.prior); // entries are chronological -- last write wins
  }
  return latest;
}

/** The restore patch from a prior row snapshot -- instrument_identifier only, this script's one field. Pure. */
export function buildRestorePatchFromPrior(prior) {
  return { instrument_identifier: prior.instrument_identifier ?? null };
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{
 *   readCandidates: Function, updateOne: Function, readItemsByIds: Function,
 *   readSnapshotEntries: Function, restoreOne: Function,
 * }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "uk-series-code-reconcile", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  if (arg && arg.startsWith(RESTORE_ARG_PREFIX)) {
    return runRestore({ apply, arg }, deps, summary);
  }

  const items = await deps.readCandidates();
  const { plans, byStatus, mismatches } = planSelection(items);

  summary.counts = {
    candidates_scanned: items.length,
    by_status: byStatus,
    mismatch_total: mismatches.length,
  };
  summary.selection_sql = SELECTION_SQL;
  summary.per_item = plans;

  if (!apply) return summary;

  if (!mismatches.length) {
    summary.note = "0 series-code mismatches this run -- nothing to rewrite.";
    return summary;
  }

  let applied = 0;
  const results = [];
  const notUpdated = [];
  for (const m of mismatches) {
    const r = await deps.updateOne(m.id, m.old_identifier, m.new_identifier);
    const updated = r.updated ?? 0;
    applied += updated;
    if (!updated) notUpdated.push(m.id);
    results.push({
      id: m.id,
      old_identifier: m.old_identifier,
      new_identifier: m.new_identifier,
      updated,
      restore_sql: buildRestoreSql(m),
    });
  }
  summary.applied = applied;
  summary.per_item_applied = results;

  const readBackIds = mismatches.map((m) => m.id);
  const after = await deps.readItemsByIds(readBackIds);
  const afterById = new Map(after.map((r) => [r.id, r.instrument_identifier]));
  const stillMismatched = mismatches.filter((m) => afterById.get(m.id) !== m.new_identifier);
  summary.read_back = {
    rewritten_total: readBackIds.length - stillMismatched.length,
    not_confirmed_ids: stillMismatched.map((m) => m.id),
  };
  if (stillMismatched.length || notUpdated.length) summary.exitCode = 1;

  return summary;
}

async function runRestore({ apply, arg }, deps, summary) {
  const ids = arg
    .slice(RESTORE_ARG_PREFIX.length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) {
    summary.note = `restore: no ids given -- usage: --arg ${RESTORE_ARG_PREFIX}<id,id,...>`;
    summary.exitCode = 1;
    return summary;
  }

  const entries = await deps.readSnapshotEntries();
  const citeMarker = "MAINT uk-series-code-reconcile (task 7.4e";
  const latest = pickLatestPriorStates(entries, ids, citeMarker);
  const found = [...latest.keys()];
  const missing = ids.filter((id) => !latest.has(id));
  summary.counts = { requested: ids.length, found: found.length, missing: missing.length };
  summary.missing_ids = missing;

  if (!apply) {
    summary.plan = found.map((id) => ({ id, patch: buildRestorePatchFromPrior(latest.get(id)) }));
    if (missing.length) summary.exitCode = 1;
    return summary;
  }

  let restored = 0;
  const results = [];
  for (const id of found) {
    const patch = buildRestorePatchFromPrior(latest.get(id));
    const r = await deps.restoreOne(id, patch);
    restored += r.updated ?? 0;
    results.push({ id, updated: r.updated ?? 0 });
  }
  summary.applied = restored;
  summary.read_back = { restored_ids: results.filter((r) => r.updated > 0).map((r) => r.id) };
  if (missing.length || restored < found.length) summary.exitCode = 1;
  return summary;
}

// ── real deps (CLI entrypoint) ───────────────────────────────────────────────────────────────────────

/** Reads every `*_intelligence_items.jsonl` file under scripts/_snapshots/ (db.mjs's own snapshot
 *  convention), oldest-first by filename. Best-effort: a malformed line is skipped, never thrown. Same
 *  shape as record-hollow-sweep.mjs's own reader (this table's snapshot convention has no shared reader
 *  today -- see that file's header for why this directory is not durable across a fresh CI checkout). */
function readSnapshotEntriesFromDisk() {
  const dir = join(fsiRoot(), "scripts", "_snapshots");
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith("_intelligence_items.jsonl")).sort();
  } catch {
    return [];
  }
  const entries = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(join(dir, f), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // malformed line -- skip, never throw (best-effort restore source)
      }
    }
  }
  return entries;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "uk-series-code-reconcile",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, readAllByIds, guardedUpdate } = await import("../lib/db.mjs");
      return {
        readCandidates: () =>
          readAll("intelligence_items", "id, source_url, instrument_identifier", {
            match: (q) => q.eq("is_archived", false).ilike("source_url", "%legislation.gov.uk%"),
          }),
        updateOne: (id, oldIdentifier, newIdentifier) =>
          guardedUpdate(
            "intelligence_items",
            (q) => q.eq("id", id).eq("instrument_identifier", oldIdentifier),
            { instrument_identifier: newIdentifier },
            { cite: CITE, select: "id, instrument_identifier" },
          ),
        readItemsByIds: (ids) => readAllByIds("intelligence_items", "id, instrument_identifier", ids),
        readSnapshotEntries: async () => readSnapshotEntriesFromDisk(),
        restoreOne: (id, patch) => guardedUpdate("intelligence_items", (q) => q.eq("id", id), patch, { cite: RESTORE_CITE, select: "id, instrument_identifier" }),
      };
    },
  });
}
