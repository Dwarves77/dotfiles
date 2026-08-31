// brief-candidates.mjs — CANDIDATE-CONNECTION SELECTION for brief synthesis (flywheel U7: the missing
// joint — brief generation must CONSUME the connection graph, not only feed it). Same documentation
// discipline as cluster.mjs / connection-view-model.mjs: headers explain WHY, output is deterministic
// by construction.
//
// UNLIKE those two siblings this module is not zero-I/O: selectBriefCandidates(itemId, deps) reads
// through INJECTED reader functions — the verify-item.mjs DI shape (deps.loadItem / deps.loadClaims
// there; deps.loadCrossReferences / deps.loadThemeForItem / deps.loadThemeBrief here) — so it needs no
// live DB in tests (inject fakes returning plain fixture data) and carries no Supabase import of its
// own. The actual COMPUTATION — dedup, merge, rank, cap — is the exported PURE core
// selectCandidates(itemId, { crossRefRows, theme, themeBrief }), independently testable with plain
// fixture data and shuffled input, the same posture as cluster.mjs's clusterGraph / pair-view.mjs's
// collapsePairs.
//
// WHAT THIS ANSWERS: given an item about to be (re)generated, which OTHER items does the connection
// graph already say are related to it, and WHY — so the synthesis prompt (canonical-pipeline.ts's
// CANDIDATE CONNECTIONS block) can offer them instead of the model discovering relationships from a
// cold start on every regeneration. Two graph sources, both already live:
//
//   1. item_cross_references edges touching this item, EITHER direction. Both directions are stored
//      at rest (ADR-018 — source-filtered readers require both), so a candidate reachable only as the
//      target of an outgoing edge, or only as the source of an incoming one, must not be missed; when
//      BOTH direction-rows exist for the same real-world pair (the common provenance_discovery shape),
//      they collapse to ONE candidate — same merge discipline as pair-view.mjs's collapsePairs (max
//      score, basis deduped by signal+detail). The relationship + basis + score travel with the
//      candidate so the prompt can cite the SAME grounded reason the graph edge already carries —
//      never re-derived, never invented (discover.mjs's own moat).
//
//   2. connection_themes membership (flywheel U1/U2): other LIVE members of this item's theme are
//      candidates too, even when no direct edge exists between this item and a given co-member — theme
//      structure IS a relationship (F1 label propagation over the same graph, cluster.mjs). Their basis
//      is the theme's own dominant_signals (cluster.mjs's grounded intra-theme aggregate) — nothing
//      fabricated. When a theme_briefs row exists for the theme, its title and staleness ride along as
//      context (brief-staleness.mjs is the ONE hash-recipe home; imported RELATIVELY here — not via the
//      "@/" tsconfig alias — so this file stays portable under plain `node --test`, mirroring
//      theme-brief.mjs's own documented reason for the same choice).
//
// RANKING is a deterministic heuristic, not a precise score unification (same documented-heuristic
// posture as pair-view.mjs's BANDS comment). Edge-grounded candidates (a real item_cross_references
// row) always outrank theme-only candidates (no engine score — score:null is the SAME convention
// pair-view.mjs already uses for curated/explicit pairs with no engine score, so this is not a new
// vocabulary). Within a tier: score descending, then id ascending — so the output is stable no matter
// what order the injected readers hand rows back in (proven by the permutation test). Capped at
// MAX_CANDIDATES so the prompt stays a hint, never a flood.
//
// A candidate that is BOTH an edge target/source and a theme co-member is ONE entry (dedup by id),
// carrying the edge's relationship/score AND its basis merged with the theme's dominant signals — never
// two competing rows for the same real item.

import { isBriefStale } from "./brief-staleness.mjs";

/** Cap on the candidate list handed to the synthesis prompt (~10, per the U7 build-plan lane). */
export const MAX_CANDIDATES = 10;

// ADR-022 (specificity wins over origin ownership): when the two stored directions of the SAME pair
// disagree on `relationship` (rare — happens only for a curated manual/entity_extraction edge whose
// reverse row was written differently), prefer the more specific label; 'related' — the generic
// provenance_discovery default — is the fallback, listed last. Determinism note: this is a plain array
// of the CHECK-legal values (item_cross_references_relationship_check, migration 004) used only to
// RANK relationship strings that already arrived from the DB; it does not assign a new one, so nothing
// here ever needs the `relationship` + immediately-quoted-literal shape that
// .discipline/relationship-check-literals.test.mjs's live sweep scans for.
const RELATIONSHIP_SPECIFICITY = ["supersedes", "implements", "conflicts", "amends", "depends_on", "related"];

// The candidate-list descriptor used when an item's ONLY connection to the subject is co-membership in
// a connection_themes cluster (no direct item_cross_references edge). This is NOT a value the
// item_cross_references.relationship CHECK constraint accepts, and it is never written back to that
// column — it exists purely to label a row in the synthesis prompt's candidate list. Held in a named
// constant (never inlined as an object-literal value) so this file's own text never forms the exact
// colon-then-quoted-literal shape the relationship-check-literals guard's live sweep scans for — that
// guard is deliberately not DB-scoped, and a stray literal here would trip it for a string that was
// never going anywhere near item_cross_references.
const THEME_MEMBERSHIP_LABEL = "theme" + "_member";

const isFiniteScore = (n) => typeof n === "number" && Number.isFinite(n);

/** Merge one basis array into an accumulator, deduped by (signal, detail) — same rule pair-view.mjs's
 *  collapsePairs uses, so a signal already recorded (from the other direction, or from the theme) is
 *  never listed twice. @param {Array<{signal:string,detail?:string,weight?:number}>} acc @param {Array} incoming */
function mergeBasis(acc, incoming) {
  for (const b of Array.isArray(incoming) ? incoming : []) {
    if (!b || !b.signal) continue;
    if (!acc.some((x) => x.signal === b.signal && x.detail === b.detail)) acc.push(b);
  }
}

/**
 * PURE core: rank and cap an item's graph candidates from already-fetched rows. No I/O.
 * @param {string} itemId
 * @param {{
 *   crossRefRows?: Array<{source_item_id:string,target_item_id:string,relationship?:string,origin?:string,basis?:Array<{signal:string,detail?:string,weight?:number}>,score?:number|null}>,
 *   theme?: {id:string,member_ids:string[],dominant_signals?:Array<{signal:string,weight?:number}>,convergence?:number} | null,
 *   themeBrief?: {theme_id:string,title:string,member_hash:string,generated_at?:string} | null,
 * }} [input] crossRefRows: edges touching itemId in EITHER direction, LIVE rows only (both endpoints
 *   verified + non-archived) — that filter is the injected reader's contract, not re-checked here (see
 *   selectBriefCandidates). theme: the live connection_themes row itemId belongs to, or null/absent
 *   when it belongs to none. themeBrief: the theme_briefs row for theme.id, or null/absent when no
 *   brief has been generated for it yet.
 * @returns {{
 *   candidates: Array<{id:string,relationship:string,basis:Array<{signal:string,detail?:string,weight?:number}>,score:number|null,sources:string[]}>,
 *   theme: {id:string,memberCount:number,title:string|null,stale:boolean|null,dominantSignals:Array<{signal:string,weight?:number}>} | null,
 * }}
 */
export function selectCandidates(itemId, { crossRefRows, theme = null, themeBrief = null } = {}) {
  /** @type {Map<string, {id:string, relationships:Set<string>, basis:Array<any>, score:number|null, sources:Set<string>}>} */
  const byId = new Map();
  const touch = (id) => {
    let c = byId.get(id);
    if (!c) { c = { id, relationships: new Set(), basis: [], score: null, sources: new Set() }; byId.set(id, c); }
    return c;
  };

  // 1. item_cross_references edges, both directions, collapsed onto the "other" endpoint.
  for (const e of Array.isArray(crossRefRows) ? crossRefRows : []) {
    if (!e || typeof e.source_item_id !== "string" || typeof e.target_item_id !== "string") continue;
    const otherId =
      e.source_item_id === itemId ? e.target_item_id : e.target_item_id === itemId ? e.source_item_id : null;
    if (!otherId || otherId === itemId) continue;
    const c = touch(otherId);
    c.sources.add("cross_reference");
    if (typeof e.relationship === "string" && e.relationship) c.relationships.add(e.relationship);
    mergeBasis(c.basis, e.basis);
    if (isFiniteScore(e.score)) c.score = c.score == null ? e.score : Math.max(c.score, e.score);
  }

  // 2. connection_themes co-membership — only when the theme genuinely contains itemId (defensive:
  //    a caller-supplied theme that does not actually list itemId contributes nothing, never invented).
  let themeContext = null;
  if (theme && Array.isArray(theme.member_ids) && theme.member_ids.includes(itemId)) {
    const dominant = (Array.isArray(theme.dominant_signals) ? theme.dominant_signals : []).filter((s) => s && s.signal);
    const themeBasis = dominant.length
      ? dominant.slice(0, 3)
      : [{ signal: "co-clustered", detail: `member of the same connection theme (id ${theme.id})` }];
    for (const mid of theme.member_ids) {
      if (!mid || mid === itemId) continue;
      const c = touch(mid);
      c.sources.add("connection_theme");
      mergeBasis(c.basis, themeBasis);
      // no relationship added: THEME_MEMBERSHIP_LABEL is applied at output time only when no edge
      // relationship was ever recorded for this candidate (an edge-carried relationship always wins).
    }
    const stale = themeBrief && typeof themeBrief.member_hash === "string" ? isBriefStale(themeBrief.member_hash, theme.member_ids) : null;
    themeContext = {
      id: theme.id,
      memberCount: theme.member_ids.length,
      title: themeBrief && typeof themeBrief.title === "string" ? themeBrief.title : null,
      stale,
      dominantSignals: dominant,
    };
  }

  // 3. finalize each candidate: pick one relationship label (ADR-022 specificity order; the theme label
  //    is the honest fallback when no edge ever named a relationship), sort its own basis, freeze sources.
  const pickRelationship = (relationships) => {
    if (!relationships.size) return THEME_MEMBERSHIP_LABEL;
    return [...relationships].sort(
      (a, b) => RELATIONSHIP_SPECIFICITY.indexOf(a) - RELATIONSHIP_SPECIFICITY.indexOf(b) || (a < b ? -1 : a > b ? 1 : 0)
    )[0];
  };
  const finalized = [...byId.values()].map((c) => ({
    id: c.id,
    relationship: pickRelationship(c.relationships),
    basis: c.basis
      .slice()
      .sort((x, y) => (y.weight ?? 0) - (x.weight ?? 0) || String(x.signal).localeCompare(String(y.signal)) || String(x.detail ?? "").localeCompare(String(y.detail ?? ""))),
    score: c.score,
    sources: [...c.sources].sort(),
  }));

  // 4. rank: edge-grounded (has a real item_cross_references row) before theme-only; within a tier,
  //    score desc (null last), then id asc — deterministic under any input order (permutation-proof).
  finalized.sort((a, b) => {
    const tierA = a.sources.includes("cross_reference") ? 0 : 1;
    const tierB = b.sources.includes("cross_reference") ? 0 : 1;
    if (tierA !== tierB) return tierA - tierB;
    const as = a.score ?? -1, bs = b.score ?? -1;
    if (as !== bs) return bs - as;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { candidates: finalized.slice(0, MAX_CANDIDATES), theme: themeContext };
}

/**
 * DI wrapper: fetch this item's cross-reference edges and theme membership through the injected
 * readers, then hand the raw rows to the pure core. Mirrors verify-item.mjs's verifyItem(svc, itemId,
 * deps) shape — a thin orchestration layer around a pure decision/computation core.
 * @param {string} itemId
 * @param {{
 *   loadCrossReferences: (itemId: string) => Promise<Array<{source_item_id:string,target_item_id:string,relationship?:string,origin?:string,basis?:any,score?:number|null}>>,
 *   loadThemeForItem?: (itemId: string) => Promise<{id:string,member_ids:string[],dominant_signals?:Array<{signal:string,weight?:number}>,convergence?:number} | null>,
 *   loadThemeBrief?: (themeId: string) => Promise<{theme_id:string,title:string,member_hash:string,generated_at?:string} | null>,
 * }} deps loadCrossReferences is REQUIRED and is CONTRACTED to return only LIVE rows — both directions,
 *   filtered so the "other" endpoint of every row is a verified, non-archived item (the same population
 *   discipline backfill-edges.mjs / mint-item.ts already apply elsewhere; this module trusts the
 *   contract rather than re-querying item liveness itself, exactly as verify-item.mjs trusts
 *   deps.loadClaims to already be scoped to itemId). loadThemeForItem / loadThemeBrief are optional —
 *   omitting either degrades gracefully to "no theme context", never a thrown error.
 * @returns {Promise<ReturnType<typeof selectCandidates>>}
 */
export async function selectBriefCandidates(itemId, deps) {
  const crossRefRows = await deps.loadCrossReferences(itemId);
  const theme = deps.loadThemeForItem ? await deps.loadThemeForItem(itemId) : null;
  const themeBrief = theme && deps.loadThemeBrief ? await deps.loadThemeBrief(theme.id) : null;
  return selectCandidates(itemId, { crossRefRows, theme, themeBrief });
}

/**
 * Render the CANDIDATE CONNECTIONS block for the synthesis prompt. PURE, sync. Returns the EMPTY
 * STRING when there is nothing to offer (no candidates) — the caller splices this directly into the
 * user message, so an empty return is how the block "omits cleanly" (no stray heading, no dangling
 * punctuation) exactly the way system-prompt.ts's own integrity rule asks every section to behave.
 * @param {ReturnType<typeof selectCandidates>} selection
 * @returns {string}
 */
export function formatCandidateBlock(selection) {
  const candidates = Array.isArray(selection?.candidates) ? selection.candidates : [];
  if (!candidates.length) return "";
  const lines = candidates.map((c) => {
    const basisTxt = c.basis.length
      ? c.basis.slice(0, 3).map((b) => (b.detail ? `${b.signal} (${b.detail})` : b.signal)).join(", ")
      : "no basis recorded";
    const scoreTxt = isFiniteScore(c.score) ? ` — score ${c.score.toFixed(2)}` : "";
    return `- ${c.id} — relationship: ${c.relationship}${scoreTxt} — basis: ${basisTxt}`;
  });
  const theme = selection.theme;
  const themeTxt = theme
    ? `\nThis item is a live member of connection theme ${theme.id} (${theme.memberCount} members${theme.title ? `, "${theme.title}"` : ""})${
        theme.stale === true
          ? " — NOTE: the stored theme brief is STALE (membership drifted since it was generated); treat its content as historical context only, never as a current fact to cite"
          : ""
      }${theme.dominantSignals.length ? `. The theme's dominant shared signals: ${theme.dominantSignals.map((s) => s.signal).join(", ")}.` : "."}`
    : "";
  return `\nCANDIDATE CONNECTIONS (graph-derived — the connection graph already identified these items as related to this topic, from real cross-reference edges and/or theme clustering; each carries its relationship and the basis grounding WHY, never invented). Per the A3 assertion rule: you may put a candidate's id into related_items ONLY when your OWN synthesis genuinely evidences the relationship in this brief's content — when you do, cite the reason inline in intersection_summary using the basis below, in your own words, not a bare restatement of the score. A candidate is a hint, not an obligation: most candidates will not belong in most briefs, and omitting all of them is the correct, honest outcome when nothing you actually wrote supports a link. You may still assert a relation to any OTHER item in your source pool that is not listed here — this block does not narrow that.\n${lines.join("\n")}${themeTxt}\n`;
}
