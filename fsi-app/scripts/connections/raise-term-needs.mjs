#!/usr/bin/env node
// SHARED-WRITER: integrity_flags
// raise-term-needs.mjs (lane G5-NEED, 2026-10-07, buildout plan Stage 5 last clause): raises and closes the
// `term-need:` source search targets by rule. Dry by default; `--mode apply` writes integrity_flags through the
// guarded path of scripts/lib/db.mjs (rule 015). The planning is src/lib/connections/term-needs.mjs (pure);
// the dedup-before-insert / resolve-if-stale decision is propose-tags.mjs's planReflect, imported, not copied.
//
// WHAT IT READS
//   - vocabulary_terms and vocabulary_mentions (migration 355, written by term-recurrence.mjs): the adopted
//     terms and the items that mention them (F14: this runtime reads what the collector writes);
//   - intelligence_items (type, provenance, origin, primary source) and sources (base_tier, tier_override) of
//     the mentioning items: the authoritative-holding test, `authorityFloorFor` through term-needs.mjs;
//   - integrity_flags `lineage-gap:absent-parent` and the held corpus: planLineageGapTargets (the same planner
//     scripts/maintenance/lineage-gap-targets.mjs uses) turns open absent-parent flags into identifiers;
//   - integrity_flags `term-need:*` that are open: what to keep, what to close.
//
// WHAT IT WRITES (only integrity_flags, namespace term-need:). An adopted term with no authoritative holding
// gets ONE open need (subject_ref the term id), by rule, need text from kind and label. A lineage identifier
// that is not a CELEX id gets one need of kind standard (subject_ref `lineage:<identifier>`). A CELEX
// identifier gets no flag: it is an explicit target for the EUR-Lex register walker
// (run-source-sweep.mjs --targets-file), counted here and listed in the summary. An open need no longer
// reproduced (the holding exists, the term retired, the parent now held) is resolved by rule. No human step.
//
// READ BY: scripts/research/research-walker.mjs `--holdings-needs` (the one need reader,
// question-answers/data.mjs loadOpenNeedTargets with includeTermNeeds), whose artifact counts record how many
// needs were read, searched and returned candidates.
//
// RULE 17. A step in downstream-chain right after term-recurrence (its mode is the chain's RUN_MODE, which the
// chained-dry-guard resolves to dry while scrape_cadence is off); emit-downstream-chain-artifact.mjs reads this
// step's counts into metrics.term_needs.
//
// TOLERANCE BEFORE MIGRATION 355 IS APPLIED. A dry run reports `tables_absent` and plans lineage needs only;
// an apply refuses (exit 1).
//
// Usage: node scripts/connections/raise-term-needs.mjs [--mode dry|apply] [--out <dir>]
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";
import { readTolerant } from "../lib/absent-tolerant.mjs";
import { planReflect } from "./propose-tags.mjs";
import { planTermNeeds, planLineageNeeds } from "../../src/lib/connections/term-needs.mjs";
import { planLineageGapTargets, LINEAGE_GAP_CREATED_BY } from "../../src/lib/entities/lineage-backfill.mjs";
import { TERM_NEED_CREATED_BY } from "../turns/question-answers/data.mjs";

export const STEP = "raise-term-needs";
export const RESOLVE_NOTE = "term-need closed by rule: the need is no longer reproduced (an authoritative holding exists, the term is no longer adopted, or the lineage parent is now held).";
export const CITE = Object.freeze({
  skill: "buildout-plan-2026-10-04",
  reason:
    "G5-NEED (plan Stage 5): raise one term-need integrity_flags row per adopted vocabulary term with no held item " +
    "whose primary source base tier is at or above the item type authority floor, and one per non-CELEX absent " +
    "lineage parent; close each by rule when it stops reproducing. Writes integrity_flags in the term-need: " +
    "namespace only, never any other table.",
});

const CELEX_SAMPLE = 50;


/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   readTerms: () => Promise<object[]>, readMentions: () => Promise<object[]>,
 *   readItemsByIds: (ids: string[]) => Promise<object[]>, readSourcesByIds: (ids: string[]) => Promise<object[]>,
 *   readOpenNeeds: () => Promise<object[]>, readLineageFlags: () => Promise<object[]>, readCorpus: () => Promise<object[]>,
 *   insertMany: (rows: object[]) => Promise<{inserted: number, snapshot: string|null}>,
 *   resolveIds: (ids: string[], note: string) => Promise<{updated: number, snapshot?: string|null}>,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: STEP, mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };
  const notes = [];

  const terms = await readTolerant(() => deps.readTerms());
  const mentions = await readTolerant(() => deps.readMentions());
  const tablesAbsent = terms.absent || mentions.absent;
  if (tablesAbsent) notes.push("tables_absent");
  if (apply && tablesAbsent) {
    summary.exitCode = 1;
    summary.note = `REFUSED; migration 355 is not applied (${notes.join(", ")}). Nothing written.`;
    return summary;
  }

  const adopted = terms.rows.filter((t) => t.status === "adopted");
  const adoptedIds = new Set(adopted.map((t) => t.id));
  const relevantMentions = mentions.rows.filter((m) => adoptedIds.has(m.term_id));
  const itemIds = [...new Set(relevantMentions.map((m) => m.item_id))].sort();
  const itemRows = itemIds.length ? await deps.readItemsByIds(itemIds) : [];
  const items = new Map(itemRows.map((i) => [i.id, i]));
  const sourceIds = [...new Set(itemRows.map((i) => i.source_id).filter(Boolean))].sort();
  const sourceRows = sourceIds.length ? await deps.readSourcesByIds(sourceIds) : [];
  const sources = new Map(sourceRows.map((s) => [s.id, s]));

  const termPlan = planTermNeeds({ terms: terms.rows, mentions: relevantMentions, items, sources });

  const lineageFlags = await deps.readLineageFlags();
  const corpus = await deps.readCorpus();
  const lineage = planLineageNeeds(planLineageGapTargets(lineageFlags, corpus).targets);

  const fresh = [...termPlan.fresh, ...lineage.fresh];
  const existingOpen = await deps.readOpenNeeds();
  const plan = planReflect(existingOpen, fresh);

  summary.counts = {
    adopted_terms: termPlan.counts.adopted_terms,
    terms_with_holding: termPlan.counts.satisfied,
    term_needs: termPlan.counts.needs,
    lineage_open_flags: lineageFlags.length,
    lineage_distinct_identifiers: lineage.counts.distinct_identifiers,
    lineage_celex_targets: lineage.counts.celex_targets,
    lineage_non_celex_needs: lineage.counts.non_celex_needs,
    open_needs_before: existingOpen.length,
    would_insert: plan.newRows.length,
    would_resolve: plan.staleIds.length,
    unchanged: plan.unchanged,
    notes,
  };
  summary.celex_targets = lineage.celex.slice(0, CELEX_SAMPLE);

  if (!apply) {
    summary.note =
      `DRY; ${plan.newRows.length} need(s) would be raised, ${plan.staleIds.length} closed, ${plan.unchanged} unchanged; ` +
      `${lineage.counts.celex_targets} CELEX id(s) are explicit register targets. Nothing written. ` +
      `Apply with: node scripts/connections/raise-term-needs.mjs --mode apply`;
    return summary;
  }

  let inserted = 0;
  if (plan.newRows.length) {
    const r = await deps.insertMany(plan.newRows);
    inserted = r.inserted ?? 0;
  }
  let resolved = 0;
  if (plan.staleIds.length) {
    const r = await deps.resolveIds(plan.staleIds, RESOLVE_NOTE);
    resolved = r.updated ?? 0;
  }
  summary.applied = inserted + resolved;
  summary.counts.write = { inserted, resolved };
  summary.read_back = { open_needs: (await deps.readOpenNeeds()).length };
  if (inserted < plan.newRows.length || resolved < plan.staleIds.length) summary.exitCode = 1;
  summary.note = `Raised ${inserted}/${plan.newRows.length}, closed ${resolved}/${plan.staleIds.length}; ${summary.read_back.open_needs} open term-need(s) remain. Writes integrity_flags (term-need:) only.`;
  return summary;
}

const ITEM_COLS = "id, item_type, provenance_status, is_archived, origin_class, source_id";
const FLAG_COLS = "id, subject_ref, created_by, description, recommended_actions, status";

/** Real wiring for main(): reads through db.mjs, writes through its guarded helpers. EXPORTED for the test. */
export async function buildDeps() {
  const { readAll, readAllByIds, guardedInsertMany, guardedUpdateByIds } = await import("../lib/db.mjs");
  return {
    readTerms: () => readAll("vocabulary_terms", "id, kind, term_key, label, status, distinct_items, distinct_sources"),
    readMentions: () => readAll("vocabulary_mentions", "term_id, item_id"),
    readItemsByIds: (ids) => readAllByIds("intelligence_items", ITEM_COLS, ids),
    readSourcesByIds: (ids) => readAllByIds("sources", "id, base_tier, tier_override", ids),
    readOpenNeeds: () =>
      readAll("integrity_flags", FLAG_COLS, {
        match: (q) => q.in("created_by", [...TERM_NEED_CREATED_BY]).in("status", ["open", "in_review"]),
      }),
    readLineageFlags: () =>
      readAll("integrity_flags", FLAG_COLS, {
        match: (q) => q.eq("created_by", LINEAGE_GAP_CREATED_BY).in("status", ["open", "in_review"]),
      }),
    readCorpus: () => readAll("intelligence_items", "id, title, instrument_identifier", { match: (q) => q.eq("is_archived", false) }),
    insertMany: (rows) => guardedInsertMany("integrity_flags", rows, { cite: CITE, select: "id" }),
    resolveIds: (ids, note) =>
      guardedUpdateByIds(
        "integrity_flags",
        ids,
        { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: `${STEP}.mjs`, resolution_note: note },
        { cite: CITE, applyMatch: (q) => q.in("status", ["open", "in_review"]) },
      ),
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({ step: STEP, main, needsDb: true, buildDeps });
}
