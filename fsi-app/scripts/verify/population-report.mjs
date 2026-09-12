#!/usr/bin/env node
// population-report.mjs — is each store BUILT, or is it built AND FILLED?
//
// WHY THIS EXISTS. Waves 4-7 built three stores, the producers that fill them, and the readers that
// display them — and shipped with all three stores empty, because the sandbox those waves ran in
// cannot reach the upstream sources (ec.europa.eu, energy.ec.europa.eu, api.bls.gov: all HTTP 000
// under the org egress policy, confirmed 2026-08-30). Nothing in the repo made that visible. The
// suite passed, the fitness functions passed, tsc passed, and three surfaces rendered a location
// with nothing in it. Every gate this codebase has answers "is the code correct?" — none answered
// "is there anything to show?", so the emptiness had to be noticed by a person asking. That is
// exactly the kind of check that gets skipped on the day it matters.
//
// NOT A PASS/FAIL TEST, deliberately. Mid-build, empty is the CORRECT state for a store whose
// producer has not been armed yet — you build the place to put the information before you populate
// it. A check that went red for being mid-build would be switched off within a week. What this does
// instead is make the state legible: every store, its row count, the number that actually decides
// whether its reader shows anything, and the named producer that would fill it.
//
// `--strict` flips it to a hard gate, for the one caller where empty IS a failure: the step that
// runs immediately after a producer's `--apply` in .github/workflows/producers.yml.
//
// $0: read-only, count-only. No writes, no model calls, no metered anything.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
import { STUB_BRIEF_MARKER } from "../../src/lib/intake/record-facts.mjs";
import { isMainModule } from '../lib/is-main.mjs'; // task 0.3b: the Windows-safe CLI main guard
import { readRunHistory } from "../lib/run-artifact.mjs";
import { extractMintedItemIds } from "../turns/run-population-flywheel.mjs";
import { TAG_NAMESPACE, SIGNAL_NAMESPACE, createdBy } from "../../src/lib/connections/flag-namespaces.mjs";
import { AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE } from "../../src/lib/classification/flags.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Task 3.5 (W9 brief-chain plan Part 3): the SAME two harness-run families run-population-flywheel.mjs
// (mint) and apply-record-briefs.mjs (brief-apply) already read/write -- never a second, drifting copy of
// either path.
export const DEFAULT_MINT_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "mint");
export const DEFAULT_BRIEF_APPLY_HARNESS_RUNS_DIR = resolve(HERE, "..", "harness-runs", "brief-apply");

/**
 * Task 3.5, PURE, no I/O: the "briefs pending" queue this population-report entry watches. A live
 * record-grade item is STALE when it carries NO brief-apply outcome (scripts/harness-runs/brief-apply/
 * *.json's own per_item, task 3.4's own "<itemId>#<step>" id shape) AND it was minted before the LATEST
 * population turn's own started_at -- i.e. at least one population turn has already run since this item
 * was minted, with nothing yet applying a brief to it. This is the exact predicate this entry's own
 * comment states verbatim, so the reader knows what red means without opening this file. An item minted in
 * the SAME (most recent) turn is never stale by this predicate -- it has not yet had a turn to be picked
 * up in. An item whose own mint-run artifact cannot be resolved (predates the mint harness family, or
 * predates per_item.item_id -- see run-population-flywheel.mjs's own extractMintedItemIds/
 * hasRecoverableMintedIds headers) falls back to its own intelligence_items.created_at: "the equivalent you
 * can compute from what the report already reads," which this task's own brief allows. An item with
 * NEITHER a resolvable mint-run started_at NOR a created_at is never counted stale: this function never
 * guesses a verdict it cannot support with evidence.
 * @param {Array<{id:string, created_at?:string|null}>} liveRecordItems
 * @param {Array<object>} mintRuns readRunHistory(mintDir).runs
 * @param {Array<object>} briefApplyRuns readRunHistory(briefApplyDir).runs
 * @returns {{staleCount:number, staleIds:string[], latestTurnStartedAt:string|null}}
 */
export function computeBriefsPendingStale(liveRecordItems, mintRuns, briefApplyRuns) {
  const items = Array.isArray(liveRecordItems) ? liveRecordItems : [];
  const runs = Array.isArray(mintRuns) ? mintRuns : [];
  const applyRuns = Array.isArray(briefApplyRuns) ? briefApplyRuns : [];

  // The latest population turn's own started_at -- the newest mint-run artifact on record (population-
  // turn.yml is the only writer of this family). Re-derived by explicit max rather than trusting
  // readRunHistory's own ascending sort, so this function stays correct even given artifacts out of order.
  let latestTurnStartedAt = null;
  let latestTurnMs = -Infinity;
  for (const r of runs) {
    const t = Date.parse(r?.started_at ?? "");
    if (Number.isFinite(t) && t > latestTurnMs) {
      latestTurnMs = t;
      latestTurnStartedAt = r.started_at;
    }
  }

  // item_id -> the started_at of whichever mint-run artifact actually minted it. extractMintedItemIds'
  // own MINTED_OUTCOME_VALUES vocabulary is reused unchanged: never a second, drifting copy of "what
  // counts as minted."
  const mintedAtByItemId = new Map();
  for (const run of runs) {
    for (const id of extractMintedItemIds(run)) {
      if (!mintedAtByItemId.has(id)) mintedAtByItemId.set(id, run.started_at);
    }
  }

  // item ids that carry ANY brief-apply per_item outcome, success or failure: "attempted" is enough to
  // clear this queue. A failed brief-apply step is a DIFFERENT, already-visible defect (that run's own
  // artifact names it), not a silent hole this entry should also flag.
  const hasBriefApplyOutcome = new Set();
  for (const run of applyRuns) {
    for (const entry of Array.isArray(run?.per_item) ? run.per_item : []) {
      const id = typeof entry?.id === "string" ? entry.id.split("#")[0] : null;
      if (id) hasBriefApplyOutcome.add(id);
    }
  }

  const staleIds = [];
  if (latestTurnStartedAt !== null) {
    for (const it of items) {
      if (!it?.id || hasBriefApplyOutcome.has(it.id)) continue;
      const mintedAt = mintedAtByItemId.get(it.id) ?? it.created_at ?? null;
      if (!mintedAt) continue;
      const mintedMs = Date.parse(mintedAt);
      if (Number.isFinite(mintedMs) && mintedMs < latestTurnMs) staleIds.push(it.id);
    }
  }

  return { staleCount: staleIds.length, staleIds, latestTurnStartedAt };
}

/**
 * The "briefs pending" entry's totalQuery: the I/O half (one DB read + two harness-run directory reads),
 * calling computeBriefsPendingStale (pure, above) for the actual predicate. `readHistoryFn`/`mintDir`/
 * `briefApplyDir` are overridable so this is testable without touching the real filesystem
 * (readRunHistory itself is a plain synchronous directory read, no network -- scripts/lib/run-artifact.mjs).
 * @param {object} sb
 * @param {{readHistoryFn?:Function, mintDir?:string, briefApplyDir?:string}} [opts]
 * @returns {Promise<{count:number|null, error:{message:string}|null}>}
 */
export async function countBriefsPendingStale(sb, {
  readHistoryFn = readRunHistory,
  mintDir = DEFAULT_MINT_HARNESS_RUNS_DIR,
  briefApplyDir = DEFAULT_BRIEF_APPLY_HARNESS_RUNS_DIR,
} = {}) {
  try {
    const liveRecordItems = await readAll("intelligence_items", "id, created_at", {
      match: (q) => q.eq("item_grade", "record").eq("provenance_status", "verified").eq("is_archived", false),
      client: sb,
    });
    const { runs: mintRuns } = readHistoryFn(mintDir);
    const { runs: briefApplyRuns } = readHistoryFn(briefApplyDir);
    const { staleCount } = computeBriefsPendingStale(liveRecordItems, mintRuns, briefApplyRuns);
    return { count: staleCount, error: null };
  } catch (e) {
    return { count: null, error: { message: e.message } };
  }
}

// Task 3.5 fix round 1 (coordinator review): the two footnotes the "briefs pending" entry's own
// describeState (below) appends to every non-FILLED render, so a human reading the report -- not only a
// reader of this file's source -- sees them too.
const BRIEFS_PENDING_PROVENANCE_NOTE =
  "outcomes are read from scripts/harness-runs/brief-apply/*.json run artifacts, per ADR-028: " +
  "item_grade is a CACHE of the brief-runtime state, never the signal this entry itself reads.";
// [HYPOTHESIS] (reviewer, task 3.5 fix round 1, not yet independently verified against a real unmerged
// branch): population-turn.yml pushes each run's own mint-run/brief-apply artifacts to a
// population/<run_id> branch before opening a PR (deliver-artifact-branch.sh); a checkout that has not
// merged that branch yet cannot see the artifacts sitting on it, so this entry can only under-count
// staleness on a fresh checkout, never over-count it -- a delayed red, not a fabricated one.
const BRIEFS_PENDING_VISIBILITY_CAVEAT =
  "[HYPOTHESIS] on a fresh checkout, artifacts still sitting on an unmerged population/<run_id> branch " +
  "are not visible to this read, which can only DELAY a red past its true onset; it never fabricates one.";

/**
 * Task 3.5 fix round 1 (coordinator review): the "briefs pending" entry's own `describeState`. The
 * generic renderReport wording ("reader has nothing to show" / "fill it with: <producer>") is backwards
 * for this entry -- red here means N record items ARE minted and waiting, and the fix is DRAINING the
 * queue (author + apply), not running the very producer that already filled it. Returns an array so
 * renderReport prints one line per entry, matching the generic path's own two-line shape.
 * @param {"EMPTY"|"ROWS_NO_VALUES"} state
 * @param {{rows:number, filled:number}} counts
 * @returns {string[]}
 */
export function describeBriefsPendingState(state, counts) {
  const lines = [];
  if (state === "EMPTY") {
    lines.push("0 record item(s) are currently stale: the brief-apply queue is caught up, nothing to drain right now.");
  } else {
    lines.push(
      `${counts.rows} record item(s) minted before the latest population turn have no brief-apply outcome; ` +
        "drain the queue: export parts in scripts/turns/brief-export/pending/, author (record-briefs, task 3.2), " +
        "apply via brief-apply.yml (task 3.4).",
    );
  }
  lines.push(BRIEFS_PENDING_PROVENANCE_NOTE);
  lines.push(BRIEFS_PENDING_VISIBILITY_CAVEAT);
  return lines;
}

// ── "timeline coverage" entry (task 6.1c, ADR-030 "every item carries a timeline date") ────────────────
// Same shape as "briefs pending" above: `total` (rows) IS the defect count itself -- the number of live
// items that carry NO item_timelines row AND are not named in an open timeline-backfill undateable flag
// -- never a coverage ratio. 0 reads as EMPTY (benign: nothing wrong); any nonzero count reads as
// ROWS_NO_VALUES (red), exactly the "items without a row, excluding the flagged set" predicate the task
// brief names.

/**
 * Pure: every open timeline-backfill integrity_flags row (scripts/maintenance/timeline-backfill.mjs's
 * own write shape) carries its full undateable id list in recommended_actions[0].ids. Collects the union
 * across every such row this run's own read returned (a corpus can accumulate more than one flag over
 * multiple timeline-backfill dispatches). Never guesses an id outside what a row's own recommended_actions
 * actually names.
 * @param {Array<{recommended_actions?: Array<{ids?: string[]}>}>} flagRows
 * @returns {string[]}
 */
export function extractFlaggedTimelineIds(flagRows) {
  const ids = new Set();
  for (const row of flagRows ?? []) {
    const actions = Array.isArray(row?.recommended_actions) ? row.recommended_actions : [];
    for (const action of actions) {
      if (!Array.isArray(action?.ids)) continue;
      for (const id of action.ids) if (typeof id === "string" && id) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Pure: which live item ids carry no item_timelines row AND are not in the flagged (reported-undateable)
 * set. This IS the "timeline coverage" defect count -- see this section's own header.
 * @param {string[]} liveItemIds
 * @param {string[]} timelineItemIds item_timelines.item_id values already on record
 * @param {string[]} flaggedItemIds ids named in an open timeline-backfill undateable flag
 * @returns {{gapCount:number, gapIds:string[]}}
 */
export function computeTimelineCoverageGap(liveItemIds, timelineItemIds, flaggedItemIds) {
  const dated = new Set(timelineItemIds ?? []);
  const flagged = new Set(flaggedItemIds ?? []);
  const gapIds = (liveItemIds ?? []).filter((id) => id && !dated.has(id) && !flagged.has(id));
  return { gapCount: gapIds.length, gapIds };
}

/**
 * The "timeline coverage" entry's totalQuery: three reads (live item ids, item_timelines' own item_id
 * column, the open timeline-backfill flags) feeding computeTimelineCoverageGap (pure, above).
 * @param {object} sb
 * @returns {Promise<{count:number|null, error:{message:string}|null}>}
 */
export async function countTimelineCoverageGap(sb) {
  try {
    const liveItems = await readAll("intelligence_items", "id", {
      match: (q) => q.eq("is_archived", false),
      client: sb,
    });
    const timelineRows = await readAll("item_timelines", "item_id", { client: sb });
    const flagRows = await readAll("integrity_flags", "recommended_actions", {
      match: (q) => q.eq("category", "data_quality").eq("subject_type", "system").eq("subject_ref", "timeline-backfill").eq("status", "open"),
      client: sb,
    });
    const flaggedIds = extractFlaggedTimelineIds(flagRows);
    const { gapCount } = computeTimelineCoverageGap(liveItems.map((r) => r.id), timelineRows.map((r) => r.item_id), flaggedIds);
    return { count: gapCount, error: null };
  } catch (e) {
    return { count: null, error: { message: e.message } };
  }
}

/**
 * "timeline coverage"'s own describeState -- same reasoning as describeBriefsPendingState: red here
 * means N live items genuinely lack a date, the fix is DATING them (the two backfill scripts), not
 * running "the producer" in the generic sense (though the wording still names both scripts to run).
 * @param {"EMPTY"|"ROWS_NO_VALUES"} state
 * @param {{rows:number, filled:number}} counts
 * @returns {string[]}
 */
export function describeTimelineCoverageState(state, counts) {
  if (state === "EMPTY") {
    return ["0 live item(s) lack a timeline row outside the reported undateable set: timeline coverage is caught up (ADR-030)."];
  }
  return [
    `${counts.rows} live item(s) carry no item_timelines row and are not named in an open timeline-backfill ` +
      "undateable flag: dispatch scripts/backfill-item-timelines.mjs first (reg-family briefs with a timeline " +
      "section), then scripts/maintenance/timeline-backfill.mjs (steps 2-6) to date the rest.",
  ];
}

// ── open-flags-by-family (Part 7 task 7.2 / ADR-030 rider, 2026-09-12) ──────────────────────────────
// "every step's dry output lists ... counts and a sample per outcome; the population report's counters
// [measure] the queue (open flags by family) so the drain is proven by the report, not by a claim." One
// STORES row per family, task 7.2's own scope (tag-ratification, apply-classifications, signals) — every
// resolver in that scope now DECIDES every proposal it reads and closes the flag (apply-tags.mjs /
// apply-classifications.mjs / analyze-corpus.mjs + resolve-signals.mjs), so an open row here past a
// clean apply run is a REGRESSION (a decidable flag left open), not an expected mid-build gap. Same
// "total IS the defect count" shape "briefs pending" / the timeline-coverage-gap entry above already use.

export const AXIS_CLASSIFICATION_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE);

/** Pure predicate set, shared by countOpenFlagsByFamily below and this file's own tests. */
export const FLAG_FAMILY_PREDICATES = Object.freeze({
  tag: (r) => typeof r?.created_by === "string" && r.created_by.startsWith(TAG_NAMESPACE),
  axisSourceClassification: (r) => r?.created_by === AXIS_CLASSIFICATION_CREATED_BY,
  signal: (r) => typeof r?.created_by === "string" && r.created_by.startsWith(SIGNAL_NAMESPACE),
});

/**
 * Pure: count OPEN integrity_flags rows matching one family predicate.
 * @param {Array<{created_by?:string}>} flagRows
 * @param {"tag"|"axisSourceClassification"|"signal"} family
 * @returns {number}
 */
export function computeOpenFlagsByFamily(flagRows, family) {
  const rows = Array.isArray(flagRows) ? flagRows : [];
  return rows.filter(FLAG_FAMILY_PREDICATES[family]).length;
}

/**
 * Live read: every OPEN integrity_flags row's created_by, then count against one family predicate.
 * Paginated via readAll (never a raw .select() CAP-1000 could truncate).
 * @param {object} sb
 * @param {"tag"|"axisSourceClassification"|"signal"} family
 * @returns {Promise<{count:number|null, error:{message:string}|null}>}
 */
export async function countOpenFlagsByFamily(sb, family) {
  try {
    const rows = await readAll("integrity_flags", "created_by", { match: (q) => q.eq("status", "open"), client: sb });
    return { count: computeOpenFlagsByFamily(rows, family), error: null };
  } catch (e) {
    return { count: null, error: { message: e.message } };
  }
}

/** describeState hook, one per family entry below — see renderReport's own doc comment. */
export function describeOpenFlagsByFamilyState(label, dispatchStep) {
  return (state, counts) => [
    `${counts.rows} open ${label} flag(s) still require a decision.`,
    `Dispatch (mode=apply): ${dispatchStep} — decides (adopts or declines) every proposal it reads and closes the flag; no residue stays open.`,
  ];
}

/**
 * Each entry names the store, the reader that renders it, and `fill` — the column whose non-null
 * count decides whether that reader has anything real to show. Row count alone is the wrong
 * question: regional_data_facts carried 75 rows the entire time while holding ZERO enveloped
 * values, so the matrix's indexed layer showed nothing despite a non-zero count. `fill` is the
 * honest number, and the gap between the two is the whole point of this report.
 *
 * An entry may instead supply `totalQuery(sb)`/`filledQuery(sb)` — async functions returning
 * `{count, error}` — for a store where "filled" isn't a plain non-null-column count (brief coverage,
 * below, needs a text-pattern match, not a null check). `fill` stays required even then, as the
 * human-readable label countStore's row prints next to the number.
 */
export const STORES = Object.freeze([
  { table: "market_series", fill: "value_numeric",
    reader: "/market — series board (WO-16)",
    producer: "scripts/producers/market/eu-weekly-oil-bulletin.mjs" },
  { table: "emission_factors", fill: "ttw_co2e",
    reader: "/admin/factors (WO-18)",
    producer: "scripts/gen/emission-factors-{epa,desnz}.mjs" },
  { table: "regional_data_facts", fill: "value_numeric",
    reader: "/operations — region-dimension matrix, indexed layer (WO-9 layer 2)",
    producer: "scripts/producers/regional/{eurostat-nrg-pc-205,bls-oews}-producer.mjs" },
  { table: "state_cost_facts", fill: "value",
    reader: "/operations — By-state roster (WO-10)",
    producer: "(seeded; no recurring producer)" },
  { table: "published_price_statistics", fill: "value_display",
    reader: "/market/[slug] PriceBoard + /market list key figure (WO-13)",
    producer: "scripts/producers/market/refresh-published-price-statistics.mjs" },
  { table: "theme_briefs", fill: "brief_md",
    reader: "/research/[slug] — cluster synthesis card (WO-25)",
    producer: "flywheel U6 theme-brief pass" },
  // ── DATECHAIN lane, 2026-09-11 — the three date-chain stores + brief coverage, named directly by
  // the operator's 2026-09-09 ruling ("briefs need to exist for all items as well"). These four were
  // the exact gap this population-report guard was invented to catch and did not: built-but-empty
  // stores the CI/build gates never questioned. See docs/ops/runbooks/date-chain-2026-09-11.md.
  { table: "item_timelines", fill: "milestone_date",
    reader: "item detail page — §14 Confirmed Regulatory Timeline widget",
    producer: "canonical-pipeline.ts harvestItemTimeline() (per-generation) + scripts/backfill-item-timelines.mjs (corpus sweep, revived from _archive/ this lane)" },
  { table: "item_forward_events", fill: "event_date",
    reader: "/api/admin/forward-events — upcoming-obligations queue",
    producer: "mint-item.ts / apply-staged-update.ts (per-item, rule 16(b)) + scripts/forward-events/dispatch-extraction.mjs (corpus backfill, this lane)" },
  // -- task 6.1c, brief-chain build plan 2026-09-11, under ADR-030 ("every item carries a timeline
  // date"). RED means: at least one live item carries no item_timelines row AND is not named in an open
  // timeline-backfill undateable flag -- see countTimelineCoverageGap / computeTimelineCoverageGap above,
  // the same "total IS the defect count" shape "briefs pending" (below) already uses.
  { table: "intelligence_items",
    fill: "items without an item_timelines row (excluding the timeline-backfill-flagged undateable set)",
    reader: "item detail page timeline widget; the ADR-030 ruling (\"no item should be without some date in the timeline\")",
    producer: "scripts/backfill-item-timelines.mjs (step 1, brief-body timeline sections) + scripts/maintenance/timeline-backfill.mjs (steps 2-6, task 6.1c) + mint-item.ts rule 16(f) (title-derivation at mint, so no new item is born undated)",
    totalQuery: (sb) => countTimelineCoverageGap(sb),
    filledQuery: async () => ({ count: 0, error: null }),
    describeState: describeTimelineCoverageState },
  { table: "intelligence_items", fill: "compliance_deadline",
    reader: "item summary card — compliance deadline field",
    producer: "src/lib/forward-events/compliance-deadline-sync.mjs, called from mint-item.ts / apply-staged-update.ts and scripts/forward-events/dispatch-extraction.mjs" },
  { table: "intelligence_items", fill: `full_brief (non-stub; stub = "${STUB_BRIEF_MARKER}")`,
    reader: "every item detail page — the full_brief body itself",
    producer: "canonical-pipeline.ts generateBrief() — a subscription-lane intake pass, see the runbook's command 3",
    totalQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false),
    filledQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false).not("full_brief", "ilike", `%${STUB_BRIEF_MARKER}%`) },
  // -- W9 PART1 lane, 2026-09-11: three entries guarding the "connected at birth" wiring tasks 1.1-1.3
  // add (rule 17: nothing mints alone). Each watches a specific wiring gap the ruling in section 0 of
  // docs/plans/brief-chain-build-plan-2026-09-11.md named by measurement, not guess.
  //
  // RED means: at least one live item was minted (or still stands from before the wiring landed) without
  // the connection this entry checks for, with zero of the corpus showing the connection made at all.
  { table: "entity_refs", fill: "distinct live items carrying an entity_refs row",
    reader: "the entity spine (migration 282/283): jurisdiction linkage a live item's own connections read",
    producer: "src/lib/entities/link-item-entities.mjs, called from mint-item.ts post-insert (task 1.1) and apply-staged-update.ts, plus scripts/entities/backfill-entities.mjs for the corpus catch-up",
    // RED means: no live item anywhere has an entity_refs row, so the mint-time write (task 1.1) is
    // either not wired or has never fired. `filled` is the distinct entity_refs.ref_id count for
    // ref_table='intelligence_items', not a count re-verified against the live corpus by id: PostgREST
    // gives entity_refs.ref_id no FK to embed through (a generic (ref_table, ref_id) pair, by migration
    // 283's own design note), and cross-checking it would mean an .in() filter carrying every id in the
    // corpus, exactly the unbounded-URL defect class F39 exists to catch (IN-CHUNK, 2026-09-06). The read
    // goes through readAll (scripts/lib/db.mjs), paginated, never a raw .select() that CAP-1000 would
    // silently truncate once entity_refs passes 1,000 rows. Distinctness is the same Set-based collapse
    // scripts/entities/backfill-entities.mjs already uses (multiple jurisdiction roles per item).
    totalQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false),
    filledQuery: async (sb) => {
      try {
        // entity_refs has no `id` column (primary key: ref_table, ref_id, entity_id, role; migration
        // 283), so the paginated read orders on the key's columns. Hotfix 2026-09-12: the default
        // order column `id` made every Maintenance run fail at "Population BEFORE" (run 34670770742).
        const rows = await readAll("entity_refs", "ref_id", {
          match: (q) => q.eq("ref_table", "intelligence_items"),
          orderBy: ["ref_id", "entity_id", "role"],
          client: sb,
        });
        return { count: new Set(rows.map((r) => r.ref_id)).size, error: null };
      } catch (e) {
        return { count: null, error: { message: e.message } };
      }
    } },
  { table: "intelligence_items", fill: "format_type",
    reader: "item detail page + surface routing: format_type selects which of the five section templates renders",
    producer: "mint-item.ts (stamped at birth from item_type, task 1.2) + canonical-pipeline.ts synthesiseAndWriteBrief (forced post-generation) + scripts/maintenance/backfill-format-type.mjs (corpus catch-up for the 128 rows minted before task 1.2, task 2.4)",
    // RED means: every live item has a null format_type, so task 1.2's birth stamp is either not wired
    // or has never fired (the pre-1.2 backlog alone cannot make this ROWS_NO_VALUES, since every item
    // minted after 1.2 lands with format_type set).
    totalQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false),
    filledQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false).not("format_type", "is", null) },
  { table: "intelligence_items", fill: "canonical_instrument_key CELEX Decisions typed as regulation",
    reader: "/regulations surface: a CELEX Decision is a binding act (Article 288 TFEU) and belongs on the regulation format, not initiative's market-signal one (task 1.3's export-census-rows.mjs mapping)",
    producer: "scripts/mint/export-census-rows.mjs classifyItemTypeFromCelexKey() (new mints, task 1.3) + task 5.5's corpus retype of the 351 live rows minted before task 1.3 landed",
    // RED means: every live item whose canonical_instrument_key is CELEX-Decision-shaped (sector 2/3/4,
    // letter D) is still typed something other than regulation, the pre-1.3 backlog task 5.5 owns.
    // `total` matches on the KEY SHAPE alone, not item_type, deliberately: filtering total to
    // item_type='initiative' would make this entry's row count itself go to zero the moment task 5.5
    // retypes the backlog, landing on EMPTY (rows===0), which classify() never reports as FILLED, so a
    // fixed corpus would read as permanently red. Matching on the key across every type keeps `total`
    // stable (the key never changes) while `filled` (item_type='regulation' among that same set) climbs
    // from 0 to the full 351 as task 5.5 lands, the same growing-good-count shape compliance_deadline uses.
    totalQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false).regexMatch("canonical_instrument_key", "^[234]\\d{4}D"),
    filledQuery: (sb) => sb.from("intelligence_items").select("*", { count: "exact", head: true }).eq("is_archived", false).regexMatch("canonical_instrument_key", "^[234]\\d{4}D").eq("item_type", "regulation") },
  // -- W9 PART3 lane, 2026-09-11: task 3.5, "every new item is queued for a brief automatically." A
  // population turn's own flywheel (step 12, run-population-flywheel.mjs) exports each newly-minted
  // record item's stored source text for a session lane to author a brief from; this entry is the queue
  // that flywheel step feeds and apply-record-briefs.mjs (task 3.4) drains.
  { table: "intelligence_items",
    fill: "brief-apply outcome present (recheck; structurally 0 whenever rows>0, see the predicate below)",
    reader: "population-report.mjs's own CLI output: the queue a session lane drains via record-briefs (task 3.2) then apply-record-briefs.mjs (task 3.4); no dedicated admin/UI surface exists yet",
    producer: "scripts/turns/run-population-flywheel.mjs's brief-export step (task 3.5, step 12) exports the queue after every population turn; scripts/turns/apply-record-briefs.mjs (task 3.4) drains it",
    // RED means (the exact predicate, stated here per this task's own instruction): at least one live
    // record-grade item was minted before the LATEST population turn's own started_at (its own mint-run
    // artifact under scripts/harness-runs/mint/, or intelligence_items.created_at when that artifact
    // cannot be resolved) and still carries NO brief-apply outcome (scripts/harness-runs/brief-apply/
    // *.json's own per_item, task 3.4) -- the same transit-only posture RD-20 already gives staged_updates
    // (a transitional state is fine BRIEFLY; parked past its own bound is the defect), applied here to the
    // brief-authoring queue instead of intake.
    //
    // `total` (rows) IS the stale count itself, not a coverage ratio like every entry above it: 0 stale
    // items reads as EMPTY (this file's own documented benign state, "nothing to show because there is
    // nothing wrong"); any nonzero count reads as ROWS_NO_VALUES (this file's existing defect state) --
    // exactly the "> 0 is red" predicate this entry exists to catch, which a coverage-ratio shape (some
    // stale among many fine items) could hide behind a nonzero `filled`. `filled` is therefore NOT a
    // second, independent measurement: an item counted in `total` is BY DEFINITION one with no
    // brief-apply outcome, so "how many of the stale items also carry an outcome" is 0 as a matter of the
    // query's own construction, not a live re-check -- computeBriefsPendingStale (above) is the one place
    // this predicate is computed, never restated.
    //
    // Two footnotes (task 3.5 fix round 1, coordinator review), also printed verbatim in the rendered
    // report by describeBriefsPendingState below, not only stated here: (1) outcomes are read from
    // scripts/harness-runs/brief-apply/*.json run artifacts, per ADR-028 -- item_grade is a CACHE of the
    // brief-runtime state, never the signal this entry itself reads. (2) [HYPOTHESIS] on a fresh checkout,
    // artifacts still sitting on an unmerged population/<run_id> branch are not visible to this read, which
    // can only DELAY a red past its true onset, never fabricate one.
    totalQuery: (sb) => countBriefsPendingStale(sb),
    filledQuery: async () => ({ count: 0, error: null }),
    // Reviewer finding (task 3.5 fix round 1, [CONFIRMED] by running renderReport): the generic
    // "reader has nothing to show" / "fill it with: <producer>" pair is backwards for this entry -- see
    // describeBriefsPendingState's own header for why.
    describeState: describeBriefsPendingState },
  // -- Part 7 task 7.2, brief-chain build plan 2026-09-11 / ADR-030 rider: "no queue on the admin page
  // may require a human click to resolve" -- one row per family this task's resolvers own. RED (rows>0)
  // means a decidable flag was left open; each resolver (apply-tags.mjs / apply-classifications.mjs /
  // analyze-corpus.mjs+resolve-signals.mjs) now decides every proposal it reads, so a nonzero count here
  // after a clean apply dispatch is a regression, not an expected mid-build gap.
  { table: "integrity_flags", fill: "open flywheel-tag:* flags (defect count itself, see below)",
    reader: "population-report.mjs's own CLI output -- the flywheel-tag: queue task 7.2's tag-ratification step drains",
    producer: "scripts/maintenance/tag-ratification.mjs --arg auto --mode apply",
    totalQuery: (sb) => countOpenFlagsByFamily(sb, "tag"),
    filledQuery: async () => ({ count: 0, error: null }),
    describeState: describeOpenFlagsByFamilyState("flywheel-tag:*", "tag-ratification.mjs --arg auto") },
  { table: "integrity_flags", fill: `open ${AXIS_CLASSIFICATION_CREATED_BY} flags (defect count itself, see below)`,
    reader: "population-report.mjs's own CLI output -- the source-classification queue task 7.2's apply-classifications step drains",
    producer: "scripts/maintenance/apply-classifications.mjs --mode apply",
    totalQuery: (sb) => countOpenFlagsByFamily(sb, "axisSourceClassification"),
    filledQuery: async () => ({ count: 0, error: null }),
    describeState: describeOpenFlagsByFamilyState(AXIS_CLASSIFICATION_CREATED_BY, "apply-classifications.mjs") },
  { table: "integrity_flags", fill: "open flywheel-signal:* flags (defect count itself, see below)",
    reader: "population-report.mjs's own CLI output -- the signal-candidate queue task 7.2's resolve-signals step drains",
    producer: "scripts/maintenance/resolve-signals.mjs --mode apply",
    totalQuery: (sb) => countOpenFlagsByFamily(sb, "signal"),
    filledQuery: async () => ({ count: 0, error: null }),
    describeState: describeOpenFlagsByFamilyState("flywheel-signal:*", "resolve-signals.mjs") },
]);

/**
 * The three states, as a pure function of two counts. Separated out so the distinction that matters
 * — ROWS_NO_VALUES, the one that fooled us — is pinned by a test rather than living inline in a
 * console.log where nothing can assert on it.
 * @returns {"EMPTY"|"ROWS_NO_VALUES"|"FILLED"}
 */
export function classify({ rows, filled }) {
  if (rows === 0) return "EMPTY";
  if (filled === 0) return "ROWS_NO_VALUES";
  return "FILLED";
}

/**
 * Pure renderer: results -> printable lines. Injectable so the CLI's output is testable.
 *
 * An entry may supply `describeState(state, counts)` -- returning a string or an array of strings -- to
 * REPLACE the generic "reader has nothing to show" / "fill it with" pair for a non-FILLED state whose own
 * meaning is not "this store needs a producer run" (task 3.5 fix round 1, coordinator review: "briefs
 * pending"'s own red means a QUEUE needs DRAINING, not a store needing a producer -- the generic wording
 * reads backwards for it: it would tell the reader "fill it with run-population-flywheel.mjs's brief-export
 * step," which is exactly the step that PRODUCED the red row in the first place). `counts` is `{rows,
 * filled}` from the same result row `classify()` already consumed. An entry without the hook keeps the
 * original generic two-line text, byte-for-byte unchanged.
 */
export function renderReport(results) {
  const out = ["", "POPULATION REPORT — built, or built and filled?", ""];
  const w = Math.max(...results.map((r) => r.table.length));
  const pad = (s, n) => String(s).padEnd(n);
  for (const r of results) {
    const state = classify(r);
    out.push(`  ${pad(r.table, w)}  rows=${pad(r.rows, 5)} ${pad(`${r.fill}=${r.filled}`, 22)} ${state}`);
    if (state !== "FILLED") {
      if (typeof r.describeState === "function") {
        const described = r.describeState(state, { rows: r.rows, filled: r.filled });
        const lines = Array.isArray(described) ? described : [described];
        for (const line of lines) out.push(`  ${pad("", w)}  -> ${line}`);
      } else {
        out.push(`  ${pad("", w)}  -> reader "${r.reader}" has nothing to show`);
        out.push(`  ${pad("", w)}  -> fill it with: ${r.producer}`);
      }
    }
  }
  const unfilled = results.filter((r) => classify(r) !== "FILLED");
  out.push("");
  out.push(
    `  ${results.length - unfilled.length}/${results.length} stores filled.` +
      (unfilled.length ? `  UNFILLED: ${unfilled.map((r) => r.table).join(", ")}` : "  All readers have data.")
  );
  out.push("");
  out.push("  Empty is a legitimate mid-build state — the store and its reader get built before the");
  out.push("  producer is armed. This report exists so that state stays visible rather than being");
  out.push("  rediscovered later by someone wondering why a page looks blank.");
  out.push("");
  return out;
}

/** Count one store. Injectable client so this is exercisable without a database. `totalQuery`/
 *  `filledQuery` (see STORES' own doc comment) override the default plain-count / not-null-count
 *  queries for a store whose "filled" isn't a bare null check. */
export async function countStore(sb, { table, fill, totalQuery, filledQuery }) {
  const total = totalQuery ? await totalQuery(sb) : await sb.from(table).select("*", { count: "exact", head: true });
  if (total.error) throw new Error(`${table}: ${total.error.message}`);
  const filled = filledQuery ? await filledQuery(sb) : await sb.from(table).select("*", { count: "exact", head: true }).not(fill, "is", null);
  if (filled.error) throw new Error(`${table}.${fill}: ${filled.error.message}`);
  return { rows: total.count ?? 0, filled: filled.count ?? 0 };
}

export async function collect(sb, stores = STORES) {
  const results = [];
  for (const s of stores) results.push({ ...s, ...(await countStore(sb, s)) });
  return results;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
// Guarded so importing this module for its pure parts never opens a database connection.
if (isMainModule(import.meta.url)) {
  const strict = process.argv.includes("--strict");
  const results = await collect(readClient());
  console.log(renderReport(results).join("\n"));
  const unfilled = results.filter((r) => classify(r) !== "FILLED");
  if (strict && unfilled.length) {
    console.error(`::error::--strict: ${unfilled.length} store(s) still unfilled after this run.`);
    process.exit(1);
  }
}
