#!/usr/bin/env node
// record-hollow-sweep.mjs — MAINT dispatch step, Lane HOLLOW-SWEEP (2026-09-04).
//
// THE DEFECT [CONFIRMED, live SQL, kwrsbpiseruzbfwjpvsp, 2026-09-04]: 551 of 1,230 live verified
// record-grade (`item_grade='record'`) intelligence_items carry only the `[title]` FACT claim (record-
// facts.mjs's `extractIdentityFact`, `claim_text` prefixed `[title]`) — every other required-slot claim a
// GAP, or (201 of the 551) no FACT claim at all, not even title. Measured:
//   SELECTION SQL (the exact query this step's own selection logic reproduces without a live round trip):
//     with fact_counts as (
//       select intelligence_item_id,
//              count(*) filter (where claim_kind = 'FACT') as fact_n,
//              count(*) filter (where claim_kind = 'FACT' and claim_text like '[title]%') as title_fact_n
//       from section_claim_provenance group by intelligence_item_id
//     )
//     select ii.* from intelligence_items ii
//     left join fact_counts fc on fc.intelligence_item_id = ii.id
//     where ii.is_archived = false and ii.provenance_status = 'verified' and ii.item_grade = 'record'
//       and coalesce(fc.fact_n,0) = coalesce(fc.title_fact_n,0);   -- every FACT present (0 or 1) IS the title
//   total_target = 551 (of 1,230 candidates). By item_type: initiative 390, regulation 158, framework 2,
//   guidance 1. By source host: eur-lex.europa.eu 379, legislation.gov.uk 149, federalregister.gov 21,
//   climate.ec.europa.eu 1, sdir.no 1. These render on every customer surface (see READER EVIDENCE below)
//   with an empty Summary — the operator's own count (551) matches this measurement exactly.
//
// READER EVIDENCE — which flag hides an item from EVERY customer surface [CONFIRMED, read this session]:
//   `is_archived` (+ `archive_reason`), NOT `hidden_reason`, NOT `pipeline_stage`.
//   - db.mjs's own archivePatch() comment (this file's sibling, read in full): "the customer read gate
//     (is_archived=false AND provenance_status='verified')" — this is the ALREADY-DOCUMENTED gate every
//     prior MAINT archive step (census-off-vertical's own header) relies on.
//   - Direct per-route filters, every one `.eq("is_archived", false)` (grep, `src/app`): research/[slug],
//     operations/[slug], api/ask, api/admin/intersections, api/admin/forward-events, api/admin/b2-progress,
//     api/health/surfaces (`.not("is_archived","is",true)`), api/admin/corpus-turn-requests.
//   - The RPC layer every list/dashboard/regulations/operations/market/map surface reads through
//     (`_workspace_active_items` + get_market_intel_items/get_research_items/get_operations_items/
//     get_technology_items, migrations 007/047/064/066/070/071/073/077/108/110/117/120/125/133/134/164/
//     269/272) computes `effective_archived = COALESCE(workspace_item_overrides.is_archived,
//     intelligence_items.is_archived)` and gates on `provenance_status='verified'` (migration 117's own
//     header: "gates ALL customer surfaces in one place"). `src/lib/supabase-server.ts`'s
//     `fetchWorkspaceResources` (read in full) buckets rows on `effective_archived` into `{active,
//     archived}` and every caller (fetchDashboardData/fetchResourcesOnly/fetchMapData/the three
//     category-routed fetchers) exposes ONLY `active` as `resources` — an archived row never reaches a
//     customer list/detail/dashboard-count render.
//   - `hidden_reason` (migration 062): **zero readers anywhere in `src/`** (grepped `src/lib` and `src/app`
//     in full — no match). Dead column; does not gate anything today.
//   - `pipeline_stage`: read only by an ADMIN surface (`ResearchPipelineQueueView.tsx`) and passed through
//     `fetchResearchPipelineRows`'s row shape for display — that fetcher's own customer GATE is
//     `.eq("is_archived", false).eq("provenance_status", "verified")`, never `pipeline_stage`. Not a hide
//     mechanism on any customer surface.
//   Community/watchlist/search consume the SAME already-gated resource pool (no independent
//   `intelligence_items` query with its own `is_archived` filter found in `watchlist/logic.ts` or
//   `api/community/search/route.ts` — they key off ids already sourced from the active resource pool), so
//   `is_archived` is a single, comprehensive gate for every surface the dispatch named.
//
// ARCHIVE MECHANISM CHOSEN, AND WHY [CONFIRMED]: `archive_reason = 'record_hollow'` via
// `guardedUpdateByIds("intelligence_items", ...)` — a NEW vocabulary value, not one of
// `db.mjs`'s SOURCEY_ARCHIVE_REASONS (`reclassified_to_source`/`source_not_item`/`institutional_source`/
// `non_regulatory_source`/`portal_artifact`). Rule 019 (`.discipline/rules/019-source-reclassify-not-
// archive.mjs`, read in full) fires ONLY when a staged script's archive_reason literal is one of those
// five — `record_hollow` is not, so the raw `guardedUpdateByIds` archive path is the SANCTIONED path here
// (no `reclassifyToSource` detour: this is not a source-not-item reclassification, the row genuinely is a
// record, just an empty one). Migration 135's `_guard_source_archive` trigger is likewise scoped to the
// same five reasons (read in full) — `record_hollow` never trips it. `archivePatch()`-shaped: is_archived
// = true, archive_reason = 'record_hollow', provenance_status reset to 'unverified' (db.mjs's own
// documented invariant: an archived item never retains 'verified').
//
// THE RE-MINT-BLOCKED-BY-ITS-OWN-ARCHIVED-TWIN DEFECT, and this step's fix [CONFIRMED, read in full]:
// `apply-mint-batch.mjs`'s `checkM4`/`buildItemsIndex` and `export-census-rows.mjs`'s
// `buildHeldKeyIndex`/`partitionExcludeHeldByKey` BOTH read archived rows INTO their holder index — their
// own comments say so explicitly ("any row, archived or not, holding this exact key blocks the mint";
// buildHeldKeyIndex records `holder_archived: true` only as an INFORMATIONAL flag, the block itself is
// identical whether the holder is archived or live). Simply archiving the hollow item with a NEW
// archive_reason changes NOTHING about this: the row still carries the SAME `canonical_instrument_key` and
// `source_url` the re-mint payload will derive (same document → same CELEX/ELI key), so checkM4 would
// still return `blocked:true` (`not_applied_holder_conflict` or `not_applied_url_holder`) and the census
// row would sit `would_mint` forever, re-selected and re-blocked on every future export/apply pass — the
// exact residue `apply-mint-batch.mjs`'s own header already documents for `not_applied_*` rows ("left
// UNRECONCILED pending operator archived-holder policy"). Neither `apply-mint-batch.mjs` nor
// `export-census-rows.mjs` is in this lane's write set, so the fix is DATA, applied by the SAME archive
// write this step already makes: `buildArchivePatch()` additionally clears `canonical_instrument_key`,
// `instrument_identifier`, and `source_url` (to `''`, the schema's own NOT-NULL-DEFAULT sentinel for "no
// source_url" — migration 004) on the archived row. Migration 200's `trg_set_canonical_instrument_key`
// (BEFORE INSERT OR UPDATE, read in full) only OVERWRITES `canonical_instrument_key` when
// `derive_canonical_instrument_key(instrument_identifier, source_url)` returns non-NULL; with BOTH inputs
// blanked in the SAME UPDATE, every one of its four regex branches misses and it returns NULL, so the
// trigger's `IF v_key IS NOT NULL` guard leaves the explicit NULL this patch sets untouched. After this
// write: `canonical_instrument_key IS NULL` (drops out of `buildHeldKeyIndex` entirely — it only indexes
// non-null keys) and `source_url = ''` (can never equal a real `document_url`, so `checkM4`'s
// `bySourceUrl` fallback never matches either). The re-mint is admitted on the NEXT population pass with
// no code change to either governing file. Migration 200's partial unique index
// (`uq_intelligence_items_canonical_key_verified_live`, `WHERE ... AND is_archived IS NOT TRUE`) is
// unaffected either way — an archived row was already outside that constraint's WHERE clause.
//
// census_worklist SIDE [CONFIRMED, live SQL]: every one of the 551 targets' matching `census_worklist` row
// (by `document_url = source_url`, 552 row-matches for 551 items — one item, canonical instrument
// 32022D2087, was enumerated twice under two `source_id`s) is ALREADY `dryrun_disposition = 'would_mint'`
// (550 at `enumeration_status='reconciled'`, 1 at `'dry_run_complete'` — 'reconciled' correctly records
// that THIS row already produced the hollow item; re-processing it is exactly this sweep's purpose, and
// `selectCensusRows` filters only on `dryrun_disposition`, never `enumeration_status`, so a 'reconciled'
// row is still a live export candidate). So "return to would_mint" is a NO-OP on that column for the
// live population today (idempotent, re-affirmed anyway so a future row this selection catches that is
// NOT already would_mint is still handled) — the substantive write is `notes`, appended (never
// overwritten — the SAME convention `reopen-validation-holds.mjs`'s own header documents for this table)
// with a marker naming this sweep, so the row is traceable and the next population apply's own log shows
// why a 'reconciled' row was reselected.
//
// REVERSIBILITY [CONFIRMED + one named residual]. This step's own `guardedUpdateByIds`/`guardedUpdate`
// calls (`scripts/lib/db.mjs`) snapshot every row's PRIOR state to `scripts/_snapshots/*.jsonl` before
// mutating — but `fsi-app/.gitignore:64` excludes `fsi-app/scripts/_snapshots/` from every commit, and a
// GitHub Actions dispatch (this step's only real runtime — see the workflow) starts from a fresh
// `actions/checkout` each run and discards the runner disk at job end. A snapshot this step writes during
// an `apply` dispatch therefore does NOT survive to a LATER, separate dispatch — the repo's own general
// reversibility mechanism is CI-ephemeral here, not durable, a fact worth naming rather than assuming.
// Two independent, durable answers, both carried in THIS run's own summary.json (uploaded as a GitHub
// Actions artifact, 90-day retention per the workflow):
//   (a) `per_item[].restore_sql` — one self-contained `UPDATE intelligence_items SET ... WHERE id = '...'`
//       statement per archived item, values read from THIS run's own selection (the true "before"), for
//       an operator to run directly against the DB. Restores identity fields (`is_archived`,
//       `archive_reason`, `canonical_instrument_key`, `instrument_identifier`, `source_url`) and
//       deliberately does NOT set `provenance_status` — migration 115/209's `set_provenance_status` AFTER
//       trigger re-derives it from the row's own (unchanged) claims on the same UPDATE. Whether that
//       re-derivation actually flips back to `'verified'` may depend on ADR-118's `reconciler`-credential
//       binding for a RECONCILIATION flip of a pre-existing row (apply-mint-batch.mjs's own header names
//       this distinction for INSERT- vs UPDATE-origin derivations) — **[HYPOTHESIS, not exercised this
//       session]**: a restored row may need the same bound-reconciler path other provenance flips do
//       rather than reverifying from a plain service-role UPDATE. Named, not asserted.
//   (b) `--arg restore:<id,id,...>` (this same script) — reads `scripts/_snapshots/*.jsonl` for this
//       sweep's own prior-state entries (matched by `_cite.reason` containing this file's CITE marker) and
//       replays them via `guardedUpdate`. Works whenever the snapshot files DO happen to be present (a
//       local by-hand run, or a restore issued inside the SAME job before any checkout resets the disk);
//       refuses (never guesses) any id with no matching snapshot entry, reported in `missing_ids`.
//
// $0, deterministic, no LLM: two `readAll` reads + JS aggregation (no SQL executed at apply time beyond
// the guarded UPDATEs), same shape as every other MAINT step in this directory.
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { hostOf } from "../lib/institution-key.mjs";
import { runCli, fsiRoot } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "remediation-discipline",
  reason:
    "MAINT record-hollow-sweep dispatch (Lane HOLLOW-SWEEP, 2026-09-04): a live verified record-grade " +
    "intelligence_item whose only FACT claim (if any) is the [title] identity span carries no real " +
    "substance and renders with an empty Summary on every customer surface. Archives it " +
    "(archive_reason='record_hollow', not one of db.mjs's SOURCEY_ARCHIVE_REASONS, so rule 019/migration " +
    "135 do not apply) and releases its canonical_instrument_key/instrument_identifier/source_url so the " +
    "row stops blocking apply-mint-batch.mjs's checkM4 / export-census-rows.mjs's buildHeldKeyIndex, both " +
    "of which hold archived rows as blockers too — see this file's own header. Never touches claims, " +
    "sections, or edges; nothing deleted.",
});

export const RESTORE_CITE = Object.freeze({
  skill: "remediation-discipline",
  reason: "MAINT record-hollow-sweep --arg restore: reversal — replays this sweep's own db.mjs prior-state snapshot for an id it archived, verbatim.",
});

export const ARCHIVE_REASON = "record_hollow";
export const SWEEP_MARKER = "record-hollow-sweep";
export const TITLE_FACT_PREFIX = "[title]";
export const RESTORE_ARG_PREFIX = "restore:";

// The exact SQL this step's own two-read + JS-aggregation selection reproduces (documented in the file
// header above; kept here, verbatim, as the report's own citable text — never executed by this script).
export const SELECTION_SQL = `with fact_counts as (
  select intelligence_item_id,
         count(*) filter (where claim_kind = 'FACT') as fact_n,
         count(*) filter (where claim_kind = 'FACT' and claim_text like '[title]%') as title_fact_n
  from section_claim_provenance group by intelligence_item_id
)
select ii.* from intelligence_items ii
left join fact_counts fc on fc.intelligence_item_id = ii.id
where ii.is_archived = false and ii.provenance_status = 'verified' and ii.item_grade = 'record'
  and coalesce(fc.fact_n,0) = coalesce(fc.title_fact_n,0);`;

// ── pure: selection ──────────────────────────────────────────────────────────────────────────────────

/** True when every FACT claim present (zero or one — extractIdentityFact emits at most one title claim
 *  per item) is the `[title]` identity span. Zero FACT claims at all (not even title) also counts — the
 *  defect's own framing ("carry only the [title] FACT") is generous to "carry the title fact or nothing".
 *  Pure. */
export function isTitleOnlyFacts(claims) {
  const factClaims = (claims ?? []).filter((c) => c?.claim_kind === "FACT");
  if (factClaims.length === 0) return true;
  return factClaims.every((c) => typeof c.claim_text === "string" && c.claim_text.startsWith(TITLE_FACT_PREFIX));
}

/** items: [{id, item_type, source_url, instrument_identifier, canonical_instrument_key, archive_reason}].
 *  claimsByItemId: Map(intelligence_item_id -> [{claim_kind, claim_text}]). Pure. */
export function planSelection(items, claimsByItemId) {
  const targets = [];
  for (const it of items ?? []) {
    const claims = claimsByItemId.get(it.id) ?? [];
    if (!isTitleOnlyFacts(claims)) continue;
    const factN = claims.filter((c) => c.claim_kind === "FACT").length;
    targets.push({ ...it, fact_n: factN, host: hostOf(it.source_url) || "(unparseable)" });
  }
  return targets;
}

/** Pure grouping helper for the report's by-item_type / by-source-host counts. */
export function groupCounts(items, keyFn) {
  const out = {};
  for (const it of items ?? []) {
    const k = keyFn(it) ?? "(none)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Pure chunking for .in() query-string-length safety (same convention as supabase-server.ts's
 *  ITEM_TIMELINE_CHUNK_SIZE precedent). */
export function chunkList(list, size) {
  const out = [];
  for (let i = 0; i < (list?.length ?? 0); i += size) out.push(list.slice(i, i + size));
  return out;
}

// ── pure: archive patch (the identity-release fix — see file header) ───────────────────────────────────

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

// ── pure: census_worklist return-to-would_mint plan ─────────────────────────────────────────────────────

export function buildSweepNote(runIso) {
  return (
    `${SWEEP_MARKER} (${runIso}): source intelligence_item archived ${ARCHIVE_REASON} -- row returned to ` +
    `would_mint for re-mint through the improved record-facts extractor.`
  );
}

export function appendNote(existing, marker) {
  const trimmed = typeof existing === "string" ? existing.trim() : "";
  return trimmed ? `${trimmed}\n${marker}` : marker;
}

/** Partition census rows into a SHARED-patch group (no pre-existing notes -> one guardedUpdateByIds call)
 *  and an INDIVIDUAL group (pre-existing notes -> each needs its own appended value, never overwritten).
 *  `dryrun_disposition` is set to 'would_mint' unconditionally (idempotent no-op for a row already there,
 *  live-population precedent: 550/551 already are; still correct for a future row that is not). Pure. */
export function planCensusReturn(censusRows, marker) {
  const shared = [];
  const individual = [];
  for (const r of censusRows ?? []) {
    if (r.notes) individual.push({ id: r.id, notes: appendNote(r.notes, marker) });
    else shared.push(r.id);
  }
  return { shared, individual };
}

// ── pure: restore ────────────────────────────────────────────────────────────────────────────────────

/** Scan every db.mjs snapshot entry for the LATEST prior-state row this sweep itself wrote for each
 *  requested id (matched by table + a substring of `_cite.reason`, so an unrelated snapshot of the same
 *  id by a different script is never picked up). `entries` must already be in write order (oldest first)
 *  -- the real deps reader sorts by filename, which is timestamp-prefixed. Pure. */
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

/** The identity-field restore patch from a prior row snapshot. Deliberately omits `provenance_status` --
 *  the set_provenance_status AFTER trigger re-derives it from the row's own (unchanged) claims on the same
 *  UPDATE; see this file's own header for the ADR-118 reconciler-binding caveat. Pure. */
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

/** A self-contained SQL restore statement for one item, from THIS run's own "before" values (never a live
 *  re-read). Never sets provenance_status -- see this file's header. Pure. */
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
 *   readTargetCandidates: Function, readClaimsForItems: Function, readCensusRowsForUrls: Function,
 *   readItemsByIds: Function, archiveTargets: Function, censusReturnShared: Function,
 *   censusReturnOne: Function, readSnapshotEntries: Function, restoreOne: Function, nowIso?: Function,
 * }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "record-hollow-sweep", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  if (arg && arg.startsWith(RESTORE_ARG_PREFIX)) {
    return runRestore({ apply, arg }, deps, summary);
  }

  // ── SELECTION (dry and apply both compute it identically) ─────────────────────────────────────────
  const items = await deps.readTargetCandidates();
  const itemIds = items.map((i) => i.id);
  const claimRows = itemIds.length ? await deps.readClaimsForItems(itemIds) : [];
  const claimsByItemId = new Map();
  for (const c of claimRows) {
    const arr = claimsByItemId.get(c.intelligence_item_id) ?? [];
    arr.push(c);
    claimsByItemId.set(c.intelligence_item_id, arr);
  }
  const targets = planSelection(items, claimsByItemId);

  summary.counts = {
    candidates_scanned: items.length,
    target_total: targets.length,
    by_item_type: groupCounts(targets, (t) => t.item_type),
    by_source_host: groupCounts(targets, (t) => t.host),
  };
  summary.target_ids = targets.map((t) => t.id);
  summary.selection_sql = SELECTION_SQL;

  if (!apply) return summary;

  if (!targets.length) {
    summary.note = "0 targets matched the selection this run -- nothing to archive.";
    return summary;
  }

  // ── apply: archive (identity-release patch — admits the re-mint, see file header) ──────────────────
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
      item_type: before.item_type ?? null,
      host: before.host ?? null,
      before: {
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

  // ── apply: return the corresponding census_worklist rows to would_mint ─────────────────────────────
  const urls = [...new Set(targets.map((t) => t.source_url).filter(Boolean))];
  const censusRows = urls.length ? await deps.readCensusRowsForUrls(urls) : [];
  const runIso = deps.nowIso ? deps.nowIso() : new Date().toISOString();
  const marker = buildSweepNote(runIso);
  const { shared, individual } = planCensusReturn(censusRows, marker);

  let censusUpdated = 0;
  if (shared.length) {
    const r = await deps.censusReturnShared(shared, { dryrun_disposition: "would_mint", notes: marker });
    censusUpdated += r.updated ?? 0;
  }
  for (const row of individual) {
    const r = await deps.censusReturnOne(row.id, { dryrun_disposition: "would_mint", notes: row.notes });
    censusUpdated += r.updated ?? 0;
  }
  summary.counts.census_rows_matched = censusRows.length;
  summary.counts.census_rows_returned = censusUpdated;

  // ── read-back ────────────────────────────────────────────────────────────────────────────────────
  const readBackItems = await deps.readItemsByIds(targetIds);
  const notArchived = readBackItems.filter((r) => r.is_archived !== true || r.archive_reason !== ARCHIVE_REASON);
  summary.read_back = {
    archived_record_hollow_total: readBackItems.length - notArchived.length,
    not_confirmed_archived_ids: notArchived.map((r) => r.id),
    census_rows_returned: censusUpdated,
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
  const citeMarker = "MAINT record-hollow-sweep dispatch (Lane HOLLOW-SWEEP";
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

const READ_CHUNK = 150; // .in() query-string-length safety, same convention as supabase-server.ts

/** Reads every `*_intelligence_items.jsonl` file under scripts/_snapshots/ (db.mjs's own snapshot
 *  convention), oldest-first by filename (timestamp-prefixed, so lexicographic == chronological), and
 *  parses each line as one snapshot entry. Best-effort: a malformed line is skipped, never thrown. See
 *  this file's header for why this directory is NOT a durable cross-GitHub-Actions-run mechanism. */
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
    step: "record-hollow-sweep",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedUpdateByIds, guardedUpdate } = await import("../lib/db.mjs");

      const readChunked = async (table, columns, column, values) => {
        const out = [];
        for (const c of chunkList(values, READ_CHUNK)) {
          const rows = await readAll(table, columns, { match: (q) => q.in(column, c) });
          out.push(...rows);
        }
        return out;
      };

      return {
        readTargetCandidates: () =>
          readAll(
            "intelligence_items",
            "id, item_type, source_url, instrument_identifier, canonical_instrument_key, archive_reason",
            { match: (q) => q.eq("is_archived", false).eq("provenance_status", "verified").eq("item_grade", "record") },
          ),
        readClaimsForItems: (ids) => readChunked("section_claim_provenance", "intelligence_item_id, claim_kind, claim_text", "intelligence_item_id", ids),
        readCensusRowsForUrls: (urls) => readChunked("census_worklist", "id, document_url, dryrun_disposition, notes", "document_url", urls),
        readItemsByIds: (ids) => readChunked("intelligence_items", "id, is_archived, archive_reason", "id", ids),
        archiveTargets: (ids, patch) =>
          guardedUpdateByIds("intelligence_items", ids, patch, {
            cite: CITE,
            select: "id, is_archived, archive_reason, provenance_status, canonical_instrument_key, instrument_identifier, source_url",
            applyMatch: (q) => q.eq("is_archived", false).eq("provenance_status", "verified"),
          }),
        censusReturnShared: (ids, patch) => guardedUpdateByIds("census_worklist", ids, patch, { cite: CITE, select: "id" }),
        censusReturnOne: (id, patch) => guardedUpdate("census_worklist", (q) => q.eq("id", id), patch, { cite: CITE, select: "id" }),
        readSnapshotEntries: async () => readSnapshotEntriesFromDisk(),
        restoreOne: (id, patch) => guardedUpdate("intelligence_items", (q) => q.eq("id", id), patch, { cite: RESTORE_CITE, select: "id" }),
      };
    },
  });
}
