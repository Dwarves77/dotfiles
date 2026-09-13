#!/usr/bin/env node
// resolve-refetch-holds.mjs -- MAINT step for D17 family 11 of the 2026-09-12 defect fix plan
// (docs/plans/defect-fix-plan-2026-09-12.md, ruling table row 11, lane L11). Resolves the
// `refetch-capped-worklist` holds: rows scripts/remediation/refetch-capped-worklist.mjs's own EXECUTE
// mode wrote when a legacy-capped pool row's fresh re-capture no longer verified a grounded FACT span
// (holdRow, that file's own header) -- a real provenance question (ADR-016), not a proposer asking a
// human for nothing. The enumeration (docs/audits/quarantine-and-human-flag-writers-2026-09-12.md,
// Family 11) found no dedicated resolver; this is that resolver.
//
// [CONFIRMED, deviation from the plan's literal wording, disclosed per this lane's own contract] The plan
// text names "the existing groundBrief entry point" as the re-grounding mechanism. groundBrief
// (src/lib/agent/canonical-pipeline.ts) is a PAID Sonnet + Browserless call -- incompatible with this
// lane's own $0 constraint (docs/dispatches/lane-common-contract.md SS0: "no LLM calls, no paid
// services") and with the plan's own parenthetical in the SAME sentence, "snapshot first, zero fetch".
// The actual zero-fetch, snapshot-first grounding entry point this repo already has -- and the one
// regen-quarantined.mjs / verify-item.mjs (src/lib/sources/verify-item.mjs) already use for exactly this
// class of re-check -- is cheapVerifyClaims (src/lib/sources/cheap-verify.mjs): re-confirm each claim's
// verbatim source_span against the item's own stored capture text, ZERO model calls, ZERO fetch. This
// script reuses cheapVerifyClaims's own spanPresent/normalizeForMatch primitives directly (to keep the
// per-claim ids the wrapper's own aggregate result drops) -- never a second grounding path. It does NOT
// use timeline-backfill-derive.mjs's pickBestCapture (a single-pick selector) -- see "FIX ROUND 2" below
// for why picking one capture, even the "best" one, was itself the defect.
//
// PER ITEM (one or more open `refetch-capped-worklist` flags share a subject_ref -- grouped, resolved
// together):
//   1. Read the item's live FACT claims (section_claim_provenance) and its FULL agent_run_searches pool
//      (every stored capture, not the newest alone -- fix round 2, below).
//   2. No usable capture at all -> outcome 'no_capture': nothing to verify against; flags resolve
//      honestly, naming that the item awaits a real capture (Family 1's regen-quarantined.mjs sweep
//      already covers it if it is quarantined).
//   3. A capture exists but the item carries no FACT claims to check -> outcome 'no_fact_claims':
//      nothing to supersede; flags resolve honestly.
//   4. Every FACT span verifies against AT LEAST ONE stored capture -> outcome 're_grounded': flags
//      resolve naming the capture that grounds them (the dominant one, see fix round 2) and, if the
//      newest capture was degraded, that finding too.
//   5. One or more FACT spans verify against NO stored capture (checked every pool row) -> each such
//      claim is SUPERSEDED through the EXISTING claim_versions mechanism (src/lib/agent/ledger-apply.mjs's
//      own versionPayload row shape, supersede_reason 'changed' -- a re-attribution record, never
//      proof-of-inaccuracy, since no fresh re-ground data replaces it) and the current row's
//      mint_hold_reason is set so the mint gate holds until a real re-ground lands. On apply, the item's
//      OWN provenance_status is re-read afterward (the set_provenance_status trigger, migration 209,
//      re-evaluates on every touch to its claims): if it quarantined, the outcome is 'quarantined' (an
//      ENQUEUE into Family 1's own open investigation, regen-quarantined.mjs -- no second mechanism);
//      otherwise 'superseded' (the item's other claims still meet the provenance criteria).
//
// FIX ROUND 2 (coordinator, 2026-09-13, defect-fix-plan-2026-09-12.md "Fix round 2 for L11, family 11",
// after dry run 34733905421): the FIRST version of this step verified spans against `pickBestCapture`'s
// pick alone -- the SINGLE longest-content row, which this step's own header called "the newest/best
// stored capture". That pick is NOT reliably the newest, and even when it is, "newest" is not reliably
// authoritative: the dry run would have superseded 263 of 333 live FACT claims across seven items
// because their actual-newest capture rows are degraded fetches (126-382-character news stubs), while an
// OLDER pool row for the same item holds the full instrument (up to 249,114 characters) that verifies
// every span. Applying that dry run would have DESTROYED 263 correct claims on a degraded-fetch
// artifact, not a real content change -- exactly the failure class the re-grounds-never-destroy dominance
// guard (PR #336, src/lib/agent/ledger-dominance.mjs) exists to name, applied here to a different
// mechanism (span-verification across a pool, not ledger-axis comparison, so this step does not import
// that module -- the axes it compares do not apply to a raw span check -- but honors the SAME doctrine:
// a worse answer is a DIAGNOSTIC, never grounds for destroying a better one).
//
// THE FIX: `planItemReground` now checks EVERY usable stored capture in the item's pool, not one picked
// capture. A claim is superseded ONLY when NO capture (old or new) verifies its span. Separately, the
// NEWEST capture (by `searched_at`) is compared against the DOMINANT capture (the one verifying the most
// spans): when the newest verifies fewer spans than the dominant, that is recorded as "degraded newest"
// in the resolution note (naming both capture rows and their lengths) and does NOT cause any supersession
// by itself -- the claims stay grounded on the dominant capture. `pickBestCapture` (a single-pick
// selector) is no longer used by this step; every capture is read and checked.
//
// $0, no LLM, no paid fetch. Dry by default; --mode apply writes through scripts/lib/db.mjs's guarded path.
import { readAll, guardedInsert, guardedUpdate, guardedUpdateByIds } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { normalizeForMatch, spanPresent } from "../../src/lib/sources/cheap-verify.mjs";
import { versionPayload } from "../../src/lib/agent/ledger-apply.mjs";

export const CITE = Object.freeze({
  skill: "defect-fix-plan-2026-09-12 D17 family 11 (lane L11)",
  reason:
    "Resolve refetch-capped-worklist holds: a real ADR-016 provenance question, re-checked snapshot-" +
    "first/zero-fetch against the item's newest stored capture (cheapVerifyClaims, the same entry point " +
    "verify-item.mjs / regen-quarantined.mjs already use); a span that no longer verifies is superseded " +
    "through the existing claim_versions mechanism (supersede_reason 'changed'), never a second " +
    "grounding path and never a fabricated re-ground.",
});

export const HOLD_CREATED_BY = "refetch-capped-worklist";
export const RESOLVED_BY = "resolve-refetch-holds";

const FLAG_COLUMNS = "id, created_by, description, status, subject_ref, category";
const CLAIM_COLUMNS = "id, claim_kind, claim_text, source_span, source_id, section_row_id, search_result_id, source_tier_at_grounding, mint_hold_reason";
const CAPTURE_COLUMNS = "id, result_content, searched_at";

// ---------------------------------------------------------------------------------------------------
// Pure planning (unit-tested with no I/O).
// ---------------------------------------------------------------------------------------------------

/**
 * Group a flat list of open hold flags by their shared subject_ref (item id). Pure.
 * @param {Array<{id:string, subject_ref?:string|null}>} rows
 * @returns {Map<string, Array<object>>}
 */
export function groupHoldsByItem(rows) {
  const byItem = new Map();
  for (const row of rows ?? []) {
    const key = row.subject_ref;
    if (!key) continue;
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push(row);
  }
  return byItem;
}

/** Pure: a short, stable label naming a capture row for a resolution note ("row <id>" or "an unidentified
 *  row" if the injected fixture carries no id -- never fabricates one). */
export function captureRowLabel(capture) {
  return capture && capture.id != null ? `row ${capture.id}` : "an unidentified row";
}

/** Pure: the char length of a capture's stored content, honestly 0 for a missing/empty row. */
export function captureLength(capture) {
  return String(capture?.result_content ?? "").length;
}

/**
 * The zero-fetch, snapshot-first re-check for ONE item: which of its FACT claims verify against ANY of
 * its stored captures -- fix round 2 (2026-09-13, "Fix round 2 for L11, family 11"): every usable pool
 * row is checked, never one picked capture, per the re-grounds-never-destroy doctrine (a worse capture
 * is a diagnostic, never grounds for destroying claims a better capture still verifies). Pure, given the
 * data a caller already read. Reuses spanPresent/normalizeForMatch directly (rather than
 * cheapVerifyClaims' own aggregate wrapper) so the per-claim `id` survives into the unmatched set --
 * required to supersede the EXACT row, never a guess by text match alone.
 * @param {{claims: Array<object>, captures: Array<{id?:string|null, result_content?:string|null, searched_at?:string|null}>}} input
 * @returns {{
 *   outcome: 'no_capture'|'no_fact_claims'|'re_grounded'|'needs_supersede',
 *   unmatchedFactClaims: Array<object>, factTotal: number,
 *   dominantCapture: object|null, newestCapture: object|null,
 *   degradedNewest: {newest:object, newestVerified:number, dominant:object, dominantVerified:number}|null,
 * }}
 */
export function planItemReground({ claims, captures }) {
  const usable = (captures ?? []).filter((c) => String(c?.result_content ?? "").trim().length > 0);
  if (!usable.length) {
    return { outcome: "no_capture", unmatchedFactClaims: [], factTotal: 0, dominantCapture: null, newestCapture: null, degradedNewest: null };
  }
  const factClaims = (claims ?? []).filter((c) => String(c?.claim_kind ?? "").toLowerCase() === "fact");
  if (!factClaims.length) {
    return { outcome: "no_fact_claims", unmatchedFactClaims: [], factTotal: 0, dominantCapture: null, newestCapture: null, degradedNewest: null };
  }

  // Per-capture: which FACT claim ids does THIS row's text verify. Every row is checked independently --
  // no single "the capture" is ever picked before the check runs.
  const perCapture = usable.map((capture) => {
    const normalized = normalizeForMatch(capture.result_content);
    const verifiedIds = new Set(factClaims.filter((c) => spanPresent(c.source_span, normalized)).map((c) => c.id));
    return { capture, verifiedIds, verifiedCount: verifiedIds.size };
  });

  // A claim is unmatched only when NO capture (old or new) verifies it -- the union across the pool.
  const verifiedByAny = new Set();
  for (const pc of perCapture) for (const id of pc.verifiedIds) verifiedByAny.add(id);
  const unmatchedFactClaims = factClaims.filter((c) => !verifiedByAny.has(c.id));

  // Dominant capture: verifies the MOST spans (ties broken by longer stored content, then array order --
  // deterministic, never random, never "newest wins a tie" since that is exactly the assumption this fix
  // round removes).
  const dominant = perCapture.reduce((best, pc) => {
    if (!best) return pc;
    if (pc.verifiedCount > best.verifiedCount) return pc;
    if (pc.verifiedCount === best.verifiedCount && captureLength(pc.capture) > captureLength(best.capture)) return pc;
    return best;
  }, null);

  // Newest capture: the row with the latest PARSEABLE searched_at. A row with no/unparseable searched_at
  // is never assumed newest (it simply cannot win the comparison) -- an absent date is not evidence of
  // recency.
  const newest = perCapture.reduce((latest, pc) => {
    const t = Date.parse(pc.capture?.searched_at ?? "");
    if (!Number.isFinite(t)) return latest;
    if (!latest || t > Date.parse(latest.capture?.searched_at ?? "")) return pc;
    return latest;
  }, null);

  const degradedNewest =
    newest && dominant && newest.capture !== dominant.capture && newest.verifiedCount < dominant.verifiedCount
      ? { newest: newest.capture, newestVerified: newest.verifiedCount, dominant: dominant.capture, dominantVerified: dominant.verifiedCount }
      : null;

  const outcome = unmatchedFactClaims.length ? "needs_supersede" : "re_grounded";
  return {
    outcome,
    unmatchedFactClaims,
    factTotal: factClaims.length,
    dominantCapture: dominant?.capture ?? null,
    newestCapture: newest?.capture ?? null,
    degradedNewest,
  };
}

/** Pure: the "degraded newest" clause shared by both note builders below -- names both capture rows and
 *  their lengths, and states which row the claims actually ground on instead. Empty string when there is
 *  no degradation to report. */
export function degradedNewestClause(degradedNewest) {
  if (!degradedNewest) return "";
  const { newest, newestVerified, dominant, dominantVerified } = degradedNewest;
  return (
    ` Degraded newest: ${captureRowLabel(newest)} (${captureLength(newest)} chars) verifies ${newestVerified} ` +
    `span(s) vs ${captureRowLabel(dominant)} (${captureLength(dominant)} chars) verifying ${dominantVerified}; ` +
    `re-grounded on ${captureRowLabel(dominant)} instead.`
  );
}

/** Pure: the resolution_note for one item's dry-mode plan (the apply-mode note is built after the
 *  post-write provenance re-read, below, since 'needs_supersede' resolves to 'superseded' or
 *  'quarantined' only once the writes have actually run). */
export function buildDryResolutionNote(plan) {
  switch (plan.outcome) {
    case "no_capture":
      return "no stored capture available to re-check against (zero-fetch, per this lane's $0 constraint); left as-is -- the Family 1 provenance-gate sweep (regen-quarantined.mjs) already covers this item if it is quarantined.";
    case "no_fact_claims":
      return "item currently carries no FACT claim to re-check; nothing to supersede.";
    case "re_grounded":
      return (
        `all ${plan.factTotal} FACT span(s) verify against at least one stored capture (every pool row ` +
        `checked, zero fetch); re-grounded on ${captureRowLabel(plan.dominantCapture)} (${captureLength(plan.dominantCapture)} chars).` +
        degradedNewestClause(plan.degradedNewest)
      );
    case "needs_supersede":
      return (
        `${plan.unmatchedFactClaims.length} of ${plan.factTotal} FACT span(s) verify against NO stored capture ` +
        "(every pool row checked); would supersede through claim_versions (supersede_reason 'changed')." +
        degradedNewestClause(plan.degradedNewest)
      );
    default:
      return "unrecognized outcome";
  }
}

/** Pure: the FINAL (apply-mode) resolution_note once superseding has run and the item's post-write
 *  provenance_status is known. Only called for the 'needs_supersede' plans. */
export function buildAppliedSupersedeNote(plan, provenanceStatusAfter) {
  const n = plan.unmatchedFactClaims.length;
  const groundedOn = plan.dominantCapture
    ? ` The item's other claims re-ground on ${captureRowLabel(plan.dominantCapture)} (${captureLength(plan.dominantCapture)} chars).`
    : "";
  const degraded = degradedNewestClause(plan.degradedNewest);
  if (provenanceStatusAfter === "quarantined") {
    return (
      `${n} FACT claim(s) superseded (verified by NO stored capture, every pool row checked); the item ` +
      "quarantined under the provenance gate -- now an open Family 1 investigation, resolver regen-quarantined.mjs." +
      groundedOn + degraded
    );
  }
  return (
    `${n} FACT claim(s) superseded (verified by NO stored capture, every pool row checked); the item's ` +
    "other claims still meet the provenance criteria (re-grounded)." +
    groundedOn + degraded
  );
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const nowIso = deps.nowIso ?? new Date().toISOString();
  const summary = { step: "resolve-refetch-holds", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  const rows = await deps.readCandidates();
  const byItem = groupHoldsByItem(rows);

  const byOutcome = {};
  const sampleByOutcome = {};
  let supersededClaims = 0;
  let flagsResolved = 0;
  let degradedNewestCount = 0;

  for (const [itemId, flagsForItem] of byItem) {
    const claims = await deps.readClaims(itemId);
    const captures = await deps.readCaptures(itemId);
    const plan = planItemReground({ claims, captures });
    if (plan.degradedNewest) degradedNewestCount += 1;

    let finalOutcome = plan.outcome;
    let note = buildDryResolutionNote(plan);

    if (apply) {
      if (plan.outcome === "needs_supersede") {
        for (const claim of plan.unmatchedFactClaims) {
          const versions = await deps.readClaimVersions(claim.id);
          const nextVersion = (versions.reduce((max, v) => Math.max(max, Number(v.version_number) || 0), 0)) + 1;
          await deps.archiveClaimVersion(versionPayload(claim, itemId, nextVersion, "changed", null, nowIso));
          await deps.holdClaimPendingReground(claim.id);
          supersededClaims += 1;
        }
        const provenanceStatusAfter = await deps.readItemProvenanceStatus(itemId);
        finalOutcome = provenanceStatusAfter === "quarantined" ? "quarantined" : "superseded";
        note = buildAppliedSupersedeNote(plan, provenanceStatusAfter);
      }
      const ids = flagsForItem.map((f) => f.id);
      await deps.resolveFlags(ids, note);
      flagsResolved += ids.length;
    }

    byOutcome[finalOutcome] = (byOutcome[finalOutcome] ?? 0) + 1;
    if (!sampleByOutcome[finalOutcome]) sampleByOutcome[finalOutcome] = [];
    if (sampleByOutcome[finalOutcome].length < 20) {
      sampleByOutcome[finalOutcome].push({ item_id: itemId, flag_ids: flagsForItem.map((f) => f.id), note });
    }
  }

  summary.counts = {
    flags_scanned: rows.length,
    items_scanned: byItem.size,
    by_outcome: byOutcome,
    superseded_claims: supersededClaims,
    flags_resolved: flagsResolved,
    degraded_newest: degradedNewestCount,
  };
  summary.sample_by_outcome = sampleByOutcome;

  if (!apply) {
    summary.note = `DRY -- ${byItem.size} item(s) evaluated (${JSON.stringify(byOutcome)}). Nothing written.`;
    return summary;
  }

  summary.applied = flagsResolved;
  const remaining = await deps.readRemainingOpen();
  summary.read_back = {
    remaining_open: remaining.length,
    remaining_sample: remaining.slice(0, 20).map((r) => ({ id: r.id, subject_ref: r.subject_ref })),
  };
  summary.note =
    `Resolved ${flagsResolved} refetch-capped-worklist hold(s) across ${byItem.size} item(s) ` +
    `(${JSON.stringify(byOutcome)}); ${supersededClaims} FACT claim(s) superseded. ${remaining.length} ` +
    "row(s) remain open (expected: a race against a concurrent writer).";

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "resolve-refetch-holds",
    main,
    needsDb: true,
    buildDeps: async () => ({
      readCandidates: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) => q.eq("created_by", HOLD_CREATED_BY).in("status", ["open", "in_review"]),
        }),
      readClaims: (itemId) =>
        readAll("section_claim_provenance", CLAIM_COLUMNS, { match: (q) => q.eq("intelligence_item_id", itemId) }),
      readCaptures: (itemId) =>
        readAll("agent_run_searches", CAPTURE_COLUMNS, { match: (q) => q.eq("intelligence_item_id", itemId) }),
      readClaimVersions: (claimId) =>
        readAll("claim_versions", "version_number", { match: (q) => q.eq("current_claim_id", claimId) }),
      archiveClaimVersion: (row) => guardedInsert("claim_versions", row, { cite: CITE, select: "id" }),
      holdClaimPendingReground: (claimId) =>
        guardedUpdate(
          "section_claim_provenance",
          (qb) => qb.eq("id", claimId),
          { mint_hold_reason: "resolve-refetch-holds: span not present in the newest stored capture; superseded pending re-ground" },
          { cite: CITE },
        ),
      readItemProvenanceStatus: async (itemId) => {
        const rows = await readAll("intelligence_items", "provenance_status", { match: (q) => q.eq("id", itemId) });
        return rows[0]?.provenance_status ?? null;
      },
      // guardedUpdateByIds (chunked, F39-safe), not a raw guardedUpdate(.in("id", ids)) -- ids here is
      // one item's own hold-flag id list, always small in practice, but F39 (the unbounded-.in()-filter
      // fitness function, scripts/lib/db.mjs's own IN-CHUNK class) requires the chunked path for every
      // runtime-sized array, never an inline exemption comment for a list that is merely usually small.
      resolveFlags: (ids, note) =>
        guardedUpdateByIds(
          "integrity_flags",
          ids,
          { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: RESOLVED_BY, resolution_note: note },
          { cite: CITE, applyMatch: (q) => q.in("status", ["open", "in_review"]) },
        ),
      readRemainingOpen: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) => q.eq("created_by", HOLD_CREATED_BY).in("status", ["open", "in_review"]),
        }),
    }),
  });
}
