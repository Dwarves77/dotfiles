#!/usr/bin/env node
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
// BOUNDED AND RESUMABLE: --limit / --after-id, the same idiom backfill-format-type.mjs and
// retype-eu-decisions.mjs already use (parsed locally -- no other MAINT wrapper needs pagination flags of
// its own, per backfill-format-type.mjs's own header note). Dry by default; --mode apply writes through
// scripts/lib/db.mjs's guarded path (cite + snapshot + read-back).
import { readAll, guardedInsert, hostOf } from "../lib/db.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import {
  deriveTimelineFromMetadata,
  finalizeTimelineRow,
  pickBestCaptureText,
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

export const UNDATEABLE_FLAG_CITE = Object.freeze({
  category: "data_quality",
  subject_type: "system",
  subject_ref: "timeline-backfill",
  created_by: "timeline-backfill",
});

const ITEM_COLUMNS = "id, title, item_type, source_url, instrument_identifier, canonical_instrument_key";

// ---------------------------------------------------------------------------------------------------
// Pure planning (unit-tested with no I/O): one item's derivation outcome from data the caller already
// read. Delegates the actual date logic entirely to timeline-backfill-derive.mjs -- no second copy of
// the waterfall here.
// ---------------------------------------------------------------------------------------------------

/**
 * @param {{ item: {id:string, title?:string|null, source_url?:string|null, instrument_identifier?:string|null, canonical_instrument_key?:string|null}, capturedText: string|null, forwardEvents: Array<object>, todayIso: string }} input
 * @returns {{ id: string, step: string, row: object|null, attempts?: Array<object> }}
 */
export function planTimelineBackfillItem({ item, capturedText, forwardEvents, todayIso }) {
  const { result, attempts } = deriveTimelineFromMetadata({
    title: item.title,
    sourceUrl: item.source_url,
    capturedText,
    identifier: item.instrument_identifier ?? item.canonical_instrument_key ?? null,
    forwardEvents,
  });
  if (!result) {
    return { id: item.id, step: "undateable", row: null, attempts };
  }
  const row = finalizeTimelineRow(result, todayIso, 0);
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
 * @param {Array<{id:string, title?:string|null, host?:string|null}>} items
 * @returns {string}
 */
export function buildUndateableFlagDescription(items) {
  const hosts = [...new Set((items ?? []).map((i) => i.host).filter(Boolean))];
  const hostSample = hosts.slice(0, 10).join(", ");
  const hostNote = hosts.length > 10 ? `${hostSample}, and ${hosts.length - 10} more` : hostSample;
  return (
    `timeline-backfill: ${items.length} item(s) carry none of a title date, a Federal Register date path, ` +
    "a legislation.gov.uk line, a forward event, or a dateline -- no derivation step could date them. " +
    `Hosts: ${hostNote || "(none resolvable)"}. Full id list in this flag's recommended_actions[0].ids.`
  );
}

/**
 * Builds the integrity_flags insert row for the run's undateable set. Pure.
 * @param {Array<{id:string, title?:string|null, host?:string|null}>} items
 * @returns {object}
 */
export function buildUndateableFlagRow(items) {
  return {
    ...UNDATEABLE_FLAG_CITE,
    description: buildUndateableFlagDescription(items),
    recommended_actions: [
      {
        action: "manual_research_or_source_review",
        rationale:
          "no deterministic date source was found; research the instrument's own date (or accept it as " +
          "genuinely undated content, e.g. a portal/register page) before this item is excluded from " +
          "population-report's timeline-coverage count.",
        ids: items.map((i) => i.id),
      },
    ],
    status: "open",
  };
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
  let written = 0;

  for (const item of page) {
    const captures = await deps.readCaptures(item.id);
    const capturedText = pickBestCaptureText(captures);
    const forwardEvents = await deps.readForwardEvents(item.id);
    const plan = planTimelineBackfillItem({ item, capturedText, forwardEvents, todayIso });

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
    if (apply) await deps.insertTimelineRow({ ...plan.row, item_id: item.id });
  }

  let flagWritten = null;
  if (apply && undateableItems.length) {
    flagWritten = await deps.writeUndateableFlag(undateableItems);
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
    },
    sample_by_step: sampleByStep,
    undateable_items: undateableItems,
    flag_written: flagWritten ? { id: flagWritten.inserted?.id ?? null } : null,
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
      readCaptures: (itemId) => readAll("agent_run_searches", "result_content", {
        match: (q) => q.eq("intelligence_item_id", itemId),
      }),
      readForwardEvents: (itemId) => readAll("item_forward_events", "event_date, date_precision, event_kind, obligation_text", {
        match: (q) => q.eq("intelligence_item_id", itemId),
      }),
      insertTimelineRow: (row) => guardedInsert("item_timelines", row, { cite: CITE, select: "id" }),
      writeUndateableFlag: (items) => guardedInsert("integrity_flags", buildUndateableFlagRow(items), { cite: CITE, select: "id" }),
    }),
  });
}
