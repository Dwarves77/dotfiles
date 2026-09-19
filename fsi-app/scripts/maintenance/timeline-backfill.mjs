#!/usr/bin/env node
// SHARED-WRITER: integrity_flags
// timeline-backfill.mjs -- MAINT step for task 6.1c of the W9 brief-chain build plan (2026-09-11), under
// ADR-030 ("Items need to be resolved not quarantined... No item should be without some date in the
// timeline"). Corpus backfill for steps 2-6 of the task brief's ordered date-derivation waterfall (title
// date, Federal Register URL date path, legislation.gov.uk Made/Royal Assent/year-fallback, earliest
// forward event, dateline in the capture text). Step 1 (the brief-body timeline-section harvest) is NOT
// this script's job -- it stays scripts/backfill-item-timelines.mjs's own path
// (extractRegulationSections + buildTimelineRows, reused exactly as-is, never duplicated); the
// coordinator's own dispatch sequence runs THAT script first over the reg-family briefs carrying a
// timeline section, and this script covers what remains: every still-undated item, any item_type.
//
// SCOPE: is_archived=false AND no item_timelines row at all (never touches an item that already has a
// row). Writes AT MOST ONE row per item (steps 2-6 each yield exactly one candidate; the harvest's own
// "all rows it yields" multi-row case is the OTHER script's job, per the task brief's own parenthetical).
//
// THE DATE DERIVATION is src/lib/agent/timeline-backfill-derive.mjs's own deriveTimelineFromMetadata
// (steps 2-6, first hit wins, precision-honest labels, every attempt named). This file is the
// orchestration + I/O half only: read the undated set, read each item's own captures
// (agent_run_searches) and forward events (item_forward_events), call the pure derivation, and write
// through the guarded path (scripts/lib/db.mjs) on --mode apply.
//
// AN ITEM NOTHING DATES is REPORTED, never given an invented date and never given added_date (that is
// the ledger's date, not the instrument's) -- collected in this run's own summary AND, on apply, written
// as ONE integrity_flags row for the WHOLE run (category data_quality, subject_type system, subject_ref
// "timeline-backfill", the full id list carried in recommended_actions[0].ids so
// scripts/verify/population-report.mjs's own "timeline coverage" entry can read the reported/excluded set
// back out).
//
// D17 FAMILY 12 (defect-fix-plan-2026-09-12, ruling table row 12, lane L11): step 1-6 above are now
// followed by a SEVENTH, deterministic, last-resort step (timeline-backfill-derive.mjs's
// extractCapturedDate): an item with no derivable instrument date carries a `captured` timeline row dated
// at its stored capture's own searched_at (a real, dated event about the item -- when it was retrieved --
// never presented as the instrument's own date; labelled and sort-ordered LAST via
// CAPTURED_FALLBACK_SORT_ORDER). This step now REPORTS an undateable item only when it has NO usable
// stored capture at all; that residual set is written ALREADY RESOLVED (informational, ADR-030 rider: no
// open queue asks a person to act), and any PRIOR open "timeline-backfill" flag (from before this fix) is
// resolved with the count of how many of its named ids now carry a timeline row.
//
// D17 FAMILY 12 ADDENDUM (2026-09-13, lane L11b): the dry run on master still left 82 of the 211 undated
// items with NO stored capture at all -- step 7 above cannot help them. An EIGHTH, final, deterministic
// step (timeline-backfill-derive.mjs's extractRecordedDate) now runs when step 7 also misses: a `recorded`
// timeline row dated at the item's own intelligence_items.created_at (when the item was recorded IN THE
// LEDGER -- never presented as the instrument's own date; labelled and sort-ordered LAST of all, via
// RECORDED_FALLBACK_SORT_ORDER, so it never outranks a real derived milestone or even the captured
// fallback). Since intelligence_items.created_at is populated on every live row, this step reduces the
// genuinely-undateable set to structurally near zero (only an item with no capture AND an unparseable/
// missing created_at would still land there); the flag machinery above is left in place for that residual,
// never removed, because "near zero" is not "provably zero" for a corpus this size.
//
// BOUNDED AND RESUMABLE: --limit / --after-id, the same idiom backfill-format-type.mjs and
// retype-eu-decisions.mjs already use (parsed locally -- no other MAINT wrapper needs pagination flags of
// its own, per backfill-format-type.mjs's own header note). Dry by default; --mode apply writes through
// scripts/lib/db.mjs's guarded path (cite + snapshot + read-back).
import { readAll, guardedInsert, guardedUpdate, hostOf } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { recordItemChange as recordItemChangeCore } from "../lib/changelog.mjs";
import {
  deriveTimelineFromMetadata,
  finalizeTimelineRow,
  pickBestCapture,
  CAPTURED_FALLBACK_SORT_ORDER,
  RECORDED_FALLBACK_SORT_ORDER,
} from "../../src/lib/agent/timeline-backfill-derive.mjs";

export const CITE = Object.freeze({
  skill: "brief-chain-build-plan-2026-09-11 task 6.1c",
  reason:
    "Corpus backfill of ADR-030 ('every item carries a timeline date'), steps 2-6 of the task brief's " +
    "ordered derivation (title date / Federal Register URL date path / legislation.gov.uk Made-or-Royal-" +
    "Assent-or-year-fallback / earliest forward event / dateline in the capture text), first hit wins, " +
    "never fabricating a day/month a source did not state. Writes at most one item_timelines row per " +
    "undated item and never touches an item that already has one; an item nothing dates is reported, " +
    "never given an invented date or the ledger's own added_date.",
});

export const CHANGELOG_CITE = Object.freeze({
  skill: "defect-fix-plan-2026-09-12.md D23(a)",
  reason:
    "A backfilled timeline is a customer-visible change (D23) - recorded via the shared " +
    "scripts/lib/changelog.mjs helper, idempotent per (item, field, batch='timeline-backfill').",
});

export const UNDATEABLE_FLAG_CITE = Object.freeze({
  category: "data_quality",
  subject_type: "system",
  subject_ref: "timeline-backfill",
  created_by: "timeline-backfill",
});

const ITEM_COLUMNS = "id, title, item_type, source_url, instrument_identifier, canonical_instrument_key, created_at";

// ---------------------------------------------------------------------------------------------------
// Pure planning (unit-tested with no I/O): one item's derivation outcome from data the caller already
// read. Delegates the actual date logic entirely to timeline-backfill-derive.mjs -- no second copy of
// the waterfall here.
// ---------------------------------------------------------------------------------------------------

/**
 * @param {{ item: {id:string, title?:string|null, source_url?:string|null, instrument_identifier?:string|null, canonical_instrument_key?:string|null, created_at?:string|null}, capturedText: string|null, bestCapture?: {searched_at?: string|null}|null, forwardEvents: Array<object>, todayIso: string }} input
 * @returns {{ id: string, step: string, row: object|null, attempts?: Array<object> }}
 */
export function planTimelineBackfillItem({ item, capturedText, bestCapture, forwardEvents, todayIso }) {
  const { result, attempts } = deriveTimelineFromMetadata({
    title: item.title,
    sourceUrl: item.source_url,
    capturedText,
    identifier: item.instrument_identifier ?? item.canonical_instrument_key ?? null,
    forwardEvents,
    bestCapture,
    createdAt: item.created_at ?? null,
  });
  if (!result) {
    return { id: item.id, step: "undateable", row: null, attempts };
  }
  // Step 7 (D17 family 12) and step 8 (D17 family 12 addendum, 2026-09-13) rows are deliberately ordered
  // LAST so neither ever outranks a real derived milestone; every other step keeps sort_order 0 (this
  // script writes at most one row per item, so 0 vs 999/1000 is the only ordering that ever matters here
  // -- see each constant's own header for why it still matters against a FUTURE row).
  const sortOrder =
    result.source === "captured" ? CAPTURED_FALLBACK_SORT_ORDER
    : result.source === "recorded" ? RECORDED_FALLBACK_SORT_ORDER
    : 0;
  const row = finalizeTimelineRow(result, todayIso, sortOrder);
  return { id: item.id, step: result.source, row, attempts };
}

/**
 * Pure: which live items (from `liveItems`) have NO row in `timelineItemIds` (item_timelines.item_id
 * values already on record). Order-preserving, then id-sorted for deterministic --after-id resume.
 * @param {Array<{id:string}>} liveItems
 * @param {Array<string>} timelineItemIds
 * @returns {Array<object>}
 */
export function partitionUndated(liveItems, timelineItemIds) {
  const dated = new Set(timelineItemIds ?? []);
  return (liveItems ?? [])
    .filter((it) => it && it.id && !dated.has(it.id))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * Pure: the human-readable integrity_flags description for the run's undateable set (never invented --
 * every host/id named comes from the caller's own list). Capped host list for readability; the FULL id
 * list travels in recommended_actions[0].ids, not in this prose.
 *
 * D17 family 12 (defect-fix-plan-2026-09-12) and its 2026-09-13 addendum: with step 7 (the captured-date
 * fallback) and step 8 (the recorded-date fallback, dated at intelligence_items.created_at) both live, an
 * item only reaches this set when it carries NO usable stored capture at all AND has no parseable
 * created_at either -- a genuinely rare, near-structurally-impossible condition (created_at is populated
 * on every live row) rather than the broader pre-fix "no deterministic date source" description named.
 * The wording is updated to say so honestly.
 * @param {Array<{id:string, title?:string|null, host?:string|null}>} items
 * @returns {string}
 */
export function buildUndateableFlagDescription(items) {
  const hosts = [...new Set((items ?? []).map((i) => i.host).filter(Boolean))];
  const hostSample = hosts.slice(0, 10).join(", ");
  const hostNote = hosts.length > 10 ? `${hostSample}, and ${hosts.length - 10} more` : hostSample;
  return (
    `timeline-backfill: ${items.length} item(s) carry no usable stored capture at all AND no parseable ` +
    "intelligence_items.created_at (no title date, Federal Register date path, legislation.gov.uk line, " +
    "forward event, dateline, captured-date fallback, or recorded-date fallback -- steps 7 and 8 both " +
    `need data this item does not have). Hosts: ${hostNote || "(none resolvable)"}. Full id list in this ` +
    "flag's recommended_actions[0].ids."
  );
}

/**
 * Builds the integrity_flags row for the run's undateable set. D17 family 12 (defect-fix-plan-2026-09-12):
 * this is no longer an OPEN ask for a person to do manual research -- ADR-030 rider forbids a queue that
 * requires a human click to resolve, and there is nothing derivable here for a person to look up that a
 * later capture pass would not also resolve mechanically. Written ALREADY RESOLVED, informational only,
 * the same "record stays, queue empties" posture close-run-logs.mjs and analyze-corpus.mjs's coverage
 * reflections use. Pure.
 * @param {Array<{id:string, title?:string|null, host?:string|null}>} items
 * @returns {object}
 */
export function buildUndateableFlagRow(items) {
  const nowIso = new Date().toISOString();
  return {
    ...UNDATEABLE_FLAG_CITE,
    description: buildUndateableFlagDescription(items),
    recommended_actions: [
      {
        action: "no_capture_to_derive_from",
        rationale:
          "no stored capture exists for the step-7 captured-date fallback, and no parseable " +
          "intelligence_items.created_at exists for the step-8 recorded-date fallback either; " +
          "informational only (ADR-030 rider: no open queue asks a person to act) -- the item is dated " +
          "automatically once a real capture pass (acquire-primaries' successor paths, provenance-heal) " +
          "or a created_at repair gives it one.",
        ids: items.map((i) => i.id),
      },
    ],
    status: "resolved",
    resolved_at: nowIso,
    resolved_by: "timeline-backfill",
    resolution_note:
      "no derivable capture and no parseable created_at; informational record, not a manual-research ask " +
      "(D17 family 12 and its 2026-09-13 addendum)",
  };
}

// ---------------------------------------------------------------------------------------------------
// Resolving a PRIOR run's open undateable flag (D17 family 12). Before this fix, timeline-backfill.mjs
// wrote a fresh OPEN flag naming a "manual_research_or_source_review" ask every apply run; step 7 now
// dates almost every one of those ids automatically on the very next run (their item_timelines row is
// simply the normal `written` outcome above -- no second mechanism). An open flag from before this fix
// is resolved here with the count: how many of its named ids now carry a timeline row, and how many
// (genuinely no stored capture at all) still do not.
// ---------------------------------------------------------------------------------------------------

/** Pure: the ids named in one open flag row's recommended_actions[].ids (never guesses beyond what the
 *  row itself carries). @param {{recommended_actions?: Array<{ids?: string[]}>}} row @returns {string[]} */
export function idsFromUndateableFlagRow(row) {
  const ids = new Set();
  for (const action of Array.isArray(row?.recommended_actions) ? row.recommended_actions : []) {
    if (!Array.isArray(action?.ids)) continue;
    for (const id of action.ids) if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

/**
 * Pure: for each prior open flag row, split its named ids into now-dated (a timeline row exists for
 * them, from any source -- step 7 or a real derivation) vs still-undateable (no capture at all, even
 * after this run). `datedIds` is the caller's own union of item_timelines.item_id after this run's
 * writes. Never mutates; the caller applies the resolution.
 * @param {Array<{id:string, recommended_actions?: Array<{ids?: string[]}>}>} openFlagRows
 * @param {Set<string>|string[]} datedIds
 * @returns {Array<{id:string, total:number, now_dated:number, still_undateable:number, still_undateable_ids:string[]}>}
 */
export function planUndateableFlagResolution(openFlagRows, datedIds) {
  const dated = datedIds instanceof Set ? datedIds : new Set(datedIds ?? []);
  return (openFlagRows ?? []).map((row) => {
    const ids = idsFromUndateableFlagRow(row);
    const stillUndateable = ids.filter((id) => !dated.has(id));
    return {
      id: row.id,
      total: ids.length,
      now_dated: ids.length - stillUndateable.length,
      still_undateable: stillUndateable.length,
      still_undateable_ids: stillUndateable,
    };
  });
}

/** Pure: the resolution_note for one prior flag's resolution plan entry. */
export function buildUndateableFlagResolutionNote(plan) {
  return (
    "D17 family 12 (defect-fix-plan-2026-09-12) and its 2026-09-13 addendum: step 7 (captured-date " +
    `fallback) and step 8 (recorded-date fallback) now date ${plan.now_dated} of the ${plan.total} ` +
    `previously-undateable item(s) named in this flag; ${plan.still_undateable} remain genuinely ` +
    "undateable (no stored capture and no parseable created_at) -- carried forward in the fresh " +
    "undateable flag, if any."
  );
}

// ---------------------------------------------------------------------------------------------------
// --limit / --after-id -- the same bounded/resumable idiom every sibling MAINT wrapper parses locally.
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
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

const SAMPLE_PER_STEP = 20;

export async function main({ mode = "dry", limit, afterId } = {}, deps) {
  const apply = mode === "apply";
  const todayIso = deps.todayIso ?? new Date().toISOString().slice(0, 10);

  const liveItems = await deps.readLiveItems();
  const timelineItemIds = await deps.readTimelineItemIds();
  const undated = partitionUndated(liveItems, timelineItemIds);

  let page = undated;
  if (afterId) {
    const idx = page.findIndex((r) => r.id === afterId);
    page = idx >= 0 ? page.slice(idx + 1) : page;
  }
  if (typeof limit === "number" && limit > 0) page = page.slice(0, limit);

  const byStep = {};
  const sampleByStep = {};
  const undateableItems = [];
  const writtenIds = [];
  let written = 0;

  for (const item of page) {
    const captures = await deps.readCaptures(item.id);
    const bestCapture = pickBestCapture(captures);
    const capturedText = bestCapture?.result_content ?? null;
    const forwardEvents = await deps.readForwardEvents(item.id);
    const plan = planTimelineBackfillItem({ item, capturedText, bestCapture, forwardEvents, todayIso });

    byStep[plan.step] = (byStep[plan.step] ?? 0) + 1;
    if (!sampleByStep[plan.step]) sampleByStep[plan.step] = [];

    if (plan.step === "undateable") {
      const entry = { id: item.id, title: item.title ?? null, host: deps.hostOf(item.source_url) };
      undateableItems.push(entry);
      if (sampleByStep[plan.step].length < SAMPLE_PER_STEP) sampleByStep[plan.step].push(entry);
      continue;
    }

    if (sampleByStep[plan.step].length < SAMPLE_PER_STEP) {
      sampleByStep[plan.step].push({ id: item.id, date: plan.row.milestone_date, label: plan.row.label });
    }
    written += 1;
    writtenIds.push(item.id);
    if (apply) {
      await deps.insertTimelineRow({ ...plan.row, item_id: item.id });
      // D23(a) (defect-fix-plan-2026-09-12.md): a backfilled timeline is also a customer-visible
      // change - recorded the same way a regenerated brief is, through the shared
      // scripts/lib/changelog.mjs helper (wired in deps.recordItemChange, below). Best-effort: a
      // changelog failure must never cost the item its real, already-written timeline row.
      try {
        await deps.recordItemChange({
          itemId: item.id,
          field: "timeline",
          batch: "timeline-backfill",
          note: `Timeline entry added via timeline-backfill (${plan.step}) dated ${plan.row.milestone_date}.`,
        });
      } catch {
        /* best-effort, same posture as every other non-gating write in this run */
      }
    }
  }

  let flagWritten = null;
  if (apply && undateableItems.length) {
    flagWritten = await deps.writeUndateableFlag(undateableItems);
  }

  // D17 family 12 (defect-fix-plan-2026-09-12): resolve any PRIOR open undateable flag (written before
  // this fix, back when the whole undateable set got an OPEN "manual research" ask). Step 7 dates almost
  // all of those ids automatically now -- see idsFromUndateableFlagRow/planUndateableFlagResolution above.
  let priorFlagsResolved = [];
  if (apply) {
    const openPriorFlags = await deps.readOpenUndateableFlags();
    if (openPriorFlags.length) {
      const datedIds = new Set([...timelineItemIds, ...writtenIds]);
      const plans = planUndateableFlagResolution(openPriorFlags, datedIds);
      for (const plan of plans) {
        await deps.resolveUndateableFlag(plan.id, buildUndateableFlagResolutionNote(plan));
      }
      priorFlagsResolved = plans;
    }
  }

  const summary = {
    step: "timeline-backfill",
    mode,
    counts: {
      undated_total: undated.length,
      page_size: page.length,
      by_step: byStep,
      written,
      undateable: undateableItems.length,
      prior_flags_resolved: priorFlagsResolved.length,
    },
    sample_by_step: sampleByStep,
    undateable_items: undateableItems,
    flag_written: flagWritten ? { id: flagWritten.inserted?.id ?? null } : null,
    prior_flags_resolved: priorFlagsResolved,
    exitCode: 0,
  };
  if (page.length) summary.last_id_processed = page[page.length - 1].id;

  return summary;
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  const { limit, afterId } = parseBatchArgs(process.argv.slice(2));
  await runCli({
    step: "timeline-backfill",
    main: (opts, cliDeps) => main({ ...opts, limit, afterId }, cliDeps),
    needsDb: true,
    buildDeps: async () => ({
      hostOf,
      readLiveItems: () => readAll("intelligence_items", ITEM_COLUMNS, {
        match: (q) => q.eq("is_archived", false),
      }),
      readTimelineItemIds: async () => {
        const rows = await readAll("item_timelines", "item_id");
        return rows.map((r) => r.item_id);
      },
      readCaptures: (itemId) => readAll("agent_run_searches", "result_content, searched_at", {
        match: (q) => q.eq("intelligence_item_id", itemId),
      }),
      readForwardEvents: (itemId) => readAll("item_forward_events", "event_date, date_precision, event_kind, obligation_text", {
        match: (q) => q.eq("intelligence_item_id", itemId),
      }),
      insertTimelineRow: (row) => guardedInsert("item_timelines", row, { cite: CITE, select: "id" }),
      // D23(a): the real changelog write, routed through the shared helper's {findExisting, insert}
      // adapter (changelog.mjs's own header explains why not a raw client) - reads go through
      // db.mjs's readAll (unguarded, routine), writes through guardedInsert (cite + snapshot).
      recordItemChange: (opts) =>
        recordItemChangeCore(
          {
            findExisting: async ({ itemId, field, batch }) => {
              const rows = await readAll("item_changelog", "id", {
                match: (q) => q.eq("item_id", itemId).eq("field", field).eq("new_value", batch),
              });
              return Array.isArray(rows) && rows.length > 0;
            },
            insert: async (row) => {
              // guardedInsert throws on failure (db.mjs's own contract) rather than returning
              // {error} - recordItemChange's own try/catch around `client.insert()` handles that.
              await guardedInsert("item_changelog", row, { cite: CHANGELOG_CITE, select: "id" });
              return { error: null };
            },
          },
          { ...opts, apply: true },
        ),
      writeUndateableFlag: (items) => guardedInsert("integrity_flags", buildUndateableFlagRow(items), { cite: CITE, select: "id" }),
      readOpenUndateableFlags: () =>
        readAll("integrity_flags", "id, recommended_actions", {
          match: (q) => q.eq("created_by", UNDATEABLE_FLAG_CITE.created_by).eq("status", "open"),
        }),
      resolveUndateableFlag: (id, note) =>
        guardedUpdate(
          "integrity_flags",
          (qb) => qb.eq("id", id),
          { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "timeline-backfill", resolution_note: note },
          { cite: CITE },
        ),
    }),
  });
}
