// anticipate.mjs — ANTICIPATED-COVERAGE detection (flywheel U5). PURE, no DB, no LLM, $0.
//
// item_forward_events (migration 274/275, the forward-events harness) holds obligation-bound future
// dates already extracted from a corpus item's own grounded content — an entry-into-force, a
// compliance deadline, a phase-in step. Every row already belongs to a real item
// (intelligence_item_id NOT NULL), so the item ITSELF is never "missing" from the corpus. What this
// module measures is narrower and still real: whether the TOPIC that future obligation concerns has
// any OTHER corpus item addressing it — i.e. whether the corpus has built out dedicated follow-up
// coverage for a milestone that is coming due, or whether the one item that happens to mention the
// date is the corpus's only foothold on that topic.
//
// WHY TOPIC OVERLAP, NOT INSTRUMENT-KEY OVERLAP. canonical_instrument_key is IDENTITY, not grouping
// (WO-27, ADR-021, see discover.mjs's same_instrument-removal note): the live corpus's own partial
// unique index (migration 200) forbids two verified+live items from sharing a key, so "how many OTHER
// items share this item's instrument key" is trivially always zero and would flag every single
// forward event as "no coverage" — a signal with no discriminating power. topic_tags is a real
// many-to-many grouping (multiple items legitimately share a topic), so it is the coverage-presence
// measure this module uses instead. An item with no topic_tags cannot be measured and is skipped
// (degrade, never guess — the same posture gaps.mjs takes when jurisdictionsByMember is absent).
//
// PRECISION-HONEST (non-negotiable, matches item_forward_events' own grounding rules): this module
// NEVER invents a date, an instrument, or a topic. Every field on an emitted target is EITHER copied
// verbatim from the forward-event row it came from (event_date, date_precision, event_kind,
// obligation_text, source_span, confidence) OR is a real, already-stored corpus fact the caller
// supplies (the item's topic_tags / canonical_instrument_key via corpusIndex) — never re-derived,
// summarized, or paraphrased by this module.
//
// FUTURE ONLY: an obligation already in the past is not something to "anticipate" — the caller
// filters (or this module's `now` option filters) to event_date > now. A caller-supplied `now` keeps
// this deterministic under test; the real caller (analyze-corpus.mjs) passes the wall clock.

// flag-namespaces.mjs is the SoT for subject_ref construction — see its own header. Every emitted
// target's subject_ref is its forward event's own id (event.id), a stable natural key already unique
// per row, so this stays a single-part call (buildSubjectRef(x) === x).
import { buildSubjectRef } from "./flag-namespaces.mjs";

const lc = (s) => String(s || "").toLowerCase().trim();

function topicSetFor(itemId, itemTopics) {
  const raw = itemTopics instanceof Map ? itemTopics.get(itemId) : itemTopics?.[itemId];
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return new Set(list.filter((x) => typeof x === "string" && x.trim()).map(lc));
}

function instrumentKeyFor(itemId, itemInstrumentKeys) {
  const raw = itemInstrumentKeys instanceof Map ? itemInstrumentKeys.get(itemId) : itemInstrumentKeys?.[itemId];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Build a topic -> Set<itemId> index from a corpus's item->topics map. Pure, deterministic; used to
 * count "how many OTHER items touch this topic" without an O(items^2) scan.
 * @param {Map<string,string[]>|Record<string,string[]>} itemTopics
 * @returns {Map<string, Set<string>>}
 */
function buildTopicIndex(itemTopics) {
  const idx = new Map();
  const entries = itemTopics instanceof Map ? itemTopics.entries() : Object.entries(itemTopics || {});
  for (const [itemId, topics] of entries) {
    const list = Array.isArray(topics) ? topics : topics == null ? [] : [topics];
    for (const raw of list) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      const t = lc(raw);
      if (!idx.has(t)) idx.set(t, new Set());
      idx.get(t).add(itemId);
    }
  }
  return idx;
}

function toMs(v) {
  if (v == null) return NaN;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return Date.parse(String(v));
}

/**
 * Compute anticipated-coverage targets from forward events + the corpus's known topic/instrument
 * keys. Each target names ONE forward event whose topic has no, or thin, OTHER corpus coverage.
 *
 * @param {Array<{
 *   id: string,                      // item_forward_events.id
 *   intelligence_item_id: string,
 *   event_date: string,              // ISO date (event_date column)
 *   date_precision: 'day'|'month'|'year',
 *   event_kind: 'entry_into_force'|'compliance_deadline'|'review_or_report'|'phase_step'|'consultation_close'|'other',
 *   obligation_text: string,
 *   source_span: string,
 *   confidence: 'high'|'medium',
 * }>} forwardEvents
 * @param {{
 *   itemTopics: Map<string,string[]>|Record<string,string[]>,           // intelligence_item_id -> topic_tags
 *   itemInstrumentKeys?: Map<string,string>|Record<string,string>,      // intelligence_item_id -> canonical_instrument_key (restated only, never used for coverage counting)
 * }} corpusIndex
 * @param {{ now?: Date|string|number, thinThreshold?: number }} [opts]
 *   thinThreshold: an OTHER-item coverage count <= this is "thin" (default 1); a count of 0 is always
 *   "no_coverage" regardless of thinThreshold.
 * @returns {Array<{
 *   event_id: string, intelligence_item_id: string, event_date: string, date_precision: string,
 *   event_kind: string, obligation_text: string, source_span: string, confidence: string,
 *   topics: string[], instrument_key: string|null, other_coverage_count: number,
 *   reason: 'no_coverage'|'thin_coverage', description: string,
 * }>}
 */
export function computeAnticipatedTargets(forwardEvents, corpusIndex = {}, opts = {}) {
  const { itemTopics, itemInstrumentKeys } = corpusIndex;
  const nowMs = opts.now !== undefined ? toMs(opts.now) : Date.now();
  const thinThreshold = typeof opts.thinThreshold === "number" && opts.thinThreshold >= 0 ? opts.thinThreshold : 1;

  const topicIndex = itemTopics ? buildTopicIndex(itemTopics) : new Map();
  const targets = [];

  for (const ev of Array.isArray(forwardEvents) ? forwardEvents : []) {
    if (!ev || typeof ev.id !== "string" || typeof ev.intelligence_item_id !== "string") continue;
    if (!ev.event_date) continue;
    const evMs = toMs(ev.event_date);
    if (!Number.isFinite(evMs) || evMs <= nowMs) continue; // past or unparseable -> not "anticipated"

    const topics = [...topicSetFor(ev.intelligence_item_id, itemTopics)].sort();
    if (!topics.length) continue; // cannot measure coverage without a topic -> never guess, skip

    // Coverage = OTHER items (not this event's own item) sharing at least one topic.
    const otherItems = new Set();
    for (const t of topics) {
      for (const otherId of topicIndex.get(t) || []) {
        if (otherId !== ev.intelligence_item_id) otherItems.add(otherId);
      }
    }
    const coverageCount = otherItems.size;
    if (coverageCount > thinThreshold) continue; // real coverage exists elsewhere -> not a target

    const reason = coverageCount === 0 ? "no_coverage" : "thin_coverage";
    const instrumentKey = itemInstrumentKeys ? instrumentKeyFor(ev.intelligence_item_id, itemInstrumentKeys) : null;

    const instrumentPhrase = instrumentKey ? ` (${instrumentKey})` : "";
    const description =
      `Item ${ev.intelligence_item_id}${instrumentPhrase} names a future ${ev.event_kind} obligation ` +
      `on ${ev.event_date} (${ev.date_precision} precision): "${ev.obligation_text}". ` +
      `${coverageCount} other corpus item(s) share its topic(s) [${topics.join(", ")}] — ` +
      `${reason === "no_coverage" ? "no other coverage exists for this topic." : "coverage on this topic is thin."}`;

    targets.push({
      event_id: ev.id,
      subject_ref: buildSubjectRef(ev.id),
      intelligence_item_id: ev.intelligence_item_id,
      event_date: ev.event_date,
      date_precision: ev.date_precision,
      event_kind: ev.event_kind,
      obligation_text: ev.obligation_text,
      source_span: ev.source_span,
      confidence: ev.confidence,
      topics,
      instrument_key: instrumentKey,
      other_coverage_count: coverageCount,
      reason,
      description,
    });
  }

  targets.sort((x, y) => (x.event_id < y.event_id ? -1 : x.event_id > y.event_id ? 1 : 0));
  return targets;
}
