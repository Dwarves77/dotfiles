// term-recurrence.mjs (lane G5-TERMS, 2026-10-06, buildout plan Stage 5): PURE counting, proposal and
// adoption of repeated mentions of a term the system does not hold. Node builtins only, no I/O: every read
// and write is injected, so the module runs in the no-npm discipline job and is proven on fixtures.
//
// THE CLASS, NOT THE EXAMPLE (CLAUDE.md rule 19). The question this module answers: "which things do items
// keep mentioning that no code vocabulary holds, and when does a repeated mention become a held term?" The
// kinds are standard, material, theme, scenario, compliance_object and term. Themes and standards are two
// instances of the class; materials and general terms have no detector in the repo before this lane, so the
// brief author's optional `mentioned_terms` array is the detector that reaches them (detector 5 below).
//
// DETECTORS. Each one turns rows that ALREADY exist into mentions; none re-implements existing logic:
//   1. entity-link        the unresolved, ambiguous and unknown-standard mentions entity-resolve.mjs
//                         aggregates into one `intake-entity-link` integrity_flags row per item
//                         (recommended_actions[].rationale = "<kind>:<mention> resolved to <n> item(s)")
//                         -> kind `standard`.
//   2. theme-candidate    intelligence_items.theme_candidate (migration 136), other than `unclassified`
//                         -> kind `theme`.
//   3. scenario-tag       operational_scenario_tags outside the system-prompt glossary (the caller supplies
//                         the held set, read from derive-tags.mjs's SCENARIO_TAG_VALUES) -> kind `scenario`.
//   4. compliance-object  intelligence_items.compliance_object_candidates (migration 355, the capture that
//                         replaces the silent drop in parse-output.ts) -> kind `compliance_object`.
//   5. brief-terms        the optional `mentioned_terms` [{kind: material|term|standard, text}] a session
//                         brief author emits in the record-briefs metadata; written at apply time.
//
// ADOPTION RULE (pure function decideAdoption). A term adopts when distinct_items >= minItems (the caller
// passes trust.ts CITATION_FREQUENCY_PROMOTION_THRESHOLD, imported there, never typed here) AND
// distinct_sources >= ADOPTION_MIN_SOURCES (2). Adoption needs no human. Adoption is monotonic: an adopted
// term stays adopted when a later count dips (items archived); a retired term (set by an admin) is never
// touched by an automatic writer, the admin-override rule of the lane contract.

export const TERM_KINDS = Object.freeze(["standard", "material", "theme", "scenario", "compliance_object", "term"]);
/** The kinds a brief author may name in `mentioned_terms`. */
export const MENTIONED_TERM_KINDS = Object.freeze(["material", "term", "standard"]);
export const DETECTORS = Object.freeze(["entity-link", "theme-candidate", "scenario-tag", "compliance-object", "brief-terms"]);
export const MENTIONED_TERMS_MAX = 25;
export const MENTIONED_TERM_TEXT_MAX = 120;
/** A term needs mentions from at least this many distinct sources to adopt. */
export const ADOPTION_MIN_SOURCES = 2;
export const ENTITY_LINK_CREATED_BY = "intake-entity-link";
export const ENTITY_LINK_ACTION = "review_entity_mention";
const EVIDENCE_SAMPLE_ITEMS = 5;
const EVIDENCE_SAMPLE_SURFACE = 3;

/** The normalised key of a mention: NFKC, lower case, single spaces, wrapping punctuation stripped.
 *  @param {unknown} text @returns {string} */
export function normaliseTermKey(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s"'`([{]+/, "")
    .replace(/[\s"'`)\]}.,;:]+$/, "");
}

/**
 * Validate and normalise a `mentioned_terms` value (already JSON-parsed). Pure. The ONE definition used by
 * parse-output.ts (which throws on a non-empty error list) and by the apply path.
 * @param {unknown} value
 * @returns {{terms: Array<{kind: string, text: string}>, errors: string[]}}
 */
export function validateMentionedTerms(value) {
  const errors = [];
  if (value === null || value === undefined) return { terms: [], errors };
  if (!Array.isArray(value)) return { terms: [], errors: ["mentioned_terms must be a JSON array of { kind, text }"] };
  if (value.length > MENTIONED_TERMS_MAX) errors.push(`mentioned_terms exceeds ${MENTIONED_TERMS_MAX} entries (got ${value.length})`);
  const seen = new Set();
  const terms = [];
  value.slice(0, MENTIONED_TERMS_MAX).forEach((t, i) => {
    if (t === null || typeof t !== "object" || Array.isArray(t)) {
      errors.push(`mentioned_terms[${i}] must be an object { kind, text }`);
      return;
    }
    if (!MENTIONED_TERM_KINDS.includes(t.kind)) {
      errors.push(`mentioned_terms[${i}].kind must be one of ${MENTIONED_TERM_KINDS.join(", ")} (got ${JSON.stringify(t.kind)})`);
      return;
    }
    if (typeof t.text !== "string" || t.text.trim() === "") {
      errors.push(`mentioned_terms[${i}].text must be a non-empty string`);
      return;
    }
    const text = t.text.trim();
    if (text.length > MENTIONED_TERM_TEXT_MAX) {
      errors.push(`mentioned_terms[${i}].text exceeds ${MENTIONED_TERM_TEXT_MAX} characters`);
      return;
    }
    const key = normaliseTermKey(text);
    if (!key) {
      errors.push(`mentioned_terms[${i}].text has no usable characters`);
      return;
    }
    const dedupe = `${t.kind}|${key}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    terms.push({ kind: t.kind, text });
  });
  return { terms, errors };
}

/** The rule text recorded in vocabulary_terms.adoption_rule. @param {number} minItems @returns {string} */
export function adoptionRuleText(minItems) {
  return `distinct_items>=${minItems} AND distinct_sources>=${ADOPTION_MIN_SOURCES}`;
}

/**
 * The adoption rule, a pure function of the two counts.
 * @param {{distinct_items: number, distinct_sources: number}} counts
 * @param {{minItems: number}} opts minItems is trust.ts CITATION_FREQUENCY_PROMOTION_THRESHOLD (passed in)
 * @returns {{adopt: boolean, rule: string}}
 */
export function decideAdoption(counts, { minItems }) {
  if (!Number.isInteger(minItems) || minItems < 1) throw new Error("decideAdoption: minItems must be a positive integer");
  const adopt = counts.distinct_items >= minItems && counts.distinct_sources >= ADOPTION_MIN_SOURCES;
  return { adopt, rule: adoptionRuleText(minItems) };
}

function mention(kind, text, itemId, sourceId, detector, surface) {
  const key = normaliseTermKey(text);
  if (!key) return null;
  return { kind, term_key: key, label: String(text).trim(), item_id: itemId, source_id: sourceId ?? null, detector, surface_text: String(surface ?? text).trim() };
}

const ENTITY_RATIONALE_RE = /^(identifier|named|shaped):(.+?) resolved to (\d+) item\(s\)$/s;

function actionsOf(flag) {
  let a = flag?.recommended_actions;
  if (typeof a === "string") {
    try { a = JSON.parse(a); } catch { a = []; }
  }
  return Array.isArray(a) ? a : [];
}

/**
 * Detector 1. `flags` are integrity_flags rows (id, subject_ref, created_by, recommended_actions).
 * `sourceByItemId` maps every ELIGIBLE item id to its source id (or null); a flag on an item not in the map
 * is skipped, so an archived or unverified item never counts.
 * @param {object[]} flags @param {Map<string, string|null>} sourceByItemId
 */
export function mentionsFromEntityLinkFlags(flags, sourceByItemId) {
  const out = [];
  for (const f of flags ?? []) {
    if (f?.created_by !== ENTITY_LINK_CREATED_BY) continue;
    const itemId = f.subject_ref;
    if (!sourceByItemId.has(itemId)) continue;
    for (const a of actionsOf(f)) {
      if (a?.action !== ENTITY_LINK_ACTION) continue;
      const m = ENTITY_RATIONALE_RE.exec(String(a.rationale ?? ""));
      if (!m) continue;
      const x = mention("standard", m[2], itemId, sourceByItemId.get(itemId), "entity-link", `${m[1]}:${m[2].trim()}`);
      if (x) out.push(x);
    }
  }
  return out;
}

/** Detector 2. `items` rows: id, source_id, theme_candidate. @param {object[]} items */
export function mentionsFromThemeCandidates(items) {
  const out = [];
  for (const it of items ?? []) {
    const v = it?.theme_candidate;
    if (typeof v !== "string" || normaliseTermKey(v) === "" || normaliseTermKey(v) === "unclassified") continue;
    const x = mention("theme", v, it.id, it.source_id, "theme-candidate", v);
    if (x) out.push(x);
  }
  return out;
}

/** Detector 3. `heldScenarioTags` is the glossary set the caller read from derive-tags.mjs.
 *  @param {object[]} items rows: id, source_id, operational_scenario_tags @param {Set<string>} heldScenarioTags */
export function mentionsFromScenarioTags(items, heldScenarioTags) {
  const held = new Set([...heldScenarioTags].map(normaliseTermKey));
  const out = [];
  for (const it of items ?? []) {
    for (const tag of Array.isArray(it?.operational_scenario_tags) ? it.operational_scenario_tags : []) {
      if (typeof tag !== "string" || held.has(normaliseTermKey(tag))) continue;
      const x = mention("scenario", tag, it.id, it.source_id, "scenario-tag", tag);
      if (x) out.push(x);
    }
  }
  return out;
}

/** Detector 4. `items` rows: id, source_id, compliance_object_candidates. @param {object[]} items */
export function mentionsFromComplianceCandidates(items) {
  const out = [];
  for (const it of items ?? []) {
    for (const c of Array.isArray(it?.compliance_object_candidates) ? it.compliance_object_candidates : []) {
      if (typeof c !== "string") continue;
      const x = mention("compliance_object", c, it.id, it.source_id, "compliance-object", c);
      if (x) out.push(x);
    }
  }
  return out;
}

/** Detector 5 (written at apply time). @param {{itemId: string, sourceId: string|null, terms: Array<{kind: string, text: string}>}} a */
export function mentionsFromBriefTerms({ itemId, sourceId, terms }) {
  const { terms: valid } = validateMentionedTerms(terms);
  const out = [];
  for (const t of valid) {
    const x = mention(t.kind, t.text, itemId, sourceId ?? null, "brief-terms", t.text);
    if (x) out.push(x);
  }
  return out;
}

const groupKey = (m) => `${m.kind}|${m.term_key}`;
const mentionKey = (m) => `${m.kind}|${m.term_key}|${m.item_id}|${m.detector}`;
const zeroByDetector = () => Object.fromEntries(DETECTORS.map((d) => [d, 0]));

/**
 * The aggregation. PURE. Merges freshly derived mentions with already persisted ones, counts distinct items
 * and distinct sources per (kind, term_key), applies the adoption rule, and returns exactly what a writer
 * must write (nothing for an unchanged term, nothing at all for a retired one).
 *
 * @param {{
 *   derived: object[], persisted: object[], existingTerms: object[], now: string, minItems: number
 * }} args  mentions carry { kind, term_key, label, item_id, source_id, detector, surface_text };
 *   existingTerms are vocabulary_terms rows.
 */
export function buildTermPlan({ derived, persisted, existingTerms, now, minItems }) {
  const rule = adoptionRuleText(minItems);
  const existingBy = new Map((existingTerms ?? []).map((t) => [`${t.kind}|${t.term_key}`, t]));
  const merged = new Map();
  for (const m of persisted ?? []) merged.set(mentionKey(m), { ...m, isNew: false });
  for (const m of derived ?? []) if (!merged.has(mentionKey(m))) merged.set(mentionKey(m), { ...m, isNew: true });

  const groups = new Map();
  for (const m of merged.values()) {
    const k = groupKey(m);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }

  const detected = zeroByDetector();
  for (const m of merged.values()) detected[m.detector] += 1;

  const terms = [];
  const newMentions = [];
  const counts = { terms_total: 0, proposed: 0, adopted: 0, newly_adopted: 0, inserted: 0, updated: 0, unchanged: 0, skipped_retired: 0 };

  for (const [k, ms] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const existing = existingBy.get(k) ?? null;
    const { kind, term_key } = ms[0];
    if (existing?.status === "retired") {
      counts.skipped_retired += 1;
      continue;
    }
    const items = new Set(ms.map((m) => m.item_id));
    const sources = new Set(ms.map((m) => m.source_id).filter(Boolean));
    const decision = decideAdoption({ distinct_items: items.size, distinct_sources: sources.size }, { minItems });
    const wasAdopted = existing?.status === "adopted";
    const adopted = wasAdopted || decision.adopt;
    const fresh = ms.filter((m) => m.isNew);
    const byDetector = zeroByDetector();
    for (const m of ms) byDetector[m.detector] += 1;
    const surfaces = [...new Set(ms.map((m) => m.surface_text))].sort();
    const next = {
      kind,
      term_key,
      label: existing?.label ?? [...ms].map((m) => m.label).sort()[0],
      status: adopted ? "adopted" : "proposed",
      distinct_items: items.size,
      distinct_sources: sources.size,
      first_seen_at: existing?.first_seen_at ?? now,
      last_seen_at: fresh.length > 0 ? now : existing?.last_seen_at ?? now,
      adopted_at: adopted ? existing?.adopted_at ?? now : null,
      adoption_rule: adopted ? existing?.adoption_rule ?? rule : null,
      evidence: {
        detectors: byDetector,
        sample_items: [...items].sort().slice(0, EVIDENCE_SAMPLE_ITEMS),
        sample_surface: surfaces.slice(0, EVIDENCE_SAMPLE_SURFACE),
      },
    };
    let action = "insert";
    if (existing) {
      const same =
        existing.status === next.status &&
        existing.distinct_items === next.distinct_items &&
        existing.distinct_sources === next.distinct_sources &&
        existing.adopted_at === next.adopted_at &&
        existing.adoption_rule === next.adoption_rule &&
        existing.last_seen_at === next.last_seen_at &&
        JSON.stringify(existing.evidence ?? {}) === JSON.stringify(next.evidence);
      action = same ? "unchanged" : "update";
    }
    const newlyAdopted = next.status === "adopted" && !wasAdopted;
    terms.push({ key: k, kind, term_key, existing, next, action, newly_adopted: newlyAdopted });
    counts.terms_total += 1;
    counts[next.status === "adopted" ? "adopted" : "proposed"] += 1;
    if (newlyAdopted) counts.newly_adopted += 1;
    counts[action === "insert" ? "inserted" : action === "update" ? "updated" : "unchanged"] += 1;
    for (const m of fresh) {
      newMentions.push({ kind, term_key, item_id: m.item_id, source_id: m.source_id, detector: m.detector, surface_text: m.surface_text });
    }
  }
  return { terms, newMentions, counts: { ...counts, new_mentions: newMentions.length, detected_by_detector: detected } };
}

/**
 * Write a plan through injected deps (guarded by the caller). Insert new terms, patch changed ones, insert
 * new mentions with their term ids. Idempotent on a second run because the plan is rebuilt from the tables.
 * @param {ReturnType<typeof buildTermPlan>} plan
 * @param {{
 *   insertTerms: (rows: object[]) => Promise<{rows: Array<{id: string, kind: string, term_key: string}>}>,
 *   updateTerm: (id: string, patch: object) => Promise<unknown>,
 *   insertMentions: (rows: object[]) => Promise<unknown>,
 * }} deps
 */
export async function applyTermPlan(plan, deps) {
  const idByKey = new Map();
  for (const t of plan.terms) if (t.existing?.id) idByKey.set(t.key, t.existing.id);
  const toInsert = plan.terms.filter((t) => t.action === "insert");
  if (toInsert.length) {
    const res = await deps.insertTerms(toInsert.map((t) => ({ ...t.next })));
    for (const r of res?.rows ?? []) idByKey.set(`${r.kind}|${r.term_key}`, r.id);
  }
  let updated = 0;
  for (const t of plan.terms.filter((x) => x.action === "update")) {
    const { kind: _k, term_key: _t, label: _l, ...patch } = t.next;
    await deps.updateTerm(t.existing.id, patch);
    updated += 1;
  }
  const mentionRows = [];
  for (const m of plan.newMentions) {
    const termId = idByKey.get(`${m.kind}|${m.term_key}`);
    if (!termId) throw new Error(`applyTermPlan: no term id for ${m.kind}|${m.term_key} (insert returned no row)`);
    mentionRows.push({ term_id: termId, item_id: m.item_id, source_id: m.source_id, detector: m.detector, surface_text: m.surface_text });
  }
  if (mentionRows.length) await deps.insertMentions(mentionRows);
  return { terms_inserted: toInsert.length, terms_updated: updated, mentions_inserted: mentionRows.length };
}

/**
 * The per-item write used by apply-record-briefs.mjs for detector 5. Looks the terms up, inserts the missing
 * ones as proposed (counts seeded at one item; the collector recomputes the real counts), skips a retired
 * term, and upserts one mention per (term, item, detector).
 * @param {{itemId: string, sourceId: string|null, terms: Array<{kind: string, text: string}>, now: string}} a
 * @param {{
 *   readTerms: (termKeys: string[]) => Promise<object[]>,
 *   insertTerms: (rows: object[]) => Promise<{rows: Array<{id: string, kind: string, term_key: string}>}>,
 *   upsertMentions: (rows: object[]) => Promise<unknown>,
 * }} deps
 */
export async function recordBriefTerms({ itemId, sourceId, terms, now }, deps) {
  const ms = mentionsFromBriefTerms({ itemId, sourceId, terms });
  if (ms.length === 0) return { mentioned: 0, terms_inserted: 0, mentions_written: 0, skipped_retired: 0 };
  const existing = await deps.readTerms([...new Set(ms.map((m) => m.term_key))]);
  const existingBy = new Map((existing ?? []).map((t) => [`${t.kind}|${t.term_key}`, t]));
  const idByKey = new Map();
  let skippedRetired = 0;
  const toInsert = [];
  const queued = new Set();
  for (const m of ms) {
    const k = groupKey(m);
    const e = existingBy.get(k);
    if (e?.status === "retired") {
      skippedRetired += 1;
      continue;
    }
    if (e) idByKey.set(k, e.id);
    else if (!queued.has(k)) {
      queued.add(k);
      toInsert.push({
        kind: m.kind, term_key: m.term_key, label: m.label, status: "proposed",
        distinct_items: 1, distinct_sources: sourceId ? 1 : 0,
        first_seen_at: now, last_seen_at: now, adopted_at: null, adoption_rule: null,
        evidence: { detectors: { ...zeroByDetector(), "brief-terms": 1 }, sample_items: [itemId], sample_surface: [m.surface_text] },
      });
    }
  }
  if (toInsert.length) {
    const res = await deps.insertTerms(toInsert);
    for (const r of res?.rows ?? []) idByKey.set(`${r.kind}|${r.term_key}`, r.id);
  }
  const rows = [];
  for (const m of ms) {
    const termId = idByKey.get(groupKey(m));
    if (!termId) continue;
    rows.push({ term_id: termId, item_id: itemId, source_id: sourceId ?? null, detector: "brief-terms", surface_text: m.surface_text });
  }
  if (rows.length) await deps.upsertMentions(rows);
  return { mentioned: ms.length, terms_inserted: toInsert.length, mentions_written: rows.length, skipped_retired: skippedRetired };
}
