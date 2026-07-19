// census-writer — the intake-census lane's write seam (mandate 2026-07-19). Persists the disposition of
// every ENUMERATED document to Session B's census_worklist (migration 221), so a full-corpus gap census
// can be rolled up per surface. This is the WRITE half of the census; consumePortalCandidates is the
// read+classify+dryRun half (deliberately read-only re: the corpus/ledger). census_worklist is NOT the
// corpus and NOT the candidate ledger — it is the measurement table, and writing to it is the whole point
// of the census mandate.
//
// KEY FACTS about census_worklist (migration 221, shape-confirmed):
//   - UNIQUE (source_id, document_url) — one row per (source, document); the writer UPSERTs on that key,
//     so a re-walk updates the same row (idempotent, resumable).
//   - dryrun_disposition CHECK enum: would_mint | dedup_hit | congruence_reject | invariant_reject | hold.
//     A hold REQUIRES hold_reason (DB CHECK: (dryrun_disposition='hold') = (hold_reason IS NOT NULL)).
//   - surface_tags text[] CHECK-constrained to {regulations, operations, market_intel, research}.
//   - lane CHECK ('A','C'); this lane is 'A' (intake). identity columns immutable-after-insert (trigger).
//   - enumeration_status defaults 'discovered'; moves to 'dispositioned' once a dryrun_disposition lands.
//
// DISPOSITION MAP (consume CandidateDisposition -> census dryrun_disposition + enumeration_status):
//   would_mint  -> would_mint          , dry_run_complete  (a genuine gap on a held source)
//   exists      -> dedup_hit           , dry_run_complete  (already a corpus item; census CONFIRMS coverage)
//   would_reject/rejected -> congruence_reject | invariant_reject , dry_run_complete  (reason picks which)
//   not_an_item -> hold                , classified        (entity gate: portal/uncertain, never dry-run'd;
//                                                            hold_reason carries the verdict)
//   skipped     -> NOT WRITTEN          (fetch/classify inconclusive — no census verdict yet; counted and
//                                        reported, left OUT of the table so it is naturally re-walked, and
//                                        so a transient failure never clobbers a prior disposition down to
//                                        null or trips the forward-only enumeration_status guard).
//
// enumeration_status enum (migration 221): discovered -> classified -> dry_run_complete -> reconciled, plus
// flagged; transitions are guarded FORWARD-ONLY by a trigger, which is the other reason a skipped row is not
// written (writing 'discovered' over an existing 'dry_run_complete' row would raise).
//
// LEASE DISCIPLINE (operator-specified): the batch write for one source runs under a per-source
// mutation lease (holder = the lane id), so Session A and Session C cannot write the same source's census
// rows concurrently. The UNIQUE key is the row-level backstop; the lease is the batch-level guard.

/** Map a consume outcome's disposition + reason to the census_worklist dryrun_disposition enum (or null
 *  for an inconclusive/skipped row). Congruence-vs-invariant is read from the chokepoint reason text. */
export function censusDisposition(outcome) {
  switch (outcome.disposition) {
    case "would_mint":
    case "promoted":
      return "would_mint";
    case "exists":
      return "dedup_hit";
    case "would_reject":
    case "rejected": {
      const r = (outcome.reason || "").toLowerCase();
      // congruence gates (1a/1b source<->claim-type) name "congruence"; everything else (source-link,
      // dedup-nonnews-hard-reject, idempotency) is an invariant reject.
      return r.includes("congruence") ? "congruence_reject" : "invariant_reject";
    }
    case "not_an_item":
      return "hold";
    case "skipped":
    default:
      return null; // inconclusive — recorded as 'discovered', re-dispositioned on a later walk
  }
}

/** True when this outcome carries a census verdict (a dryrun_disposition). A skipped/inconclusive outcome
 *  returns false — it is not written (see the header). */
export function isCensusWritable(outcome) {
  return censusDisposition(outcome) !== null;
}

/** Build the census_worklist row for one DISPOSITIONED document from its consume outcome. Pure. Callers
 *  must gate on isCensusWritable first — a skipped outcome has no disposition and is not written. */
export function buildCensusRow(outcome, { sourceId, lane, createdBy, capHit, shapeClass, nowIso }) {
  const disposition = censusDisposition(outcome);
  const surfaceTags = Array.isArray(outcome.surfaceTags) ? outcome.surfaceTags : [];
  // not_an_item (hold) was classified but never dry-run'd (entity gate is upstream of the chokepoint);
  // every other disposition came through the dry chokepoint. Both are forward from 'discovered'.
  const enumerationStatus = disposition === "hold" ? "classified" : "dry_run_complete";
  const row = {
    source_id: sourceId,
    document_url: outcome.url,
    lane,
    created_by: createdBy,
    enumeration_status: enumerationStatus,
    cap_hit: !!capHit,
    dryrun_disposition: disposition,
    surface_tags: surfaceTags,
    updated_at: nowIso,
  };
  if (shapeClass) row.shape_class = shapeClass;
  // hold REQUIRES a hold_reason (DB CHECK: (dryrun_disposition='hold') = (hold_reason IS NOT NULL)).
  if (disposition === "hold") row.hold_reason = (outcome.reason || "entity-gate: not a specific document").slice(0, 900);
  if (outcome.reason) row.notes = outcome.reason.slice(0, 900);
  return row;
}

/**
 * Upsert census_worklist rows for a batch of consume outcomes, under a per-source mutation lease.
 * READ path (consumePortalCandidates) stays untouched; this is a separate write seam the runner calls
 * AFTER a consume chunk. Returns {written, skipped, leaseError}. A skipped/inconclusive outcome is still
 * WRITTEN (as 'discovered', null disposition) so the enumeration count is complete and the row is
 * re-dispositionable; only a missing url is dropped.
 *
 * @param {object} sb            supabase client (service-role)
 * @param {object[]} outcomes    consume result.outcomes
 * @param {object} opts          { sourceId, lane, createdBy, capHit?, shapeClass?, withLease, nowIso? }
 *   withLease is injected (scripts/lib/mutation-lease.mjs withLease) so this module has no import cycle
 *   and is unit-testable with a fake.
 * @returns {{written:number, skipped:number, leaseError:(string|null)}}  skipped = outcomes NOT written
 *   (missing url, or inconclusive/skipped with no census verdict — counted, reported, re-walkable).
 */
export async function writeCensusRows(sb, outcomes, opts) {
  const { sourceId, lane, createdBy, capHit = false, shapeClass = null, withLease } = opts;
  const nowIso = opts.nowIso || new Date().toISOString();
  if (!sourceId || !lane || !createdBy) throw new Error("writeCensusRows: sourceId, lane, createdBy required");
  if (typeof withLease !== "function") throw new Error("writeCensusRows: withLease must be injected");

  const rows = [];
  let dropped = 0;
  for (const o of outcomes) {
    if (!o.url || !isCensusWritable(o)) { dropped++; continue; } // no url, or no census verdict yet
    rows.push(buildCensusRow(o, { sourceId, lane, createdBy, capHit, shapeClass, nowIso }));
  }
  if (!rows.length) return { written: 0, skipped: dropped, leaseError: null };

  let written = 0;
  let leaseError = null;
  // Per-source lease: A and C cannot write the same source's census rows at once. The lease key is the
  // source_id (mutation_leases is a generic leasable-key table, no FK — migration 211). withLease THROWS a
  // named error (err.leaseHeldBy) when the OTHER lane holds it — caught here as a refusal, never a clobber.
  try {
    await withLease(sb, sourceId, createdBy, lane, async () => {
      // UPSERT on the UNIQUE (source_id, document_url) key — a re-walk updates the same row (idempotent).
      const { error, count } = await sb
        .from("census_worklist")
        .upsert(rows, { onConflict: "source_id,document_url", count: "exact" });
      if (error) throw new Error(`census_worklist upsert failed: ${error.message}`);
      written = count ?? rows.length;
    });
  } catch (e) {
    if (e && e.leaseHeldBy) { leaseError = e.message; written = 0; }
    else throw e; // a real upsert/DB error is not swallowed
  }

  return { written, skipped: dropped, leaseError };
}
