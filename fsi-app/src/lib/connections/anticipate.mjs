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
