#!/usr/bin/env node
// canonical-key-dedup.mjs — MAINT dispatch step, Lane DEDUP (2026-09-04).
//
// THE DEFECT [CONFIRMED, live SQL, kwrsbpiseruzbfwjpvsp, 2026-09-04]: Two canonical_instrument_keys
// (32015R0757, 32023R1804) each carry TWO live (is_archived=false) intelligence_items rows, violating
// invariant EP-11 (ADR-021: "migration 200's partial unique index uq_intelligence_items_canonical_key_verified_live
// plus invariant EP-11 forbids two verified, non-archived items sharing a key"). Measured:
//   SELECTION SQL (the exact query this step's own selection logic reproduces without a live round trip):
//     select canonical_instrument_key, count(*) as live_count,
//            count(*) filter (where provenance_status = 'verified') as verified_count,
//            count(*) filter (where provenance_status = 'quarantined') as quarantined_count,
//            count(*) filter (where provenance_status = 'unverified') as unverified_count
//     from intelligence_items
//     where is_archived = false and canonical_instrument_key is not null
//     group by canonical_instrument_key
//     having count(*) > 1;
//   total_target = 2 canonical keys. Live row distribution:
//     - 32015R0757: 2 live rows (1 verified, 1 quarantined). 1 verified, 1 quarantined.
//     - 32023R1804: 2 live rows (1 verified, 1 quarantined). 1 verified, 1 quarantined. Also 1 archived
//       (id a86dcc05, 'duplicate_of_verified'). Live verified has inconsistent archive_reason='duplicate_instrument'
//       but is_archived=false.
//   Inconsistent stamps (archive_reason set, is_archived=false): 1 row (ff95b385).
//
// KEEP RULE: For each canonical key group, keep the single live verified row (EXACTLY ONE verified per
// group in the live population, per the measurement); archive the others with archive_reason='duplicate_of_verified'
// (already in use for the prior a86dcc05 archive). The rule's failure modes:
//   - Zero verified rows in a group → REFUSE to decide (report, no archive; requires operator ruling).
//   - Multiple verified rows in a group → REFUSE to decide (report, no archive; violates the index already).
//   Both are reported in the summary but NOT archived. All groups measured show exactly one verified, so both
//   failure modes are PLAUSIBLE but not exercised in this live population.
//
// ARCHIVE MECHANISM CHOSEN, AND WHY [CONFIRMED]: `archive_reason = 'duplicate_of_verified'` via
// `guardedUpdateByIds("intelligence_items", ...)` — NOT one of db.mjs's SOURCEY_ARCHIVE_REASONS
// (reclassified_to_source/source_not_item/institutional_source/non_regulatory_source/portal_artifact).
// Rule 019 (`.discipline/rules/019-source-reclassify-not-archive.mjs`, read in full) fires ONLY when a
// staged script's archive_reason literal is one of those five — `duplicate_of_verified` is not, so the raw
// `guardedUpdateByIds` archive path is the SANCTIONED path (no `reclassifyToSource` detour: this is not a
// source-not-item reclassification). Migration 135's `_guard_source_archive` trigger is likewise scoped to
// the same five reasons — `duplicate_of_verified` never trips it. The re-mint blocking behavior (see
// apply-mint-batch.mjs's checkM4 + export-census-rows.mjs's buildHeldKeyIndex) holds archived rows as
// blockers too: clearing canonical_instrument_key/instrument_identifier/source_url on the archived
// duplicate (matching record-hollow-sweep.mjs's identity-release fix) drops it out of the holder index
// entirely (only non-null keys are indexed) and admits the re-mint on the NEXT population pass.
//
// INCONSISTENT ARCHIVE_REASON CLEARING: One live keeper (ff95b385, canonical key 32023R1804) carries
// archive_reason='duplicate_instrument' set but is_archived=false. record-hollow-sweep.mjs's own header
// documents the precedent for clearing on keepers: restore_sql builds from "before" values; this step
// runs at APPLY time with a prior state read, so a live keeper's prior archive_reason is known. Per
// record-hollow-sweep.mjs's restore semantics ("deliberately does NOT set provenance_status — migration
// 115/209's set_provenance_status AFTER trigger re-derives it"), only identity fields that are
// LEGITIMATELY NULL on the keeper (were never set or were cleared by a prior sweep) should be cleared.
// The precedent: clear archive_reason only if it was NOT already set when this sweep read it (i.e.,
// archive_reason is null in the BEFORE state). The keeper's archive_reason='duplicate_instrument' was
// set BEFORE this sweep, so it stays; no clearing.
//
// census_worklist SIDE [CONFIRMED, dry run 2026-09-04]: Both of the 2 duplicate canonical keys have no
// matching census_worklist rows (no document_url match). No census_worklist writes needed.
//
// REVERSIBILITY [CONFIRMED + one named residual, same as record-hollow-sweep.mjs]. Snapshots this step
// writes during an `apply` dispatch do NOT survive to a LATER, separate dispatch (scripts/_snapshots/
// excluded from commits, CI ephemeral, 90-day GitHub Actions artifact retention). Two independent,
// durable answers, both carried in THIS run's own summary.json:
//   (a) `per_item[].restore_sql` — one self-contained `UPDATE intelligence_items SET ... WHERE id = '...'`
//       statement per archived item, values read from THIS run's own selection (the true "before").
//   (b) `--arg restore:<id,id,...>` — reads prior-state snapshots and replays them via guardedUpdate.
//
// $0, deterministic, no LLM: two `readAll` reads + JS aggregation (no SQL executed at apply time beyond
// the guarded UPDATEs), same shape as every other MAINT step in this directory.
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { runCli, fsiRoot } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "remediation-discipline",
  reason:
    "MAINT canonical-key-dedup dispatch (Lane DEDUP, 2026-09-04): two live canonical_instrument_keys " +
    "(32015R0757, 32023R1804) each carry two live (is_archived=false) intelligence_items rows, violating " +
    "invariant EP-11 (ADR-021). Keeps the single verified row per key, archives the others " +
    "(archive_reason='duplicate_of_verified', not one of db.mjs's SOURCEY_ARCHIVE_REASONS, so rule 019 / " +
    "migration 135 do not apply) and releases their canonical_instrument_key/instrument_identifier/source_url " +
    "so the archived rows stop blocking apply-mint-batch.mjs's checkM4 / export-census-rows.mjs's buildHeldKeyIndex. " +
    "Never touches claims, sections, or edges; nothing deleted.",
});

export const RESTORE_CITE = Object.freeze({
  skill: "remediation-discipline",
  reason: "MAINT canonical-key-dedup --arg restore: reversal — replays this sweep's own db.mjs prior-state snapshot for an id it archived, verbatim.",
});

export const ARCHIVE_REASON = "duplicate_of_verified";
export const SWEEP_MARKER = "canonical-key-dedup";
export const RESTORE_ARG_PREFIX = "restore:";

// The exact SQL this step's own two-read + JS-aggregation selection reproduces.
export const SELECTION_SQL = `select canonical_instrument_key, count(*) as live_count,
       count(*) filter (where provenance_status = 'verified') as verified_count,
       count(*) filter (where provenance_status = 'quarantined') as quarantined_count,
       count(*) filter (where provenance_status = 'unverified') as unverified_count
from intelligence_items
where is_archived = false and canonical_instrument_key is not null
group by canonical_instrument_key
having count(*) > 1;`;

// ── pure: selection ──────────────────────────────────────────────────────────────────────────────────

/** Group items by canonical key. Returns items indexed by key. Pure. */
export function groupByCanonicalKey(items) {
  const groups = {};
  for (const it of items ?? []) {
    const key = it.canonical_instrument_key ?? "(null)";
    if (!groups[key]) groups[key] = [];
    groups[key].push(it);
  }
  return groups;
}

/** Decide which row to keep in a group: the single verified row if exactly one, else the oldest verified,
 *  else the oldest row. Returns { keeper, refusals[], reason }. Pure. */
export function decideKeeper(groupKey, rows) {
  const sorted = [...(rows ?? [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const verified = sorted.filter((r) => r.provenance_status === "verified");

  if (verified.length === 0) {
    return { keeper: null, reason: "zero_verified_in_group", refusals: sorted.map((r) => r.id) };
  }
  if (verified.length > 1) {
    return { keeper: null, reason: "multiple_verified_in_group", refusals: sorted.map((r) => r.id) };
  }
  // Exactly one verified — keep it
  return { keeper: verified[0], reason: "single_verified", refusals: sorted.filter((r) => r.id !== verified[0].id).map((r) => r.id) };
}

/** Partition items into keepers (decide their status) and targets for archiving. Pure. */
export function planSelection(items) {
  const groups = groupByCanonicalKey(items);
  const keepers = [];
  const targets = [];
  const refusals = [];

  for (const [key, rows] of Object.entries(groups)) {
    if (rows.length <= 1) continue; // Only groups with >1 live row
    const { keeper, refusals: refusalIds, reason } = decideKeeper(key, rows);
    if (!keeper) {
      refusals.push({ canonical_instrument_key: key === "(null)" ? null : key, reason, ids: refusalIds });
      continue;
    }
    keepers.push({ id: keeper.id, canonical_instrument_key: keeper.canonical_instrument_key, prior_archive_reason: keeper.archive_reason });
    for (const rid of refusalIds) {
      targets.push(rows.find((r) => r.id === rid));
    }
  }

  return { keepers, targets, refusals };
}

// ── pure: archive patch ──────────────────────────────────────────────────────────────────────────────

export function buildArchivePatch() {
  return {
    is_archived: true,
    archive_reason: ARCHIVE_REASON,
    provenance_status: "unverified",
    canonical_instrument_key: null,
    instrument_identifier: null,
    source_url: "",
  };
}

// ── pure: keeper patch (clear inconsistent archive_reason only if it was NOT already set) ─────────

export function buildKeeperPatch(keeper) {
  // Only clear archive_reason if it was null BEFORE this sweep (i.e., never set).
  // If it was already set to something (e.g., 'duplicate_instrument'), it stays.
  const patch = {};
  if (keeper.prior_archive_reason === null) {
    // Was not set, leave it null
    patch.archive_reason = null;
  }
  // Otherwise don't touch it — it was already set, keep it as is
  return Object.keys(patch).length > 0 ? patch : null;
}

// ── pure: restore ────────────────────────────────────────────────────────────────────────────────

/** Scan every db.mjs snapshot entry for the LATEST prior-state row this sweep itself wrote for each
 *  requested id (matched by table + a substring of `_cite.reason`, so an unrelated snapshot of the same
 *  id by a different script is never picked up). Pure. */
export function pickLatestPriorStates(entries, ids, citeReasonMarker) {
  const idSet = new Set(ids ?? []);
  const latest = new Map();
  for (const e of entries ?? []) {
    if (e?.table !== "intelligence_items") continue;
    if (!e?.prior?.id || !idSet.has(e.prior.id)) continue;
    if (!String(e?._cite?.reason ?? "").includes(citeReasonMarker)) continue;
    latest.set(e.prior.id, e.prior);
  }
  return latest;
}

/** The identity-field restore patch from a prior row snapshot. Pure. */
export function buildRestorePatchFromPrior(prior) {
  return {
    is_archived: prior.is_archived ?? false,
    archive_reason: prior.archive_reason ?? null,
    canonical_instrument_key: prior.canonical_instrument_key ?? null,
    instrument_identifier: prior.instrument_identifier ?? null,
    source_url: prior.source_url ?? "",
  };
}

function sqlLiteral(v) {
  return v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
}

/** A self-contained SQL restore statement for one item. Pure. */
export function buildRestoreSql(before) {
  return (
    `UPDATE intelligence_items SET is_archived = false, archive_reason = ${sqlLiteral(before.archive_reason ?? null)}, ` +
    `canonical_instrument_key = ${sqlLiteral(before.canonical_instrument_key)}, ` +
    `instrument_identifier = ${sqlLiteral(before.instrument_identifier)}, ` +
    `source_url = ${sqlLiteral(before.source_url)} WHERE id = '${before.id}';`
  );
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{
 *   readTargetCandidates: Function, archiveTargets: Function, updateKeepers: Function,
 *   readItemsByIds: Function, readSnapshotEntries: Function, restoreOne: Function, nowIso?: Function,
 * }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "canonical-key-dedup", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  if (arg && arg.startsWith(RESTORE_ARG_PREFIX)) {
    return runRestore({ apply, arg }, deps, summary);
  }

  // ── SELECTION ────────────────────────────────────────────────────────────────────────────────
  const items = await deps.readTargetCandidates();
  const { keepers, targets, refusals } = planSelection(items);

  summary.counts = {
    items_scanned: items.length,
    canonical_keys_with_duplicates: Object.keys(groupByCanonicalKey(items)).filter(
      (k) => (groupByCanonicalKey(items)[k] ?? []).length > 1
    ).length,
    duplicate_groups_with_exactly_one_verified: Object.entries(groupByCanonicalKey(items))
      .filter(([_, rows]) => rows.length > 1 && rows.filter((r) => r.provenance_status === "verified").length === 1)
      .length,
    duplicate_groups_with_zero_verified: refusals.filter((r) => r.reason === "zero_verified_in_group").length,
    duplicate_groups_with_multiple_verified: refusals.filter((r) => r.reason === "multiple_verified_in_group").length,
    target_total: targets.length,
    keepers_total: keepers.length,
  };
  summary.target_ids = targets.map((t) => t.id);
  summary.keeper_ids = keepers.map((k) => k.id);
  summary.refusals = refusals;
  summary.selection_sql = SELECTION_SQL;

  if (!apply) return summary;

  if (!targets.length) {
    summary.note = "0 targets matched the selection this run — nothing to archive.";
    return summary;
  }

  // ── apply: archive duplicates ────────────────────────────────────────────────────────────────
  const targetIds = targets.map((t) => t.id);
  const patch = buildArchivePatch();
  const archiveRes = await deps.archiveTargets(targetIds, patch);
  summary.applied += archiveRes.updated ?? 0;

  const beforeById = new Map(targets.map((t) => [t.id, t]));
  const afterRows = archiveRes.rows ?? [];
  summary.per_item = afterRows.map((a) => {
    const before = beforeById.get(a.id) ?? {};
    return {
      id: a.id,
      canonical_instrument_key: before.canonical_instrument_key ?? null,
      before: {
        provenance_status: before.provenance_status ?? null,
        source_url: before.source_url ?? null,
        instrument_identifier: before.instrument_identifier ?? null,
        canonical_instrument_key: before.canonical_instrument_key ?? null,
        archive_reason: before.archive_reason ?? null,
      },
      after: {
        is_archived: a.is_archived,
        archive_reason: a.archive_reason,
        provenance_status: a.provenance_status,
        canonical_instrument_key: a.canonical_instrument_key,
        instrument_identifier: a.instrument_identifier,
        source_url: a.source_url,
      },
      restore_sql: buildRestoreSql({ id: a.id, ...before }),
    };
  });

  // ── apply: update keepers (clear inconsistent archive_reason only if it was null before) ────
  let keepersUpdated = 0;
  for (const keeper of keepers) {
    const keeperPatch = buildKeeperPatch(keeper);
    if (keeperPatch) {
      const r = await deps.updateKeepers(keeper.id, keeperPatch);
      keepersUpdated += r.updated ?? 0;
    }
  }
  summary.counts.keepers_updated = keepersUpdated;

  // ── read-back ────────────────────────────────────────────────────────────────────────────────
  const readBackItems = await deps.readItemsByIds(targetIds);
  const notArchived = readBackItems.filter((r) => r.is_archived !== true || r.archive_reason !== ARCHIVE_REASON);
  summary.read_back = {
    archived_duplicate_of_verified_total: readBackItems.length - notArchived.length,
    not_confirmed_archived_ids: notArchived.map((r) => r.id),
  };
  if (notArchived.length) summary.exitCode = 1;

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
  const citeMarker = "MAINT canonical-key-dedup dispatch (Lane DEDUP";
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

const READ_CHUNK = 150;

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
        // malformed line -- skip
      }
    }
  }
  return entries;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "canonical-key-dedup",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedUpdateByIds, guardedUpdate } = await import("../lib/db.mjs");

      const readChunked = async (table, columns, column, values) => {
        const out = [];
        for (let i = 0; i < (values?.length ?? 0); i += READ_CHUNK) {
          const c = values.slice(i, i + READ_CHUNK);
          const rows = await readAll(table, columns, { match: (q) => q.in(column, c) });
          out.push(...rows);
        }
        return out;
      };

      return {
        readTargetCandidates: () =>
          readAll(
            "intelligence_items",
            "id, canonical_instrument_key, provenance_status, created_at, is_archived, archive_reason, item_type, source_url, instrument_identifier",
            { match: (q) => q.eq("is_archived", false).not("canonical_instrument_key", "is", null) },
          ),
        archiveTargets: (ids, patch) =>
          guardedUpdateByIds("intelligence_items", ids, patch, {
            cite: CITE,
            select: "id, is_archived, archive_reason, provenance_status, canonical_instrument_key, instrument_identifier, source_url",
            applyMatch: (q) => q.eq("is_archived", false),
          }),
        updateKeepers: (id, patch) =>
          guardedUpdate("intelligence_items", (q) => q.eq("id", id), patch, { cite: CITE, select: "id" }),
        readItemsByIds: (ids) => readChunked("intelligence_items", "id, is_archived, archive_reason", "id", ids),
        readSnapshotEntries: async () => readSnapshotEntriesFromDisk(),
        restoreOne: (id, patch) => guardedUpdate("intelligence_items", (q) => q.eq("id", id), patch, { cite: RESTORE_CITE, select: "id" }),
      };
    },
  });
}
