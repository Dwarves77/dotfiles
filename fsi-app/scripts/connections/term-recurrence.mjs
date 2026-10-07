#!/usr/bin/env node
// term-recurrence.mjs (lane G5-TERMS, 2026-10-06, buildout plan Stage 5): the runtime that COUNTS repeated
// mentions of a term the system does not hold, PROPOSES it, and ADOPTS it by rule. Dry by default; `--mode
// apply` writes through the guarded path of scripts/lib/db.mjs (rule 015). The counting, the adoption rule
// and the write plan are src/lib/connections/term-recurrence.mjs (pure); this file only reads and writes.
//
// WHAT IT READS (nothing is a second copy of existing logic):
//   - intelligence_items (verified, not archived): theme_candidate (detector theme-candidate),
//     operational_scenario_tags against the glossary derive-tags.mjs already extracts from the system prompt
//     (detector scenario-tag), compliance_object_candidates (detector compliance-object, the capture that
//     replaces the silent drop in parse-output.ts, migration 355), and source_id (the distinct-source count);
//   - integrity_flags created_by `intake-entity-link`: the unresolved, ambiguous and unknown-standard
//     mentions entity-resolve.mjs already aggregates (detector entity-link, kind standard);
//   - vocabulary_mentions already written by apply-record-briefs.mjs (detector brief-terms, the optional
//     `mentioned_terms` a session brief author emits), and vocabulary_terms (existing status, labels).
//     F14: this collector READS the two tables it writes.
//
// ADOPTION. A term adopts when distinct_items >= CITATION_FREQUENCY_PROMOTION_THRESHOLD (imported from
// src/lib/trust.ts Q7_CONFIG through jiti, never typed here) and distinct_sources >= 2. No human step. A
// proposed term is visible to the admin through the table only. A retired term (admin) is never touched.
//
// RULE 17. This is a step in downstream-chain after tag-proposals (its mode is the chain's RUN_MODE, which
// the chained-dry-guard resolves to dry while scrape_cadence is off), and its counts (detected per detector,
// proposed, adopted) are read into the downstream-chain artifact by emit-downstream-chain-artifact.mjs.
//
// TOLERANCE BEFORE MIGRATION 355 IS APPLIED. A dry run reads the tables and the new column when present; if
// they are absent it reports `tables_absent` / `compliance_candidates_column_absent` in the summary and
// counts what it can. An apply refuses (exit 1) when the vocabulary tables are absent.
//
// Usage: node scripts/connections/term-recurrence.mjs [--mode dry|apply] [--out <dir>]
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../maintenance/lib/cli.mjs";
import { isAbsentError, readTolerant } from "../lib/absent-tolerant.mjs";
import {
  DETECTORS,
  ADOPTION_MIN_SOURCES,
  adoptionRuleText,
  mentionsFromEntityLinkFlags,
  mentionsFromThemeCandidates,
  mentionsFromScenarioTags,
  mentionsFromComplianceCandidates,
  buildTermPlan,
  applyTermPlan,
  ENTITY_LINK_CREATED_BY,
} from "../../src/lib/connections/term-recurrence.mjs";

export const STEP = "term-recurrence";
export const CITE = Object.freeze({
  skill: "buildout-plan-2026-10-04",
  reason:
    "G5-TERMS (plan Stage 5): term-recurrence counts repeated mentions of terms no code vocabulary holds, " +
    "writes vocabulary_terms (proposed, then adopted by rule at distinct_items >= trust.ts " +
    "CITATION_FREQUENCY_PROMOTION_THRESHOLD and distinct_sources >= 2) and vocabulary_mentions. Never writes " +
    "intelligence_items, never overwrites a retired term.",
});

const PREVIEW_LIMIT = 20;


/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   readItems: (withCandidates: boolean) => Promise<object[]>,
 *   readEntityLinkFlags: () => Promise<object[]>,
 *   readTerms: () => Promise<object[]>,
 *   readMentions: () => Promise<object[]>,
 *   heldScenarioTags: Set<string>|string[],
 *   minItems: number,
 *   now?: () => string,
 *   writers?: { insertTerms: Function, updateTerm: Function, insertMentions: Function },
 *   countTermsByStatus?: () => Promise<Record<string, number>>,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const summary = { step: STEP, mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };
  const notes = [];

  // Items: try with the migration-355 column; fall back without it (dry tolerance).
  let items;
  let candidatesAbsent = false;
  try {
    items = await deps.readItems(true);
  } catch (e) {
    if (!isAbsentError(e)) throw e;
    candidatesAbsent = true;
    items = await deps.readItems(false);
  }
  if (candidatesAbsent) notes.push("compliance_candidates_column_absent");
  const flags = await deps.readEntityLinkFlags();
  const terms = await readTolerant(() => deps.readTerms());
  const mentions = await readTolerant(() => deps.readMentions());
  const tablesAbsent = terms.absent || mentions.absent;
  if (tablesAbsent) notes.push("tables_absent");

  if (apply && (tablesAbsent || candidatesAbsent)) {
    summary.exitCode = 1;
    summary.note = `REFUSED; migration 355 is not applied (${notes.join(", ")}). Nothing written.`;
    summary.counts = { eligible_items: items.length };
    return summary;
  }

  const sourceByItemId = new Map(items.map((it) => [it.id, it.source_id ?? null]));
  const derivedByDetector = {
    "entity-link": mentionsFromEntityLinkFlags(flags, sourceByItemId),
    "theme-candidate": mentionsFromThemeCandidates(items),
    "scenario-tag": mentionsFromScenarioTags(items, new Set(deps.heldScenarioTags)),
    "compliance-object": mentionsFromComplianceCandidates(items),
  };
  const derived = Object.values(derivedByDetector).flat();

  // Persisted mentions (brief-terms written at apply, and every earlier pass) back into the mention shape;
  // only mentions of an ELIGIBLE item count, so an archived or unverified item stops counting.
  const termById = new Map(terms.rows.map((t) => [t.id, t]));
  const persisted = [];
  for (const row of mentions.rows) {
    const t = termById.get(row.term_id);
    if (!t || !sourceByItemId.has(row.item_id)) continue;
    persisted.push({
      kind: t.kind, term_key: t.term_key, label: t.label, item_id: row.item_id,
      source_id: row.source_id ?? sourceByItemId.get(row.item_id) ?? null, detector: row.detector, surface_text: row.surface_text,
    });
  }

  const plan = buildTermPlan({ derived, persisted, existingTerms: terms.rows, now, minItems: deps.minItems });

  summary.counts = {
    eligible_items: items.length,
    entity_link_flags_read: flags.length,
    detected_by_detector: plan.counts.detected_by_detector,
    derived_this_pass_by_detector: Object.fromEntries(DETECTORS.map((d) => [d, (derivedByDetector[d] ?? []).length])),
    terms_total: plan.counts.terms_total,
    proposed: plan.counts.proposed,
    adopted: plan.counts.adopted,
    newly_adopted: plan.counts.newly_adopted,
    plan: { insert: plan.counts.inserted, update: plan.counts.updated, unchanged: plan.counts.unchanged, skipped_retired: plan.counts.skipped_retired, new_mentions: plan.counts.new_mentions },
    adoption_rule: adoptionRuleText(deps.minItems),
    min_items: deps.minItems,
    min_sources: ADOPTION_MIN_SOURCES,
    notes,
    preview: plan.terms
      .filter((t) => t.action !== "unchanged")
      .slice(0, PREVIEW_LIMIT)
      .map((t) => ({ kind: t.kind, term_key: t.term_key, action: t.action, status: t.next.status, distinct_items: t.next.distinct_items, distinct_sources: t.next.distinct_sources })),
  };

  if (!apply) {
    summary.note =
      `DRY; ${plan.counts.inserted} term(s) would be inserted, ${plan.counts.updated} updated, ` +
      `${plan.counts.newly_adopted} newly adopted, ${plan.counts.new_mentions} mention(s) written. Nothing written. ` +
      `Apply with: node scripts/connections/term-recurrence.mjs --mode apply`;
    return summary;
  }

  const written = await applyTermPlan(plan, deps.writers);
  summary.applied = written.terms_inserted + written.terms_updated;
  summary.wrote = written;
  summary.read_back = deps.countTermsByStatus ? await deps.countTermsByStatus() : {};
  summary.note =
    `Wrote ${written.terms_inserted} new term(s), updated ${written.terms_updated}, inserted ${written.mentions_inserted} mention(s); ` +
    `${plan.counts.newly_adopted} term(s) adopted by rule this pass. Writes vocabulary_terms and vocabulary_mentions only.`;
  return summary;
}

const ITEM_COLS = "id, source_id, theme_candidate, operational_scenario_tags";

/**
 * Real wiring for main(): reads through db.mjs's paginated readAll, writes through its guarded helpers, the
 * threshold from trust.ts through jiti. EXPORTED so the npmtest can prove the real wiring resolves.
 */
export async function buildDeps() {
  const { readAll, guardedInsertMany, guardedUpdateByIds } = await import("../lib/db.mjs");
  const { createJiti } = await import("jiti");
  const { SCENARIO_TAG_VALUES } = await import("../../src/lib/connections/derive-tags.mjs");
  // The threshold is trust.ts's own constant, imported (jiti: trust.ts uses "@/" aliases), never retyped.
  const root = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(root, "src") } });
  const trust = await jiti.import("../../src/lib/trust.ts");
  const minItems = trust.Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD;
  if (!Number.isInteger(minItems)) throw new Error("term-recurrence: trust.ts Q7_CONFIG.CITATION_FREQUENCY_PROMOTION_THRESHOLD is not an integer");

  const live = (q) => q.eq("provenance_status", "verified").eq("is_archived", false);
  return {
    minItems,
    heldScenarioTags: new Set(SCENARIO_TAG_VALUES),
    readItems: (withCandidates) =>
      readAll("intelligence_items", withCandidates ? `${ITEM_COLS}, compliance_object_candidates` : ITEM_COLS, { match: live }),
    readEntityLinkFlags: () =>
      readAll("integrity_flags", "id, subject_ref, created_by, recommended_actions", {
        match: (q) => q.eq("created_by", ENTITY_LINK_CREATED_BY),
      }),
    readTerms: () => readAll("vocabulary_terms", "*"),
    readMentions: () => readAll("vocabulary_mentions", "term_id, item_id, source_id, detector, surface_text"),
    writers: {
      insertTerms: (rows) => guardedInsertMany("vocabulary_terms", rows, { cite: CITE, select: "id, kind, term_key" }),
      // One id per call; the patch never carries label or term_key (applyTermPlan strips them).
      updateTerm: (id, patch) => guardedUpdateByIds("vocabulary_terms", [id], patch, { cite: CITE }),
      insertMentions: (rows) => guardedInsertMany("vocabulary_mentions", rows, { cite: CITE, select: "id" }),
    },
    countTermsByStatus: async () => {
      const rows = await readAll("vocabulary_terms", "id, status");
      const out = { proposed: 0, adopted: 0, retired: 0 };
      for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
      return out;
    },
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({ step: STEP, main, needsDb: true, buildDeps });
}
