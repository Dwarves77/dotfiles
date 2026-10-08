// data.mjs: the reads and the pure need assembly shared by the needs export and the URL apply step (lane
// G5-SEARCH, 2026-10-07).
//
// ONE home for "what an open source need is", so the export that hands an author the request and the apply step
// that validates the author's batch read the SAME flags the SAME way. Every function takes its database reads as
// injected deps ({ readAll, readAllByIds }, the scripts/lib/db.mjs shapes) so the fixture tests run with no
// database, and nothing here writes.
//
// REUSE. The term-need and holdings-need targets are read by question-answers/data.mjs `loadOpenNeedTargets`
// (includeTermNeeds) and shaped by its `needOfFlag`; the absent lineage parents are planned by
// `planLineageGapTargets`, the planner the lineage consumers use; the authority floors are `authorityFloorFor`.
// Only the flywheel-gap read and the applied-marker bookkeeping are new.

import { GAP_NAMESPACE } from "../../../src/lib/connections/flag-namespaces.mjs";
import { LINEAGE_GAP_CREATED_BY, planLineageGapTargets } from "../../../src/lib/entities/lineage-backfill.mjs";
import { celexOf } from "../../../src/lib/connections/term-needs.mjs";
import { authorityFloorFor } from "../../../src/lib/agent/source-blocks.mjs";
import { OPEN_STATUSES, FLAG_COLUMNS, loadOpenNeedTargets, needOfFlag } from "../question-answers/data.mjs";
import { needKindOf, needKey, OUTPUT_FOR_KIND } from "./schema.mjs";

/** resolved_by of every flag the URL apply step closes: how the export finds a need already served. */
export const RESOLVED_BY = "apply-need-urls";
const FLAG_COLUMNS_FULL = `${FLAG_COLUMNS}, resolved_by, resolution_note`;
const CORPUS_COLUMNS = "id, title, instrument_identifier";

/** Every need states the same bar; only what the URL feeds differs by kind. */
const FLOORS = Object.freeze({
  regulation_family: authorityFloorFor("regulation"),
  research_finding: authorityFloorFor("research_finding"),
  technology_family: authorityFloorFor("technology"),
  other_types: "any rated source",
});
const USED_FOR = Object.freeze({
  census_worklist: "the URL becomes a census_worklist row (lane C) tied to the source registered for its host, so the population turn reads and mints it",
  portal_link_candidate: "the URL becomes a portal_link_candidates row tied to the source registered for its host, so the ledger consume classifies it",
});

/** What satisfies a need of this kind. Pure. @param {string} kind */
function satisfiesFor(kind) {
  const output = OUTPUT_FOR_KIND[kind];
  return {
    requirement: "one authoritative URL: a page of the institution that publishes the thing the need names, at or above the authority floor of the item type that would hold it",
    tier_floors: { ...FLOORS },
    rating: "the source is rated from its host by the institution class table; an unrated host needs a host_verdict in the host-verdicts entry format; the tier is never written in the batch",
    output,
    used_for: USED_FOR[output],
  };
}

/** The marker recorded in the resolution_note of a flag the apply closes (the export reads it back). Pure. */
export function buildAppliedNote({ key, url, sourceId, tier, kind, output, batch }) {
  return `need-url applied: need_key=${key} url=${url} source_id=${sourceId} tier=${tier} kind=${kind} output=${output} batch=${batch}`;
}

/** The key and url of an applied note, or null when the note is not one. Pure. */
export function parseAppliedNote(note) {
  const text = String(note ?? "");
  if (!text.startsWith("need-url applied:")) return null;
  const key = /(?:^|\s)need_key=(\S+)/.exec(text);
  const url = /(?:^|\s)url=(\S+)/.exec(text);
  return key && url ? { key: key[1], url: url[1] } : null;
}

/**
 * One flag as a need, or a skip reason. Pure.
 * @param {object} flag integrity_flags row
 * @param {{lineageTargets?: Map<string, Array<{identifier:string, relationship:string}>>}} [o] absent parents by lineage flag id
 * @returns {{need: object}|{skip: string}}
 */
export function needFromFlag(flag, { lineageTargets = new Map() } = {}) {
  const kind = needKindOf(flag?.created_by);
  if (!kind) return { skip: "not a need namespace" };
  let text;
  let context;
  if (kind === "term-need" || kind === "holdings-need") {
    const n = needOfFlag(flag);
    if (!n) return { skip: "no structured find-source need in recommended_actions" };
    text = n.need;
    context = kind === "term-need"
      ? { term_kind: n.kind ?? null, term_id: flag.subject_ref ?? null }
      : { item_id: n.item_id, surface: n.surface, product_question: n.product_question };
  } else if (kind === "flywheel-gap") {
    text = String(flag.description ?? "").replace(/\s+/g, " ").trim();
    if (!text) return { skip: "gap flag has no description" };
    context = { gap_type: String(flag.created_by).slice(GAP_NAMESPACE.length), theme_id: flag.subject_ref ?? null };
  } else {
    const absent = lineageTargets.get(flag.id) ?? [];
    if (!absent.length) return { skip: "no absent parent (every named parent is held, or the flag names none)" };
    text = `Parent instrument absent from holdings: ${absent.map((a) => `${a.identifier} (${a.relationship})`).join("; ")}`;
    context = { citing_item_id: flag.subject_ref ?? null, identifiers: absent.map((a) => a.identifier), celex: absent.map((a) => celexOf(a.identifier)).filter(Boolean) };
  }
  return {
    need: {
      need_id: flag.id,
      kind,
      subject_ref: flag.subject_ref ?? null,
      text,
      key: needKey({ kind, subject_ref: flag.subject_ref ?? "", text }),
      created_at: flag.created_at ?? null,
      context,
      output: OUTPUT_FOR_KIND[kind],
      satisfies: satisfiesFor(kind),
    },
  };
}

/** Open flags of the two gap namespaces the shared need reader does not cover. */
async function readGapAndLineage({ readAll }) {
  const gaps = await readAll("integrity_flags", FLAG_COLUMNS, {
    orderBy: "id",
    match: (q) => q.like("created_by", `${GAP_NAMESPACE}%`).in("status", [...OPEN_STATUSES]),
  });
  const lineage = await readAll("integrity_flags", FLAG_COLUMNS, {
    orderBy: "id",
    match: (q) => q.eq("created_by", LINEAGE_GAP_CREATED_BY).in("status", [...OPEN_STATUSES]),
  });
  return { gaps, lineage };
}

/** The held corpus the lineage planner resolves parents against (non-archived items only). */
export async function loadCorpus({ readAll }) {
  return readAll("intelligence_items", CORPUS_COLUMNS, { orderBy: "id", match: (q) => q.eq("is_archived", false) });
}

/** Absent lineage parents grouped by flag id. Pure over the planner. */
export function lineageTargetsByFlag(lineageFlags, corpus) {
  const out = new Map();
  for (const t of planLineageGapTargets(lineageFlags, corpus).targets) {
    if (!out.has(t.flag_id)) out.set(t.flag_id, []);
    out.get(t.flag_id).push({ identifier: t.identifier, relationship: t.relationship });
  }
  return out;
}

/**
 * Every open need of the four kinds as needs, oldest first, with what was skipped and why.
 * @returns {Promise<{needs: object[], residue: Array<{flag_id:string, kind:string|null, reason:string}>, counts: {open_by_kind: Record<string,number>, skipped_no_absent_parent: number, unparseable: number}}>}
 */
export async function collectOpenNeeds(deps) {
  const termAndHoldings = await loadOpenNeedTargets(deps, { includeTermNeeds: true });
  const { gaps, lineage } = await readGapAndLineage(deps);
  const lineageTargets = lineage.length ? lineageTargetsByFlag(lineage, await loadCorpus(deps)) : new Map();
  const all = [...termAndHoldings, ...gaps, ...lineage];
  const counts = { open_by_kind: {}, skipped_no_absent_parent: 0, unparseable: 0 };
  const needs = [];
  const residue = [];
  for (const f of all) {
    const kind = needKindOf(f.created_by);
    counts.open_by_kind[kind] = (counts.open_by_kind[kind] ?? 0) + 1;
    const r = needFromFlag(f, { lineageTargets });
    if (r.need) { needs.push(r.need); continue; }
    if (kind === "lineage-gap") counts.skipped_no_absent_parent += 1;
    else { counts.unparseable += 1; residue.push({ flag_id: f.id, kind, reason: r.skip }); }
  }
  const age = (n) => (n.created_at ? Date.parse(n.created_at) : Number.MAX_SAFE_INTEGER);
  needs.sort((a, b) => age(a) - age(b) || (a.need_id < b.need_id ? -1 : a.need_id > b.need_id ? 1 : 0));
  return { needs, residue, counts };
}

/** The need keys the apply step already served (resolved flags it closed), mapped to the url applied. */
export async function loadAppliedKeys({ readAll }) {
  const rows = await readAll("integrity_flags", FLAG_COLUMNS_FULL, {
    orderBy: "id",
    match: (q) => q.eq("resolved_by", RESOLVED_BY).eq("status", "resolved"),
  });
  const out = new Map();
  for (const r of rows) {
    const n = parseAppliedNote(r.resolution_note);
    if (n) out.set(n.key, n.url);
  }
  return out;
}

/** The named flags with their resolution fields, whatever their state. */
export async function loadFlagsByIds({ readAllByIds }, ids) {
  if (!ids.length) return [];
  return readAllByIds("integrity_flags", FLAG_COLUMNS_FULL, ids);
}
