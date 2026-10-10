// term-needs.mjs (lane G5-NEED, 2026-10-07, buildout plan Stage 5 last clause and the Stage 2 lineage item):
// PURE planning of source search targets. Node builtins only, no I/O: every read and write is injected by
// scripts/connections/raise-term-needs.mjs, so this module runs in the no-npm discipline job.
//
// THE CLASS, NOT THE EXAMPLE (CLAUDE.md rule 19). The question this module answers: "which things does the
// system know it needs a better source for, and how is that stated so a free discovery runtime can search it?"
// Two inputs reach it: (1) an ADOPTED vocabulary term (any of the six kinds: standard, material, theme,
// scenario, compliance_object, term) with no authoritative holding; (2) an absent lineage parent whose
// identifier is not a CELEX id. A CELEX id is not a need at all, it is an explicit target for the EUR-Lex
// register walker (run-source-sweep.mjs --targets-file); only the split is decided here.
//
// "AUTHORITATIVE HOLDING" (the floor this module reuses, never a second table). A held item qualifies when it
// is verified, not archived, not sourced only from Community (ADR-041), has a primary source, and that source's
// tier is at or above the item type's authority floor: `authorityFloorFor(item_type)` in
// src/lib/agent/source-blocks.mjs, the JS mirror of the floor table validate_item_provenance criterion 3 reads
// (migration 141: regulation family <= 2, research_finding <= 4, technology family <= 5; migrations 138, 202,
// 302). A type with no floor (market_signal, initiative, regional_data, named exempt in the credibility skill)
// needs only a rated source. The tier compared is the source's STATIC base_tier, or its tier_override, the one
// sanctioned escape: dynamic effective_tier never confers reg-fact eligibility (the moat, SC-9, fitness F12).
// Deliberate simplification, named: the standard own-authoring-body floor of 4 (migration 202) is NOT applied
// here, so a standard needs a floor-2 holding to close its need; the stricter reading keeps looking.
//
// A need is raised and closed by rule; no human step. Closing is the reflect convention
// (scripts/connections/propose-tags.mjs planReflect): an open need no longer reproduced by the fresh plan is
// resolved by the writer.

import { TERM_NEED_NAMESPACE, TERM_NEED_ACTION, createdBy } from "./flag-namespaces.mjs";
import { authorityFloorFor } from "../agent/source-blocks.mjs";
import { VALIDATORS } from "../entities/crosswalk.mjs";

/** The rule text recorded on every need, so a later change to the rule never rewrites what raised it. */
export const TERM_NEED_RULE = "adopted term with no held item whose primary source base tier is at or above the item type authority floor";
const LINEAGE_NEED_RULE = "absent lineage parent whose identifier is not a CELEX id";
const DESCRIPTION_MAX = 480;
const SAMPLE_CITING_ITEMS = 5;

const KIND_PHRASE = Object.freeze({
  standard: "standard",
  material: "material",
  theme: "topic",
  scenario: "operational scenario",
  compliance_object: "compliance object",
  term: "term",
});

/** The need in words, by rule from kind and label. Pure. @param {string} kind @param {string} label */
export function needTextFor(kind, label) {
  const phrase = KIND_PHRASE[kind] ?? "term";
  const clean = String(label ?? "").replace(/\s+/g, " ").trim();
  return `${clean} ${phrase} authoritative source`;
}

/**
 * True when `item` is an authoritative holding given its primary `source` row (see the header). Pure.
 * @param {{item_type?:string, provenance_status?:string, is_archived?:boolean, origin_class?:string|null, source_id?:string|null}|null} item
 * @param {{base_tier?:number|null, tier_override?:number|null}|null} source
 */
export function holdingQualifies(item, source) {
  if (!item || !source) return false;
  if (item.is_archived) return false;
  if (item.provenance_status !== "verified") return false;
  if (item.origin_class === "community" || item.origin_class === "community-corroborated") return false;
  if (!item.source_id) return false;
  const tier = source.tier_override ?? source.base_tier ?? null;
  if (!Number.isInteger(tier)) return false;
  const floor = authorityFloorFor(item.item_type);
  return floor == null ? true : tier <= floor;
}

/** The flag row of one need. Pure. */
export function termNeedRow({ term, need, counts, subjectRef = null, rule = TERM_NEED_RULE, extra = {} }) {
  return {
    category: "coverage_gap",
    subject_type: "system",
    subject_ref: subjectRef ?? term.id,
    status: "open",
    created_by: createdBy(TERM_NEED_NAMESPACE, term.kind),
    description: `Term need: ${need}`.slice(0, DESCRIPTION_MAX),
    recommended_actions: [
      {
        action: TERM_NEED_ACTION,
        need,
        kind: term.kind,
        term_key: term.term_key ?? null,
        term_id: term.id ?? null,
        distinct_items: counts?.distinct_items ?? null,
        distinct_sources: counts?.distinct_sources ?? null,
        rule,
        rationale: `${rule}; a source stating the need in words is wanted`,
        ...extra,
      },
    ],
  };
}

/**
 * One need per adopted term that has no authoritative holding. Pure.
 * @param {{
 *   terms: Array<{id:string, kind:string, term_key:string, label:string, status:string, distinct_items?:number, distinct_sources?:number}>,
 *   mentions: Array<{term_id:string, item_id:string}>,
 *   items: Map<string, object>,   eligible items by id (verified-or-not is judged by holdingQualifies)
 *   sources: Map<string, object>, sources by id
 * }} args
 * @returns {{fresh: Array<{subjectRef:string, row:object}>, counts:{adopted_terms:number, satisfied:number, needs:number}}}
 */
export function planTermNeeds({ terms, mentions, items, sources }) {
  const itemsByTerm = new Map();
  for (const m of mentions ?? []) {
    if (!itemsByTerm.has(m.term_id)) itemsByTerm.set(m.term_id, new Set());
    itemsByTerm.get(m.term_id).add(m.item_id);
  }
  const adopted = (terms ?? []).filter((t) => t.status === "adopted").sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const fresh = [];
  let satisfied = 0;
  for (const t of adopted) {
    const held = [...(itemsByTerm.get(t.id) ?? [])].some((id) => {
      const it = items.get(id);
      return holdingQualifies(it, it ? sources.get(it.source_id) ?? null : null);
    });
    if (held) {
      satisfied += 1;
      continue;
    }
    fresh.push({ subjectRef: t.id, row: termNeedRow({ term: t, need: needTextFor(t.kind, t.label), counts: t }) });
  }
  return { fresh, counts: { adopted_terms: adopted.length, satisfied, needs: fresh.length } };
}

/** The uppercase bare CELEX id of `identifier` (bare or with a CELEX prefix, any case), or null. Pure. @param {unknown} identifier */
export function celexOf(identifier) {
  const bare = String(identifier ?? "").trim().replace(/^CELEX[:\s]*/i, "").toUpperCase();
  return bare && VALIDATORS.CELEX(bare) ? bare : null;
}

/**
 * Split lineage-gap targets (lineage-backfill.mjs planLineageGapTargets `targets`) into CELEX ids (explicit
 * targets for the EUR-Lex register walker) and a standard need per other identifier. No Federal Register shape
 * is produced by the lineage detector today (entity-resolve.mjs detects only regulation numbers and CELEX), so
 * there is no Federal Register branch. Pure.
 * @param {Array<{identifier:string, relationship:string, citing_item_id:string, flag_id?:string}>} targets
 */
export function planLineageNeeds(targets) {
  const byId = new Map();
  for (const t of Array.isArray(targets) ? targets : []) {
    const identifier = String(t?.identifier ?? "").trim();
    if (!identifier) continue;
    const key = celexOf(identifier) ?? identifier.toLowerCase();
    if (!byId.has(key)) byId.set(key, { identifier, celex: celexOf(identifier), relationships: new Set(), citing: new Set() });
    const e = byId.get(key);
    if (t.relationship) e.relationships.add(t.relationship);
    if (t.citing_item_id) e.citing.add(t.citing_item_id);
  }
  const celex = [];
  const fresh = [];
  for (const [key, e] of [...byId.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (e.celex) {
      celex.push(e.celex);
      continue;
    }
    const term = { id: null, kind: "standard", term_key: key };
    const need = needTextFor("standard", e.identifier);
    fresh.push({
      subjectRef: `lineage:${key}`,
      row: termNeedRow({
        term,
        need,
        counts: null,
        subjectRef: `lineage:${key}`,
        rule: LINEAGE_NEED_RULE,
        extra: { identifier: e.identifier, relationships: [...e.relationships].sort(), citing_item_ids: [...e.citing].sort().slice(0, SAMPLE_CITING_ITEMS) },
      }),
    });
  }
  return { celex, fresh, counts: { distinct_identifiers: byId.size, celex_targets: celex.length, non_celex_needs: fresh.length } };
}
