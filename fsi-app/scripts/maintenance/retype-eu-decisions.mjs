#!/usr/bin/env node
// retype-eu-decisions.mjs -- MAINT step, task 5.5 of the brief-chain build plan (2026-09-11): retype the
// live CELEX 'D'-letter (Decision) intelligence_items rows from item_type='initiative' to
// item_type='regulation' WITHOUT dropping provenance_status='verified'.
//
// OPERATOR RULING (task 1.3, PR #633, already merged): a CELEX Decision is a binding act in its own
// right under Article 288 TFEU (it binds in its entirety on those to whom it is addressed, the same way
// a Regulation or Directive does), not an announcement. Regulations is the surface that carries binding
// acts on this platform. Task 1.3 already fixed `CELEX_SECTOR_LETTER_MAP`
// (scripts/mint/export-census-rows.mjs) so every NEW mint of a CELEX 'D'-letter key lands on
// item_type='regulation'. This step is the RETROACTIVE retype for the 351 rows minted BEFORE that fix
// that are still stuck on item_type='initiative'.
//
// WHY THE ORDER MATTERS [CONFIRMED, migration 114 read in full]: `set_provenance_status_trg` re-runs
// `validate_item_provenance` on ANY UPDATE to `intelligence_items`, and criterion 5 checks, for the NEW
// item_type, that every slot in `item_type_required_slots` is covered by >=1 section_claim_provenance
// row (FACT or GAP) whose claim_text contains the slot_key. `item-type-required-slots.json`:
// `regulation` requires effective_date, jurisdictional_scope, penalty_summary, primary_deadline;
// `initiative` requires none of the last three. All 351 candidate rows already carry effective_date (an
// `initiative` row minted via record-facts.mjs's EU_ACT_SLOT_KEYS additions, which attach effective_date
// to every eur-lex.europa.eu-sourced item regardless of item_type -- see that file's own header); none
// carry jurisdictional_scope / penalty_summary / primary_deadline, because `initiative`'s own required
// slots are the market-signal shape (action_now/conversion_trigger/driving_parties/signal_event/
// corridor_identity), never these three. A bare `item_type='regulation'` UPDATE with no prior claim work
// would therefore quarantine all 351 in the same statement that retypes them. This script inserts the
// three missing slots' FACT-or-GAP claims FIRST, so criterion 5 already clears by the time the retype
// UPDATE fires.
//
// INTERIM-TRIGGER RISK, STEP 1 FIRES WHILE THE ITEM IS STILL 'initiative' [HYPOTHESIS, reviewed
// 2026-09-12, coordinator fix round 1]. Migration 115 puts `WHEN (pg_trigger_depth() = 0)` ONLY on
// `set_provenance_status_trg` (the `intelligence_items` trigger, guarding its own self-UPDATE against
// recursion). `set_provenance_status_sections_trg` (`intelligence_item_sections`) and
// `set_provenance_status_claims_trg` (`section_claim_provenance`) carry NO depth guard at all -- every
// claim/section INSERT this script's step 1 makes fires `validate_item_provenance(item_id)` immediately,
// evaluated against the item's item_type AT THAT INSTANT, which is still `initiative` (step 2's retype
// UPDATE has not run yet). Reasoned through against the LIVE function (read in full, including migrations
// 141/158/207 layered on top of the 114/119 version this file's own "WHY THE ORDER MATTERS" note above
// cites):
//   - Criterion 5 (required slots) queries `item_type_required_slots WHERE item_type = v_item.item_type`
//     -- while still `initiative`, that is initiative's OWN five slots (action_now / conversion_trigger /
//     driving_parties / signal_event / corridor_identity), NEVER the three this script is adding. Adding
//     extra, non-required claims cannot make an already-covered set of five slots uncovered, so criterion
//     5 does not fail during the interim state PROVIDED the item is currently `verified` (i.e. those five
//     were already covered before this script ever touches it -- true by this script's own selection,
//     which only reads `provenance_status`-agnostic `is_archived=false` `initiative` rows, not filtered to
//     `verified` -- see the open question below).
//   - Criterion 3's authority floor (migration 141's `v_floor_max`, migration 158's `v_floor_armed`,
//     migration 207's `c_own_body_types` own-authoring-body extension): `initiative` is IN
//     `c_own_body_types := ARRAY['standard','framework','initiative']`, so a FACT claim whose `source_id`
//     shares the item's own source's `institution_id` (true for every claim this script inserts --
//     `source_id: item.source_id`) grounds at floor 4, not the exempt (NULL) default `v_floor_max` for
//     initiative. The floor is only ARMED at all, for a non-reg-family item_type, when the item's
//     `priority` is CRITICAL/HIGH (`v_floor_armed`); it becomes UNCONDITIONALLY armed only once step 2's
//     retype makes the item_type `regulation` (migration 158's reg-family-always-armed clause), at floor
//     max 2. Criterion 3 in the LIVE function derives the tier LIVE from `sources` via `scp.source_id`
//     (`COALESCE(tier_override, base_tier)`), NOT from the `source_tier_at_grounding` column this script
//     stamps null on (matching provenance-heal.mjs's own STEP 3 SLOTS precedent, which never reads
//     `source_tier_at_grounding` back either) -- so a null `source_tier_at_grounding` is not itself the
//     risk; the risk, if any, is whether the item's OWN registered source sits above the applicable floor
//     (2 post-retype) for a CELEX/EUR-Lex primary source, which this repo's source-credibility-model
//     generally puts at tier 1. NOT independently re-verified per item by this script.
//   - Criterion 4's unlabeled-assertion scan is section_row_id-scoped and exempts a section the moment ANY
//     FACT claim exists for that section_row_id; the item's own pre-existing effective_date FACT already
//     occupies the `record_facts` section_row_id this script appends to (per the brief: "all 351 already
//     carry effective_date"), so this exemption should already hold independent of the order this script
//     itself introduces.
// NONE of this is proven against a live row -- it is read from the code, plausible, and NOT yet verified
// against a real `validate_item_provenance` call. The interim-trigger probe below is the coordinator's own
// mechanism to confirm it (or refute it) against one real item before any real `--mode apply` dispatch:
// see `docs/plans/brief-chain-build-plan-2026-09-11.md`'s task 5.5 report, "Interim-trigger probe
// (coordinator runs it)" -- a ROLLBACK-ONLY `DO $$ ... $$` block this script's author does NOT run.
//
// PER-ITEM ORDER (brief-mandated, load-bearing):
//   1. Insert FACT-or-GAP claims for primary_deadline / jurisdictional_scope / penalty_summary onto the
//      item's record_facts section, extracted from the item's own stored pool text (the largest usable
//      `agent_run_searches` capture -- ADR-016, never a fresh fetch: this step is $0, no-network,
//      no-LLM). A GAP is emitted ONLY when the captured text itself is silent on that slot -- never a
//      fabricated FACT.
//   2. Update item_type='regulation', format_type='regulatory_fact_document', and (only when the
//      re-extracted title is a verbatim substring of the pool text) the title.
//   3. Read back provenance_status; report every item that did not stay 'verified'.
//   4. Queue the item for the population flywheel (ids entry point -- see the header note below on why
//      this resolves lazily).
//
// REUSE, NOT RE-DERIVATION (reuse-before-construction):
//   - `src/lib/intake/record-facts.mjs`'s `buildRecordSlotClaim` (exported by this task) + `extractSlotFact`
//     -- the SAME per-slot routing / verbatim-span extraction a fresh mint uses.
//   - `scripts/mint/heal-provenance.mjs`'s `loadRequiredSlots`, `claimCoversSlot`, `missingRequiredSlots`,
//     `bestCaptureText`, `findSearchIdForSpan` -- the SAME "which slot is already covered", "which capture
//     is usable" (ADR-016: >200 trimmed chars), and "which capture id does this span belong to" logic
//     provenance-heal.mjs's own STEP 3 SLOTS already uses for an identical claim-insertion shape (row
//     shape mirrored exactly: section_row_id / source_id / search_result_id / source_tier_at_grounding).
//   - `scripts/mint/export-census-rows.mjs`'s `classifyItemTypeFromCelexKey` (task 1.3's own corrected
//     CELEX_SECTOR_LETTER_MAP) to IDENTIFY the retype population -- a currently-`initiative` row whose
//     canonical_instrument_key's sector/letter the CURRENT (fixed) map resolves to `regulation` is exactly
//     the class task 1.3 fixed going forward. No second CELEX-letter table is authored here.
//   - `scripts/mint/export-census-rows.mjs`'s `buildTitleForRow` (task 1.3) for the OJ-act-title
//     re-extraction -- applied only when the result is verbatim in the stored pool text (never invented).
//
// THE FLYWHEEL QUEUE STEP (brief note): `run-population-flywheel.mjs`'s new export
// `runUnscopedFlywheelSteps(mode, batchIds, db)` (task 3.4) is NOT yet on master -- Part 3 is in review on
// a separate lane. `queueFlywheelStep` below resolves it LAZILY via a dynamic import (the SAME
// "module not present on this branch" pattern task 3.4's own `importLinkItemEntities` uses for Part 1's
// then-unmerged `link-item-entities.mjs`): a missing export, or an import failure, is reported as the
// named skip outcome `FLYWHEEL_NOT_PRESENT`, never a thrown error. Both branches (present / absent) are
// exercised in this file's own test via an injectable `importFlywheel`.
//
// NO DATABASE WRITES IN THIS TASK'S OWN TESTING. This file is dry by default (`--mode dry`, the default);
// `--execute`/`--mode apply` writes through the guarded path (scripts/lib/db.mjs, rule 015) exactly like
// every other MAINT wrapper. The coordinator dispatches dry, reads the report, then apply, via
// `.github/workflows/maintenance.yml`.
import { readAll, guardedInsert, guardedUpdate } from "../lib/db.mjs";
import { buildRecordSlotClaim } from "../../src/lib/intake/record-facts.mjs";
import { classifyItemTypeFromCelexKey, buildTitleForRow } from "../mint/export-census-rows.mjs";
import {
  loadRequiredSlots,
  claimCoversSlot,
  missingRequiredSlots,
  bestCaptureText,
  findSearchIdForSpan,
} from "../mint/heal-provenance.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const OLD_ITEM_TYPE = "initiative";
export const NEW_ITEM_TYPE = "regulation";
export const NEW_FORMAT_TYPE = "regulatory_fact_document";

// The three slots `regulation` requires that `initiative` does not (see this file's header). Named
// explicitly, never derived from a diff of the two item_types' required-slots lists -- this script's own
// scope is exactly these three, per the brief's own enumeration (effective_date is excluded: all 351
// candidates already carry it, and a genuinely-missing effective_date is a different defect class this
// script reports, never silently patches -- see `planItemRetype`'s `unhandledMissingSlots`).
export const SLOTS_TO_ADD = Object.freeze(["primary_deadline", "jurisdictional_scope", "penalty_summary"]);

export const CITE = Object.freeze({
  skill: "brief-chain-build-plan-2026-09-11 task 5.5",
  reason:
    "Retype the live CELEX 'D'-letter (Decision) intelligence_items rows from item_type='initiative' to " +
    "item_type='regulation' (task 1.3, PR #633: a CELEX Decision is a binding act under Article 288 TFEU, " +
    "the same as a Regulation/Directive; Regulations is the surface that carries binding acts). Inserts " +
    "FACT-or-GAP claims for the three slots regulation requires that initiative does not " +
    "(primary_deadline, jurisdictional_scope, penalty_summary) BEFORE the retype, so criterion 5 of " +
    "validate_item_provenance does not quarantine the row on its own retype UPDATE (all candidates " +
    "already carry effective_date). Claims are extracted via record-facts.mjs's buildRecordSlotClaim / " +
    "extractSlotFact -- the SAME extractors a fresh mint uses -- from the item's own stored pool text, " +
    "never a fresh fetch. Title is only ever updated to a re-extraction that is a verbatim substring of " +
    "that same pool text.",
});

export const FLYWHEEL_NOT_PRESENT = "flywheel: ids entry point not present on this branch";

const ITEM_COLUMNS =
  "id, title, item_type, format_type, source_id, source_url, canonical_instrument_key, provenance_status, is_archived";

// ---------------------------------------------------------------------------------------------------
// Pure decision logic (unit-tested with no I/O).
// ---------------------------------------------------------------------------------------------------

/** True when `item` is currently `initiative` AND its canonical_instrument_key's CELEX sector/letter
 *  resolves, under the CURRENT (task-1.3-corrected) CELEX_SECTOR_LETTER_MAP, to `regulation` -- exactly
 *  the class task 1.3 fixed going forward for a fresh mint. Reuses classifyItemTypeFromCelexKey rather
 *  than re-deriving the letter map (reuse-before-construction). Pure. */
export function isRetypeCandidate(item) {
  if (!item || item.item_type !== OLD_ITEM_TYPE) return false;
  const { itemType, hold } = classifyItemTypeFromCelexKey(item.canonical_instrument_key);
  return hold === null && itemType === NEW_ITEM_TYPE;
}

/** Split a set of `initiative` rows into retype candidates and the rest (non-CELEX / non-D-letter
 *  initiatives -- reported, never touched by this script). Pure. */
export function partitionInitiativeRows(rows) {
  const candidates = [];
  const nonCelex = [];
  for (const row of rows ?? []) {
    if (isRetypeCandidate(row)) candidates.push(row);
    else nonCelex.push(row);
  }
  return { candidates, nonCelex };
}

/**
 * Title re-extraction plan for one item, over its OWN stored pool text. Reuses `buildTitleForRow`
 * (task 1.3) with the SAME capture shape a fresh mint builds (`text`, `html: null` -- ADR-016: a stored
 * capture is always the stripped text, never raw HTML). Returns `{ newTitle, extractedTitle,
 * titleOrigin, verbatim }`. `newTitle` is non-null ONLY when the extraction is verbatim in `capturedText`
 * AND differs from `oldTitle` -- a fallback title (`buildTitleForRow`'s own "source_name_fallback", built
 * from the source's name/url, never the document's own text) is NEVER applied here, matching the "never
 * fabricate" rule: a title not actually stated by the source is not a re-extraction, it is invention.
 * Pure.
 */
export function planTitleUpdate({ oldTitle, capturedText, sourceUrl }) {
  if (typeof capturedText !== "string" || !capturedText.trim()) {
    return { newTitle: null, extractedTitle: null, titleOrigin: null, verbatim: false };
  }
  // allowBodyLeadFallback: false (task 5.5b) -- this is a RETITLE of a row that already has a title, never
  // a brand-new mint. buildTitleForRow's own bodyLeadTitle tier is an honest "best we have" for a title-less
  // new row, not an honest re-title here: it is a raw, un-extracted slice of the page lead, which task
  // 5.5b's own evidence shows is frequently page chrome (the old EUR-Lex breadcrumb, the new OJ header) --
  // exactly what produced all 369 wrong titles the pre-fix dry run proposed. With the flag false, this
  // returns a title only when extractOjActTitle itself found a real act heading (titleOrigin
  // "captured_body_act_title"), or falls straight to "source_name_fallback", already excluded below.
  const { title: extractedTitle, titleOrigin } = buildTitleForRow({
    capture: { text: capturedText, html: null, title: null, titleOrigin: null },
    source: { name: null, url: sourceUrl },
    identifier: null,
    allowBodyLeadFallback: false,
  });
  if (!extractedTitle || titleOrigin === "source_name_fallback") {
    return { newTitle: null, extractedTitle: extractedTitle ?? null, titleOrigin, verbatim: false };
  }
  const verbatim = capturedText.toLowerCase().includes(String(extractedTitle).toLowerCase());
  if (!verbatim || extractedTitle === oldTitle) {
    return { newTitle: null, extractedTitle, titleOrigin, verbatim };
  }
  return { newTitle: extractedTitle, extractedTitle, titleOrigin, verbatim: true };
}

/**
 * Full per-item plan: which of the three slots still need a claim, what claim `buildRecordSlotClaim`
 * would emit for each (FACT or honest GAP), the title-update decision, and the PREDICTED provenance
 * outcome (criterion-5-only -- see this file's header: retyping changes nothing else about the item's
 * existing claims, so this is the one gate the retype itself can move). `requiredSlotsMap` is injected
 * (item-type-required-slots.json's live shape, loaded by the caller via `loadRequiredSlots`) so this
 * stays a pure function over caller-supplied data, never a second copy of the JSON file's own contents.
 * Pure; no I/O.
 */
export function planItemRetype({ item, existingClaims, capturedText, requiredSlotsMap }) {
  const claimsSoFar = existingClaims ?? [];
  const missingBefore = missingRequiredSlots(NEW_ITEM_TYPE, claimsSoFar, requiredSlotsMap);
  const slotsToClaim = missingBefore.filter((s) => SLOTS_TO_ADD.includes(s));
  // A required slot missing OUTSIDE this script's own three-slot scope (e.g. a genuinely absent
  // effective_date) is a different defect class -- reported, never silently patched here.
  const unhandledMissingSlots = missingBefore.filter((s) => !SLOTS_TO_ADD.includes(s));

  const slotClaims = slotsToClaim.map((slotKey) => ({
    slotKey,
    claim: buildRecordSlotClaim(slotKey, { capturedText, sourceUrl: item.source_url }),
  }));

  const addedClaimStubs = slotClaims.map(({ claim }) => ({
    claim_kind: claim.claim_kind,
    claim_text: claim.claim_text,
  }));
  const missingAfter = missingRequiredSlots(NEW_ITEM_TYPE, [...claimsSoFar, ...addedClaimStubs], requiredSlotsMap);
  const predictedProvenance = missingAfter.length === 0 ? "verified" : "quarantined";

  const titlePlan = planTitleUpdate({ oldTitle: item.title, capturedText, sourceUrl: item.source_url });

  return {
    itemId: item.id,
    celexKey: item.canonical_instrument_key,
    oldTitle: item.title,
    newTitle: titlePlan.newTitle,
    extractedTitle: titlePlan.extractedTitle,
    titleVerbatim: titlePlan.verbatim,
    slotClaims,
    unhandledMissingSlots,
    predictedProvenance,
    missingAfter,
  };
}

/**
 * Fix round 1 (coordinator review, 2026-09-12): a crude, honest heuristic for "this title looks like it
 * was cut off mid-word" -- the offline proof against task 5.5's own dry-run artifact ran over TRUNCATED
 * (up to 300-char) lead text, so several of its sampled titles ended mid-word for a reason specific to
 * that artifact, not to the shipped extractor. This check runs against the item's REAL, untruncated
 * `capturedText` in the coordinator's own production dry run, where that artifact-truncation cause does
 * not apply -- a true positive here is a genuine extraction defect, not an artifact of the proof.
 * True when `title`'s last character is alphanumeric AND the character immediately following `title`'s
 * own text inside `capturedText` is itself a letter (i.e., the title stopped mid-token, not at a real
 * word boundary). Case-insensitive location (the title's own casing is never normalised -- see
 * `planTitleUpdate`). False when `title` cannot be located verbatim in `capturedText` (never guessed) or
 * when nothing follows it there (the title runs to the end of the captured text). Pure.
 */
export function looksLikeMidWordCut(title, capturedText) {
  if (!title || !capturedText) return false;
  const lastChar = title[title.length - 1];
  if (!/[A-Za-z0-9]/.test(lastChar)) return false;
  const idx = capturedText.toLowerCase().indexOf(title.toLowerCase());
  if (idx < 0) return false;
  const nextChar = capturedText[idx + title.length];
  return typeof nextChar === "string" && /[A-Za-z]/.test(nextChar);
}

/** True when `claim` (an already-inserted or about-to-be-inserted claim shape) covers `slotKey` --
 *  re-exported thin wrapper so this file's own test can assert coverage without importing
 *  heal-provenance.mjs directly (kept for report-shape clarity only; identical to claimCoversSlot). */
export { claimCoversSlot };

// ---------------------------------------------------------------------------------------------------
// Flywheel queue step -- lazy, named-skip resolution (see this file's header).
// ---------------------------------------------------------------------------------------------------

/**
 * Queue `batchIds` (the items this run actually retyped) for the population flywheel's unscoped steps
 * (analyze-corpus / derive-obligations / tag-proposals / tag-ratification -- task 3.4's own naming).
 * `importFlywheel` is injectable (defaults to the real dynamic import of run-population-flywheel.mjs) so
 * this file's own test exercises BOTH branches: the export absent (this branch, today, on master) and
 * present (once Part 3 merges) -- without needing two different live branch states. Never throws: an
 * import failure OR a missing export both resolve to the SAME named skip, `FLYWHEEL_NOT_PRESENT`.
 */
export async function queueFlywheelStep(
  batchIds,
  { mode = "dry", db = null, importFlywheel = () => import("../turns/run-population-flywheel.mjs") } = {},
) {
  if (!batchIds || !batchIds.length) {
    return { outcome: "skipped", reason: "no_items_retyped" };
  }
  let mod;
  try {
    mod = await importFlywheel();
  } catch (e) {
    return { outcome: "skipped", reason: FLYWHEEL_NOT_PRESENT, detail: e instanceof Error ? e.message : String(e) };
  }
  if (typeof mod?.runUnscopedFlywheelSteps !== "function") {
    return { outcome: "skipped", reason: FLYWHEEL_NOT_PRESENT };
  }
  if (mode !== "apply") {
    return { outcome: "would_queue", ids: batchIds };
  }
  const result = await mod.runUnscopedFlywheelSteps(mode, batchIds, db);
  return { outcome: "queued", ids: batchIds, result };
}

// ---------------------------------------------------------------------------------------------------
// --limit / --after-id -- the same bounded/resumable idiom every sibling MAINT wrapper parses locally
// (backfill-format-type.mjs's own header: "no other MAINT wrapper needs pagination flags of its own, so
// they are parsed here rather than widening a shared parser for one caller").
// ---------------------------------------------------------------------------------------------------
export function parseBatchArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const limitRaw = get("--limit");
  const limitNum = limitRaw !== undefined ? Number(limitRaw) : undefined;
  return {
    limit: Number.isFinite(limitNum) && limitNum > 0 ? limitNum : undefined,
    afterId: get("--after-id"),
  };
}

// ---------------------------------------------------------------------------------------------------
// Per-item I/O executor. Order is load-bearing (see this file's header): (1) claims, (2) retype UPDATE,
// (3) read-back, (4) caller queues the flywheel once for the whole applied batch.
// ---------------------------------------------------------------------------------------------------

export async function applyOneItem(item, { apply, deps, requiredSlotsMap }) {
  const report = { id: item.id, celex: item.canonical_instrument_key, old_title: item.title };

  const captures = await deps.readCaptures(item.id);
  const capturedText = bestCaptureText(captures);
  if (!capturedText) {
    report.outcome = "held_no_usable_capture";
    return report;
  }

  const existingClaims = await deps.readClaims(item.id);
  const plan = planItemRetype({ item, existingClaims, capturedText, requiredSlotsMap });

  report.new_title = plan.newTitle ?? item.title;
  report.title_changed = plan.newTitle != null;
  // Fix round 1: per-item visibility for the coordinator's production dry run (the offline proof ran over
  // the task 5.5 artifact's own truncated lead text, not real capturedText -- see the report's own
  // limitation note and looksLikeMidWordCut's header). title_source names WHY the title is what it is,
  // never left implicit in title_changed alone.
  report.title_source = report.title_changed ? "act_heading" : "kept";
  report.new_title_length = report.new_title.length;
  report.title_ends_mid_word = report.title_changed ? looksLikeMidWordCut(report.new_title, capturedText) : false;
  report.slots = plan.slotClaims.map((s) => ({ slot_key: s.slotKey, claim_kind: s.claim.claim_kind }));
  report.unhandled_missing_slots = plan.unhandledMissingSlots;
  report.predicted_provenance = plan.predictedProvenance;

  if (!apply) {
    report.outcome = "would_apply";
    return report;
  }

  // 1. record_facts claims (FACT-or-GAP), one per still-missing slot in SLOTS_TO_ADD.
  if (plan.slotClaims.length) {
    const sections = await deps.readSections(item.id);
    let sectionId = sections.find((s) => s.section_key === "record_facts")?.id ?? null;
    if (!sectionId) {
      const order = sections.length ? Math.max(...sections.map((s) => s.section_order ?? 0)) + 1 : 2;
      const ins = await deps.insertSection({ item_id: item.id, section_key: "record_facts", section_order: order, content_md: "" });
      sectionId = ins.id;
      sections.push({ id: sectionId, item_id: item.id, section_key: "record_facts", section_order: order, content_md: "" });
    }
    const appendLines = [];
    for (const { claim } of plan.slotClaims) {
      const isFact = claim.claim_kind === "FACT";
      const row = {
        section_row_id: sectionId,
        intelligence_item_id: item.id,
        claim_text: claim.claim_text,
        claim_kind: claim.claim_kind,
        source_span: claim.source_span ?? null,
        source_id: isFact ? (item.source_id ?? null) : null,
        search_result_id: isFact ? findSearchIdForSpan(claim.source_span, captures) : null,
        // Mirrors provenance-heal.mjs's own STEP 3 SLOTS row shape exactly: ITEM_COLUMNS carries no
        // source_tier there either (criterion 3's tier floor applies only to CRITICAL/HIGH-priority
        // items; a MODERATE/LOW item's FACT claims are unaffected by a null tier stamp here).
        source_tier_at_grounding: isFact ? (item.source_tier ?? null) : null,
      };
      await deps.insertClaim(row);
      appendLines.push(claim.claim_text);
    }
    if (appendLines.length) {
      const sec = sections.find((s) => s.id === sectionId);
      const newContent = [sec?.content_md ?? "", ...appendLines].filter(Boolean).join("\n");
      await deps.updateSectionContent(sectionId, newContent);
    }
  }

  // 2. the retype UPDATE (item_type + format_type, and title only when verbatim-re-extracted).
  const patch = { item_type: NEW_ITEM_TYPE, format_type: NEW_FORMAT_TYPE };
  if (plan.newTitle) patch.title = plan.newTitle;
  await deps.updateItem(item.id, patch);

  // 3. read back provenance_status -- report every item that did not stay verified.
  const status = await deps.readProvenanceStatus(item.id);
  report.provenance_status_after = status;
  report.stayed_verified = status === "verified";
  report.outcome = "applied";
  return report;
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

export async function main({ mode = "dry", limit, afterId } = {}, deps) {
  const apply = mode === "apply";
  const requiredSlotsMap = deps.requiredSlotsMap ?? loadRequiredSlots();

  const initiativeRows = await deps.readInitiativeRows();
  const marketSignalRows = await deps.readMarketSignalRows();
  const { candidates, nonCelex } = partitionInitiativeRows(initiativeRows);

  const sorted = [...candidates].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  let page = sorted;
  if (afterId) {
    const idx = page.findIndex((r) => r.id === afterId);
    page = idx >= 0 ? page.slice(idx + 1) : page;
  }
  if (typeof limit === "number" && limit > 0) page = page.slice(0, limit);

  const perItem = [];
  const appliedIds = [];
  const notVerified = [];
  let stayedVerifiedCount = 0;
  let heldNoCapture = 0;
  // Fix round 1: titled per this run's own decision (title_source present -- a held item never reached
  // one). titles_over_350 / titles_ending_mid_word are scoped to EXTRACTED titles only (title_source ===
  // "act_heading") -- a "kept" item's title is the item's pre-existing stored title, not this run's own
  // extraction, so it is not a signal about extraction quality.
  let titlesExtracted = 0;
  let titlesKept = 0;
  let titlesOver350 = 0;
  let titlesEndingMidWord = 0;

  for (const item of page) {
    const r = await applyOneItem(item, { apply, deps, requiredSlotsMap });
    perItem.push(r);
    if (r.outcome === "applied") {
      appliedIds.push(item.id);
      if (r.stayed_verified) stayedVerifiedCount += 1;
      else notVerified.push({ id: item.id, celex: r.celex, provenance_status: r.provenance_status_after });
    } else if (r.outcome === "held_no_usable_capture") {
      heldNoCapture += 1;
    }
    if (r.title_source === "act_heading") {
      titlesExtracted += 1;
      if (r.new_title_length > 350) titlesOver350 += 1;
      if (r.title_ends_mid_word) titlesEndingMidWord += 1;
    } else if (r.title_source === "kept") {
      titlesKept += 1;
    }
  }

  const flywheel = await deps.queueFlywheel(appliedIds, { mode, db: deps.db ?? null });

  const summary = {
    step: "retype-eu-decisions",
    mode,
    counts: {
      initiative_rows_scanned: initiativeRows.length,
      eu_decision_candidates: candidates.length,
      non_celex_initiatives: nonCelex.length,
      market_signals: marketSignalRows.length,
      page_size: page.length,
      applied: appliedIds.length,
      held_no_usable_capture: heldNoCapture,
      stayed_verified: stayedVerifiedCount,
      not_verified: notVerified.length,
      titles_extracted: titlesExtracted,
      titles_kept: titlesKept,
      titles_over_350: titlesOver350,
      titles_ending_mid_word: titlesEndingMidWord,
    },
    applied: appliedIds.length,
    per_item: perItem,
    not_verified: notVerified,
    non_celex_initiatives: nonCelex.map((r) => ({ id: r.id, celex: r.canonical_instrument_key, title: r.title })),
    market_signals: marketSignalRows.map((r) => ({ id: r.id, celex: r.canonical_instrument_key, title: r.title })),
    flywheel,
    read_back: {},
    exitCode: 0,
  };
  if (page.length) summary.last_id_processed = page[page.length - 1].id;

  if (apply) {
    const after = await deps.readAllRegulationStatuses();
    const byStatus = {};
    for (const r of after) byStatus[r.provenance_status] = (byStatus[r.provenance_status] ?? 0) + 1;
    summary.read_back = { regulation_total: after.length, by_provenance_status: byStatus };
  }

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  const { limit, afterId } = parseBatchArgs(process.argv.slice(2));
  await runCli({
    step: "retype-eu-decisions",
    main: (opts, cliDeps) => main({ ...opts, limit, afterId }, cliDeps),
    needsDb: true,
    buildDeps: async () => ({
      requiredSlotsMap: loadRequiredSlots(),
      readInitiativeRows: () => readAll("intelligence_items", ITEM_COLUMNS, {
        match: (q) => q.eq("item_type", OLD_ITEM_TYPE).eq("is_archived", false),
      }),
      readMarketSignalRows: () => readAll("intelligence_items", ITEM_COLUMNS, {
        match: (q) => q.eq("item_type", "market_signal").eq("is_archived", false),
      }),
      readCaptures: (itemId) => readAll("agent_run_searches", "id, result_url, result_content", {
        match: (q) => q.eq("intelligence_item_id", itemId),
      }),
      readClaims: (itemId) => readAll("section_claim_provenance", "id, claim_kind, claim_text", {
        match: (q) => q.eq("intelligence_item_id", itemId),
      }),
      readSections: (itemId) => readAll("intelligence_item_sections", "id, item_id, section_key, section_order, content_md", {
        match: (q) => q.eq("item_id", itemId),
      }),
      insertSection: async (row) => (await guardedInsert("intelligence_item_sections", row, { cite: CITE, select: "id" })).inserted,
      insertClaim: async (row) => (await guardedInsert("section_claim_provenance", row, { cite: CITE, select: "id" })).inserted,
      updateSectionContent: (id, content_md) => guardedUpdate("intelligence_item_sections", (q) => q.eq("id", id), { content_md }, { cite: CITE }),
      updateItem: (id, patch) => guardedUpdate("intelligence_items", (q) => q.eq("id", id), patch, { cite: CITE }),
      readProvenanceStatus: async (itemId) => {
        const rows = await readAll("intelligence_items", "provenance_status", { match: (q) => q.eq("id", itemId) });
        return rows[0]?.provenance_status ?? null;
      },
      readAllRegulationStatuses: () => readAll("intelligence_items", "provenance_status", {
        match: (q) => q.eq("item_type", NEW_ITEM_TYPE).eq("is_archived", false),
      }),
      queueFlywheel: (ids, opts) => queueFlywheelStep(ids, { mode: opts.mode }),
    }),
  });
}
