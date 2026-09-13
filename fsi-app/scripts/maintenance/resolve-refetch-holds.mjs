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
// script reuses cheapVerifyClaims (and its own spanPresent/normalizeForMatch primitives, to keep the
// per-claim ids the wrapper's own aggregate result drops) and timeline-backfill-derive.mjs's
// pickBestCapture (the SAME "newest/best stored capture" selection timeline-backfill.mjs already uses) --
// never a second grounding path.
//
// PER ITEM (one or more open `refetch-capped-worklist` flags share a subject_ref -- grouped, resolved
// together):
//   1. Read the item's live FACT claims (section_claim_provenance) and its best stored capture
//      (pickBestCapture over agent_run_searches).
//   2. No usable capture at all -> outcome 'no_capture': nothing to verify against; flags resolve
//      honestly, naming that the item awaits a real capture (Family 1's regen-quarantined.mjs sweep
//      already covers it if it is quarantined).
//   3. A capture exists but the item carries no FACT claims to check -> outcome 'no_fact_claims':
//      nothing to supersede; flags resolve honestly.
//   4. Every FACT span still verifies against the capture -> outcome 're_grounded': flags resolve noting
//      the confirmed count.
//   5. One or more FACT spans no longer verify -> each such claim is SUPERSEDED through the EXISTING
//      claim_versions mechanism (src/lib/agent/ledger-apply.mjs's own versionPayload row shape,
//      supersede_reason 'changed' -- a re-attribution record, never proof-of-inaccuracy, since no fresh
//      re-ground data replaces it) and the current row's mint_hold_reason is set so the mint gate holds
//      until a real re-ground lands. On apply, the item's OWN provenance_status is re-read afterward (the
//      set_provenance_status trigger, migration 209, re-evaluates on every touch to its claims): if it
//      quarantined, the outcome is 'quarantined' (an ENQUEUE into Family 1's own open investigation,
//      regen-quarantined.mjs -- no second mechanism); otherwise 'superseded' (the item's other claims
//      still meet the provenance criteria).
//
// $0, no LLM, no paid fetch. Dry by default; --mode apply writes through scripts/lib/db.mjs's guarded path.
import { readAll, guardedInsert, guardedUpdate, guardedUpdateByIds } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { pickBestCapture } from "../../src/lib/agent/timeline-backfill-derive.mjs";
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
const CAPTURE_COLUMNS = "result_content, searched_at";

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

/**
 * The zero-fetch, snapshot-first re-check for ONE item: which of its FACT claims still verify against
 * its best stored capture. Pure, given the data a caller already read. Reuses spanPresent/
 * normalizeForMatch directly (rather than cheapVerifyClaims' own aggregate wrapper) so the per-claim
 * `id` survives into the unmatched set -- required to supersede the EXACT row, never a guess by text
 * match alone.
 * @param {{claims: Array<object>, bestCapture: {result_content?:string|null}|null}} input
 * @returns {{outcome: 'no_capture'|'no_fact_claims'|'re_grounded'|'needs_supersede', unmatchedFactClaims: Array<object>, factTotal: number}}
 */
export function planItemReground({ claims, bestCapture }) {
  const capturedText = bestCapture?.result_content ?? null;
  if (!capturedText) {
    return { outcome: "no_capture", unmatchedFactClaims: [], factTotal: 0 };
  }
  const normalized = normalizeForMatch(capturedText);
  const factClaims = (claims ?? []).filter((c) => String(c?.claim_kind ?? "").toLowerCase() === "fact");
  if (!factClaims.length) {
    return { outcome: "no_fact_claims", unmatchedFactClaims: [], factTotal: 0 };
  }
  const unmatchedFactClaims = factClaims.filter((c) => !spanPresent(c.source_span, normalized));
  if (!unmatchedFactClaims.length) {
    return { outcome: "re_grounded", unmatchedFactClaims: [], factTotal: factClaims.length };
  }
  return { outcome: "needs_supersede", unmatchedFactClaims, factTotal: factClaims.length };
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
      return `all ${plan.factTotal} FACT span(s) still verify against the item's newest stored capture (zero-fetch re-check).`;
    case "needs_supersede":
      return `${plan.unmatchedFactClaims.length} of ${plan.factTotal} FACT span(s) no longer verify against the newest stored capture; would supersede through claim_versions (supersede_reason 'changed').`;
    default:
      return "unrecognized outcome";
  }
}

/** Pure: the FINAL (apply-mode) resolution_note once superseding has run and the item's post-write
 *  provenance_status is known. Only called for the 'needs_supersede' plans. */
export function buildAppliedSupersedeNote(plan, provenanceStatusAfter) {
  const n = plan.unmatchedFactClaims.length;
  if (provenanceStatusAfter === "quarantined") {
    return `${n} FACT claim(s) superseded (span no longer present in the newest stored capture); the item ` +
      "quarantined under the provenance gate -- now an open Family 1 investigation, resolver regen-quarantined.mjs.";
  }
  return `${n} FACT claim(s) superseded (span no longer present in the newest stored capture); the item's ` +
    "other claims still meet the provenance criteria (re-grounded).";
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

  for (const [itemId, flagsForItem] of byItem) {
    const claims = await deps.readClaims(itemId);
    const captures = await deps.readCaptures(itemId);
    const bestCapture = pickBestCapture(captures);
    const plan = planItemReground({ claims, bestCapture });

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
