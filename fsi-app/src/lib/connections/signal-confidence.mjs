// signal-confidence.mjs — confidence classification for L4 signal candidates (signal-candidates.mjs).
// PURE, no DB, no LLM, $0.
//
// OPERATOR RULING 2026-09-03: the flywheel must not have a human gate (spec 08 §Loop B, "without a
// human in the path"). signal-candidates.mjs's own header used to say every candidate this module
// mines is "operator review only, never auto-adopted" — that posture stood while 930 open L4 flags sat
// unreviewed and the signals never became edges. The corrected rule: DETERMINISTIC derivations
// auto-adopt (written as real item_cross_references edges, with provenance), and only the UNDECIDABLE
// residue stays an integrity_flags candidate. This module draws that line, from the two signal kinds'
// OWN evidence (read signal-candidates.mjs in full before changing this file):
//
//   shared_regulation_identifier — REG_ID_RE is a narrow, structured legal-citation pattern (4-digit
//     year/number, optional /EU|/EC|/EEC suffix; signal-candidates.mjs's own comment calls it
//     "deliberately conservative"). Two items whose titles both name the SAME formatted regulation
//     number are citing the same legal instrument — there is essentially no coincidental-collision risk
//     in a match this specific. ONE shared identifier between a pair is decisive on its own.
//
//   shared_title_entity — CAP_PHRASE_RE is a rough named-entity PROXY (2+ consecutive capitalized
//     words); the module's own stoplist exists only to blunt the worst false positives ("The New
//     Rules"). A SINGLE shared capitalized phrase is not decisive by itself — ordinary title prose
//     collides on generic capitalized phrases too often. Two conditions raise it to decisive:
//       (a) the SAME pair shares >= 2 DISTINCT capitalized-phrase tokens — independent corroboration;
//           coincidence on one shared phrase is plausible, coincidence on two independently is not.
//       (b) the shared phrase is a member of TITLE_ENTITY_VOCABULARY below — a small closed list of
//           real, named regulatory programmes/instruments (not an accidental capitalization pattern).
//     No such vocabulary SoT exists anywhere else in this repo today (checked: no vocab.mjs entry, no
//     research/taxonomy.mjs entry names title-level programme strings) — CLAUDE.md rule 2 ("never
//     fabricate") rules out inventing entries with no real source, so TITLE_ENTITY_VOCABULARY ships
//     EMPTY: the (b) path is a real, tested hook, not a fabricated list. It engages the moment an ADR or
//     a real controlled vocabulary registers entries here; until then confidence rests entirely on (a).
//
// A signal kind this module does not recognize classifies UNDECIDED (fail closed) — a future signal
// kind added to signal-candidates.mjs needs an explicit ruling here before it can auto-adopt.

import { createdBy } from "./flag-namespaces.mjs";

const CONFIDENCE = Object.freeze({ DECISIVE: "decisive", UNDECIDED: "undecided" });
export { CONFIDENCE as SIGNAL_CONFIDENCE };

// Extension point for signal_kind='shared_title_entity' path (b) — see header. Real entries only; a
// real controlled vocabulary of named regulatory programmes/instruments has no home in this repo today.
export const TITLE_ENTITY_VOCABULARY = new Set([]);

// Basis weight assigned to a DECISIVE group of each kind, written into the edge's `basis[].weight`
// (write-edges.mjs / discover.mjs's own {signal, detail, weight} shape). Both sit clearly above
// discover.mjs's 0.3 material-connection floor (ADR-019's own scorer never exceeds ~0.4 per single
// signal), reflecting that a title-text citation match is real, grounded evidence — regulation-identifier
// is weighted higher than title-entity because a formatted legal citation is a stronger, more specific
// match than a capitalized-phrase heuristic even once independently corroborated.
export const AUTO_ADOPT_WEIGHT = Object.freeze({
  shared_regulation_identifier: 0.85,
  shared_title_entity: 0.7,
});

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Confidence verdict for ONE (itemA,itemB,signalKind) group, from the distinct token values that
 * group shares. PURE.
 * @param {string} signalKind - one of signal-candidates.mjs's SIGNAL_KINDs
 * @param {Set<string>|string[]} distinctValues - every distinct `value` shared within this group
 * @returns {{confidence:'decisive'|'undecided', weight:number, reason:string}}
 */
export function classifySignalGroup(signalKind, distinctValues) {
  const values = distinctValues instanceof Set ? distinctValues : new Set(distinctValues);

  if (signalKind === "shared_regulation_identifier") {
    return {
      confidence: values.size >= 1 ? CONFIDENCE.DECISIVE : CONFIDENCE.UNDECIDED,
      weight: AUTO_ADOPT_WEIGHT.shared_regulation_identifier,
      reason: "structured regulation-identifier citation match (decisive on a single shared identifier)",
    };
  }

  if (signalKind === "shared_title_entity") {
    if (values.size >= 2) {
      return {
        confidence: CONFIDENCE.DECISIVE,
        weight: AUTO_ADOPT_WEIGHT.shared_title_entity,
        reason: `${values.size} independent shared capitalized-phrase tokens`,
      };
    }
    const [only] = values;
    if (only && TITLE_ENTITY_VOCABULARY.has(only)) {
      return {
        confidence: CONFIDENCE.DECISIVE,
        weight: AUTO_ADOPT_WEIGHT.shared_title_entity,
        reason: `"${only}" is a vocabulary-registered named entity`,
      };
    }
    return {
      confidence: CONFIDENCE.UNDECIDED,
      weight: 0,
      reason: values.size === 1
        ? "single unregistered capitalized-phrase token — not independently corroborated"
        : "no shared token",
    };
  }

  return { confidence: CONFIDENCE.UNDECIDED, weight: 0, reason: `unrecognized signal kind "${signalKind}" — fail closed, stays a flag` };
}

/**
 * Attach a confidence verdict to every signal-candidates.mjs output row. PURE. Groups candidates by
 * (itemA,itemB,signalKind) — signal-candidates.mjs emits one row per (pair, kind, token), so a pair can
 * share several distinct tokens of the same kind; the verdict is computed once per group from ALL of
 * that group's distinct token values (see classifySignalGroup), then applied to every member row.
 * @param {Array<{itemA:string,itemB:string,signalKind:string,value:string,subject_ref:string}>} candidates
 * @returns {Array<object>} each input candidate, unchanged, plus {confidence, confidenceWeight, confidenceReason}
 */
export function classifySignalCandidates(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const groups = new Map(); // `${itemA}|${itemB}|${signalKind}` -> { values:Set, members:[] }
  for (const c of list) {
    if (!c || typeof c.itemA !== "string" || typeof c.itemB !== "string" || typeof c.signalKind !== "string") continue;
    const key = `${c.itemA}|${c.itemB}|${c.signalKind}`;
    if (!groups.has(key)) groups.set(key, { values: new Set(), members: [] });
    const g = groups.get(key);
    if (typeof c.value === "string") g.values.add(c.value);
    g.members.push(c);
  }
  const out = [];
  for (const g of groups.values()) {
    const kind = g.members[0].signalKind;
    const verdict = classifySignalGroup(kind, g.values);
    for (const c of g.members) {
      out.push({ ...c, confidence: verdict.confidence, confidenceWeight: verdict.weight, confidenceReason: verdict.reason });
    }
  }
  out.sort((x, y) => (x.subject_ref < y.subject_ref ? -1 : x.subject_ref > y.subject_ref ? 1 : 0));
  return out;
}

/**
 * Build the item_cross_references edge rows for every DECISIVE pair, from already-classified
 * candidates (classifySignalCandidates's output). PURE. ONE row per pair per direction (ADR-018:
 * discover.mjs signals are symmetric and both directions are kept at rest; write-edges.mjs's own header
 * requires the same for provenance_discovery edges — a reader that filters source-only needs both).
 * Multiple decisive signal kinds on the same pair combine into ONE basis array (item_cross_references
 * is unique on (source_item_id,target_item_id) — see write-edges.mjs's header — a single Postgres
 * upsert cannot affect the same conflict key twice in one statement, so this must emit at most one row
 * per (pair, direction), never one row per kind).
 * relationship is the literal 'related' (not a signal name) — matches run-discovery.mjs / backfill-edges.mjs's
 * existing provenance_discovery convention; the CHECK on item_cross_references.relationship (migration
 * 004) does not admit signal-kind strings.
 * @param {Array<{itemA:string,itemB:string,signalKind:string,value:string,confidence:string,confidenceWeight:number}>} classified
 * @returns {Array<{source_item_id:string,target_item_id:string,relationship:'related',origin:'provenance_discovery',basis:Array<{signal:string,detail:string,weight:number}>,score:number}>}
 */
export function buildAutoAdoptEdges(classified) {
  const decisive = (Array.isArray(classified) ? classified : []).filter((c) => c.confidence === CONFIDENCE.DECISIVE);
  const byPair = new Map(); // pairKey -> { a, b, byKind: Map<kind, Set<value>> }
  for (const c of decisive) {
    const key = pairKey(c.itemA, c.itemB);
    if (!byPair.has(key)) byPair.set(key, { a: c.itemA < c.itemB ? c.itemA : c.itemB, b: c.itemA < c.itemB ? c.itemB : c.itemA, byKind: new Map() });
    const p = byPair.get(key);
    if (!p.byKind.has(c.signalKind)) p.byKind.set(c.signalKind, new Set());
    p.byKind.get(c.signalKind).add(c.value);
  }

  const edges = [];
  for (const key of [...byPair.keys()].sort()) {
    const { a, b, byKind } = byPair.get(key);
    const basis = [];
    for (const kind of [...byKind.keys()].sort()) {
      const values = [...byKind.get(kind)].sort();
      const weight = AUTO_ADOPT_WEIGHT[kind] ?? 0;
      const label = kind === "shared_regulation_identifier" ? "regulation identifier(s)" : "named entit(y/ies)";
      basis.push({ signal: kind, detail: `both name ${label} ${values.map((v) => `"${v}"`).join(", ")} in their titles`, weight });
    }
    const score = Math.min(1, basis.reduce((s, x) => s + x.weight, 0));
    for (const [source_item_id, target_item_id] of [[a, b], [b, a]]) {
      edges.push({ source_item_id, target_item_id, relationship: "related", origin: "provenance_discovery", basis, score });
    }
  }
  return edges;
}

/**
 * Full pure plan: classify every candidate, split decisive/undecided, and build the edges the decisive
 * set implies. PURE — the caller (analyze-corpus.mjs) owns all I/O (writing edges, reflecting flags).
 * @param {Array<object>} candidates - signal-candidates.mjs's detectSignalCandidates() output
 * @returns {{classified:Array<object>, decisive:Array<object>, undecided:Array<object>, edges:Array<object>}}
 */
export function planSignalAdoption(candidates) {
  const classified = classifySignalCandidates(candidates);
  const decisive = classified.filter((c) => c.confidence === CONFIDENCE.DECISIVE);
  const undecided = classified.filter((c) => c.confidence !== CONFIDENCE.DECISIVE);
  const edges = buildAutoAdoptEdges(classified);
  return { classified, decisive, undecided, edges };
}

/**
 * Group existing OPEN integrity_flags rows that are about to be auto-resolved (their candidate now
 * classifies decisive) by their `created_by` (== one signal kind, per flag-namespaces.mjs's
 * createdBy(SIGNAL_NAMESPACE, kind) shape), and build each group's resolution_note. PURE — the only
 * non-trivial logic analyze-corpus.mjs's auto-resolve step needs, extracted here so that file stays the
 * thin orchestrator its own header requires (no scoring/business logic in the script itself) and this
 * grouping is independently tested like every other decision this module makes.
 * @param {Array<{id:string, created_by:string}>} staleFlags - open flags whose (subject_ref,created_by)
 *   matched a decisive candidate (the caller computes that match; this function only groups+labels).
 * @param {string} namespace - SIGNAL_NAMESPACE (flag-namespaces.mjs) — stripped from created_by to
 *   recover the bare signal kind for the resolution_note and the AUTO_ADOPT_WEIGHT lookup.
 * @returns {Array<{createdBy:string, ids:string[], resolutionNote:string}>} sorted by createdBy for
 *   deterministic output.
 */
export function groupStaleFlagsForResolution(staleFlags, namespace) {
  const byCreatedBy = new Map();
  for (const r of Array.isArray(staleFlags) ? staleFlags : []) {
    if (!r || typeof r.id !== "string" || typeof r.created_by !== "string") continue;
    if (!byCreatedBy.has(r.created_by)) byCreatedBy.set(r.created_by, []);
    byCreatedBy.get(r.created_by).push(r.id);
  }
  const groups = [];
  for (const createdByValue of [...byCreatedBy.keys()].sort()) {
    const kind = typeof namespace === "string" && createdByValue.startsWith(namespace) ? createdByValue.slice(namespace.length) : createdByValue;
    const weight = AUTO_ADOPT_WEIGHT[kind];
    groups.push({ createdBy: createdByValue, ids: byCreatedBy.get(createdByValue), resolutionNote: `auto-adopted:signal:${kind}:${weight ?? "unknown"}` });
  }
  return groups;
}

// ─────────────────────── EVERY CANDIDATE DECIDED (Part 7 task 7.2 / ADR-030 rider, 2026-09-12) ─────────
// "an UNDECIDED pair closes with resolution_note 'below the decisive threshold, no edge; score <s>' (a
// non-edge is a decision), decisive pairs write the edge as today." Before this: analyze-corpus.mjs's
// own reflectFlags() convention left an undecided candidate as an OPEN integrity_flags row for as long as
// it kept reproducing -- exactly the 1,098-row backlog task 7.2 measured, because a candidate that stays
// undecided every run never falls into reflectFlags' "stale" bucket either. The fix is not a new
// confidence rule (classifySignalGroup above is unchanged) -- it is that "undecided" is now itself a
// TERMINAL decision, closed the same run it is computed, not a pending state.
//
// signal-candidates.mjs emits ONE row per (pair, kind, token) with its OWN subject_ref (the token is
// PART of the key -- see that module's own subject_ref construction), so a flag's identity
// (subject_ref + createdBy(namespace, signalKind)) already matches exactly one classified row 1:1 -- no
// pair-level grouping is needed here (unlike groupStaleFlagsForResolution above, which groups by
// createdBy alone for a DIFFERENT purpose: building one combined resolution_note when resolving a BATCH
// of already-decisive flags at once).

/**
 * The resolution outcome for ONE already-classified candidate -- decisive (edge written elsewhere;
 * this is just the flag's own closing note) or undecided (a non-edge, closing with the score and the
 * reason signal-confidence.mjs already computed). PURE.
 * @param {{signalKind:string, confidence:string, confidenceWeight:number, confidenceReason:string}} classifiedRow
 * @returns {string}
 */
export function buildSignalResolutionNote(classifiedRow) {
  const { signalKind, confidence, confidenceWeight, confidenceReason } = classifiedRow;
  if (confidence === CONFIDENCE.DECISIVE) {
    return `auto-adopted:signal:${signalKind}:${AUTO_ADOPT_WEIGHT[signalKind] ?? "unknown"}`;
  }
  return `below the decisive threshold, no edge; score=${confidenceWeight} (${confidenceReason}).`;
}

/**
 * Build the resolution disposition for EVERY currently open flywheel-signal integrity_flags row, given
 * this run's freshly classified candidates (classifySignalCandidates output -- 1:1 with subject_ref, see
 * header above). PURE, no I/O -- the caller (analyze-corpus.mjs / resolve-signals.mjs) performs the
 * actual guardedUpdate writes. Every open flag reaches a terminal disposition on every run:
 *   'decisive'  -- the candidate now classifies decisive (its edge is written by the caller separately;
 *                 this flag's own closing note records the auto-adoption).
 *   'undecided' -- still undecided; closes as a non-edge decision (score + reason), never left open.
 *   'stale'     -- the pair no longer appears in the fresh computation at all (item archived/unverified
 *                 since) -- same wording the pre-existing reflectFlags() convention already used.
 * @param {Array<{id:string, subject_ref:string, created_by:string}>} openFlags
 * @param {Array<object>} classified - classifySignalCandidates() output (every candidate, confidence-tagged)
 * @param {string} namespace - SIGNAL_NAMESPACE
 * @returns {Array<{id:string, disposition:'decisive'|'undecided'|'stale', note:string}>}
 */
export function planSignalFlagResolutions(openFlags, classified, namespace) {
  const byKey = new Map();
  for (const c of Array.isArray(classified) ? classified : []) {
    if (!c || typeof c.subject_ref !== "string" || typeof c.signalKind !== "string") continue;
    byKey.set(`${c.subject_ref}|${createdBy(namespace, c.signalKind)}`, c);
  }
  const out = [];
  for (const flag of Array.isArray(openFlags) ? openFlags : []) {
    if (!flag || typeof flag.id !== "string") continue;
    const key = `${flag.subject_ref}|${flag.created_by}`;
    const c = byKey.get(key);
    if (!c) {
      out.push({ id: flag.id, disposition: "stale", note: `${flag.created_by} finding no longer detected in the latest analyze-corpus pass.` });
      continue;
    }
    out.push({ id: flag.id, disposition: c.confidence === CONFIDENCE.DECISIVE ? "decisive" : "undecided", note: buildSignalResolutionNote(c) });
  }
  return out;
}

/**
 * Build the integrity_flags INSERT payload for a fresh candidate that carries NO existing flag row yet --
 * already closed at insert time (status:'resolved'), so a brand-new undecided finding never sits open
 * even momentarily (task 7.2's "no residue stays open" applies from the write, not only to the backlog).
 * PURE.
 * @param {object} classifiedRow - one classifySignalCandidates() output row
 * @param {string} namespace - SIGNAL_NAMESPACE
 * @param {string} resolvedBy - the writer's own name (e.g. "analyze-corpus.mjs")
 * @returns {object} integrity_flags row, ready for guardedInsert/guardedInsertMany
 */
export function buildPreResolvedSignalFlagRow(classifiedRow, namespace, resolvedBy) {
  const note = buildSignalResolutionNote(classifiedRow);
  const description = classifiedRow.confidence === CONFIDENCE.DECISIVE
    ? `signal-candidates.mjs: ${classifiedRow.signalKind} match "${classifiedRow.value}" between ${classifiedRow.itemA} and ${classifiedRow.itemB} classified decisive and was written as an item_cross_references edge.`
    : `signal-candidates.mjs: ${classifiedRow.signalKind} match "${classifiedRow.value}" between ${classifiedRow.itemA} and ${classifiedRow.itemB} did not reach the decisive threshold -- no edge written.`;
  const nowIso = new Date().toISOString();
  return {
    category: "data_quality",
    subject_type: "system",
    subject_ref: classifiedRow.subject_ref,
    description,
    recommended_actions: [],
    status: "resolved",
    created_by: createdBy(namespace, classifiedRow.signalKind),
    resolved_at: nowIso,
    resolved_by: resolvedBy,
    resolution_note: note,
  };
}
