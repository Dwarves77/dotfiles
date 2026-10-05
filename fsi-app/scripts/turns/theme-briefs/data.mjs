// data.mjs: the reads and the pure bundle assembly shared by the theme-briefs export and apply (lane S3-C).
//
// ONE home for "what a theme brief is authored from and validated against", so the export that hands an
// author the bundle and the apply step that validates the author's batch read the SAME rows the SAME way
// (a second copy would let the export show one thing and the validator check another). Every function here
// takes its database reads as injected deps ({ readAll, readAllByIds }, the scripts/lib/db.mjs shapes) so
// the fixture tests run with no database, and nothing here writes.
//
// Reuse: gaps come from src/lib/connections/gaps.mjs detectGaps (the same detector analyze-corpus runs),
// surfaces from src/lib/surface-of.mjs, the staleness and continuity lookup from brief-staleness.mjs
// resolveBriefForTheme, the lineage from theme-delta.mjs. Nothing is recomputed here.

import { detectGaps } from "../../../src/lib/connections/gaps.mjs";
import { computeMemberHash, resolveBriefForTheme } from "../../../src/lib/connections/brief-staleness.mjs";
import { lineageFromThemeDelta } from "../../../src/lib/connections/theme-delta.mjs";
import { surfaceOf } from "../../../src/lib/surface-of.mjs";
import { figureTokens } from "./schema.mjs";

export const THEME_COLUMNS = "id, member_ids, dominant_signals, surfaces, density, convergence, pivots";
export const MEMBER_COLUMNS = "id, title, item_type, domain, jurisdiction_iso, priority, summary, added_date";
export const CLAIM_COLUMNS = "id, intelligence_item_id, claim_kind, claim_text, source_id";
export const EVENT_COLUMNS = "id, intelligence_item_id, event_date, date_precision, event_kind, obligation_text, source_span, confidence";
export const EDGE_COLUMNS = "source_item_id, target_item_id, relationship, origin, basis, score";
const BRIEF_COLUMNS_BASE = "theme_id, member_hash, member_count, title, generated_at, generated_by";
const BRIEF_COLUMNS_STRUCTURED = `${BRIEF_COLUMNS_BASE}, member_ids`;

/** Live themes, all of them or the named ids. */
export async function loadThemes({ readAll, readAllByIds }, themeIds = null) {
  if (Array.isArray(themeIds)) {
    return themeIds.length ? readAllByIds("connection_themes", THEME_COLUMNS, themeIds) : [];
  }
  return readAll("connection_themes", THEME_COLUMNS);
}

/**
 * Every stored brief, with member_ids when migration 351 is applied. A database without the column answers
 * the first read with an error; the second read drops it, so this works before and after the migration.
 */
export async function loadBriefs({ readAll }) {
  try {
    return { rows: await readAll("theme_briefs", BRIEF_COLUMNS_STRUCTURED, { orderBy: "theme_id" }), structured: true };
  } catch (err) {
    if (!/member_ids|column/i.test(String(err?.message ?? err))) throw err;
    return { rows: await readAll("theme_briefs", BRIEF_COLUMNS_BASE, { orderBy: "theme_id" }), structured: false };
  }
}

/** The prior-to-new theme id pairs of the latest finished analyze-corpus run (migration 276 theme_delta). */
export async function loadLineage({ readAll }) {
  const runs = await readAll("connection_theme_runs", "id, started_at, status, theme_delta", {
    orderBy: "started_at",
    match: (q) => q.eq("status", "ok"),
  });
  const latest = [...runs].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at))).pop();
  return lineageFromThemeDelta(latest?.theme_delta ?? null);
}

/**
 * Members, grounded claims, forward events and intra-theme edges for a set of themes, read once for the
 * union of their members. Grounded claims are FACT claims (the kind the grounding gate verifies).
 */
export async function loadThemeMaterial({ readAll, readAllByIds }, themes) {
  const memberIds = [...new Set(themes.flatMap((t) => t.member_ids || []))].sort();
  if (!memberIds.length) return { items: [], claims: [], events: [], edges: [], jurisdictionWeights: {} };
  const items = await readAllByIds("intelligence_items", MEMBER_COLUMNS, memberIds);
  const claimsAll = await readAllByIds("section_claim_provenance", CLAIM_COLUMNS, memberIds, {
    idColumn: "intelligence_item_id",
    orderBy: ["intelligence_item_id", "id"],
  });
  const events = await readAllByIds("item_forward_events", EVENT_COLUMNS, memberIds, {
    idColumn: "intelligence_item_id",
    orderBy: ["intelligence_item_id", "id"],
  });
  const edges = await readAllByIds("item_cross_references", EDGE_COLUMNS, memberIds, { idColumn: "source_item_id", orderBy: ["source_item_id", "target_item_id"] });
  const ws = await readAll("workspace_settings", "jurisdiction_weights");
  const jurisdictionWeights = ws[0]?.jurisdiction_weights && typeof ws[0].jurisdiction_weights === "object" ? ws[0].jurisdiction_weights : {};
  return { items, claims: claimsAll.filter((c) => c.claim_kind === "FACT"), events, edges, jurisdictionWeights };
}

/** The gaps gaps.mjs computes for each theme, keyed by theme id. Same inputs analyze-corpus passes it. */
export function computeThemeGaps(themes, { items, jurisdictionWeights }) {
  const jurisdictionsByMember = {};
  for (const it of items) if (it.jurisdiction_iso) jurisdictionsByMember[it.id] = it.jurisdiction_iso;
  const shaped = themes.map((t) => ({
    id: t.id,
    members: t.member_ids || [],
    surfaces: t.surfaces || [],
    pivots: Array.isArray(t.pivots) ? t.pivots : [],
  }));
  const gaps = detectGaps(shaped, { profile: { jurisdictions: jurisdictionWeights || {} }, jurisdictionsByMember });
  const byTheme = new Map();
  for (const g of gaps) {
    if (!byTheme.has(g.subject_ref)) byTheme.set(g.subject_ref, []);
    byTheme.get(g.subject_ref).push({ type: g.type, description: g.description, recommended_actions: g.recommended_actions, evidence: g.evidence });
  }
  return byTheme;
}

/** The validator's context: themes, per-member claim and event id sets and titles, and the gap lists. */
export function buildValidationContext(themes, material, gapsByTheme) {
  const themesById = new Map(themes.map((t) => [t.id, { id: t.id, member_ids: t.member_ids || [], surfaces: t.surfaces || [] }]));
  const membersById = new Map();
  for (const it of material.items) membersById.set(it.id, { title: it.title, claim_ids: new Set(), event_ids: new Set() });
  for (const c of material.claims) membersById.get(c.intelligence_item_id)?.claim_ids.add(c.id);
  for (const e of material.events) membersById.get(e.intelligence_item_id)?.event_ids.add(e.id);
  // Tokens (numbers, acronyms) the intra-theme edge basis names: the shared scenarios and objects the author
  // is told to name in the connection section are system facts, not member claims.
  const basisTokensByTheme = new Map();
  for (const t of themes) {
    const memberSet = new Set(t.member_ids || []);
    const tokens = new Set();
    for (const e of material.edges) {
      if (!memberSet.has(e.source_item_id) || !memberSet.has(e.target_item_id)) continue;
      for (const b of Array.isArray(e.basis) ? e.basis : []) for (const tk of figureTokens(b?.detail)) tokens.add(tk);
    }
    basisTokensByTheme.set(t.id, tokens);
  }
  return { themesById, membersById, gapsByTheme, basisTokensByTheme };
}

/**
 * Which themes need a brief, and why. A theme is skipped only when a brief stored under its own id is
 * current. Order: convergence descending, then id (the order the themes surface lists them in).
 * @returns {Array<{theme:object, reason:"no_brief"|"stale"|"superseded", prior:object|null, supersedes_theme_id:string|null}>}
 */
export function themesNeedingBrief(themes, briefs, { lineage = [] } = {}) {
  const liveThemeIds = new Set(themes.map((t) => t.id));
  const out = [];
  for (const theme of themes) {
    const r = resolveBriefForTheme(theme, briefs, { liveThemeIds, lineage });
    if (r.match === "exact" && !r.stale) continue;
    let reason = "no_brief";
    if (r.match === "exact") reason = "stale";
    else if (r.match === "overlap" || r.match === "lineage") reason = "superseded";
    out.push({ theme, reason, prior: r.brief, supersedes_theme_id: r.supersedes_theme_id });
  }
  out.sort((a, b) => (b.theme.convergence ?? 0) - (a.theme.convergence ?? 0) || (a.theme.id < b.theme.id ? -1 : 1));
  return out;
}

const size = (x) => JSON.stringify(x).length;

/**
 * One theme's bundle, within a character budget, with honest truncation reporting.
 * Fixed part first (theme fields, gaps, edges with their full basis, highest score first); then members in
 * pivot order (most connected first), each with its summary, grounded claims and forward events. When a
 * member does not fit whole, its claims and events are cut one by one; a member whose bare record does not
 * fit is omitted. Every cut is counted in `truncation`; nothing is dropped silently.
 */
export function buildThemeBundle(need, material, gaps, { charBudget }) {
  const { theme, reason, prior, supersedes_theme_id } = need;
  const memberSet = new Set(theme.member_ids || []);
  const itemById = new Map(material.items.map((i) => [i.id, i]));
  const claimsBy = new Map();
  for (const c of material.claims) if (memberSet.has(c.intelligence_item_id)) (claimsBy.get(c.intelligence_item_id) ?? claimsBy.set(c.intelligence_item_id, []).get(c.intelligence_item_id)).push(c);
  const eventsBy = new Map();
  for (const e of material.events) if (memberSet.has(e.intelligence_item_id)) (eventsBy.get(e.intelligence_item_id) ?? eventsBy.set(e.intelligence_item_id, []).get(e.intelligence_item_id)).push(e);

  const allEdges = material.edges
    .filter((e) => memberSet.has(e.source_item_id) && memberSet.has(e.target_item_id))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || String(a.source_item_id + a.target_item_id).localeCompare(String(b.source_item_id + b.target_item_id)));

  const head = {
    theme_id: theme.id,
    member_hash: computeMemberHash(theme.member_ids || []),
    needs: reason,
    supersedes_theme_id: supersedes_theme_id ?? null,
    prior_brief: prior ? { theme_id: prior.theme_id, title: prior.title ?? null, generated_at: prior.generated_at ?? null } : null,
    member_count: (theme.member_ids || []).length,
    surfaces: theme.surfaces || [],
    convergence: theme.convergence ?? null,
    pivots: theme.pivots ?? [],
    dominant_signals: theme.dominant_signals ?? [],
    gaps: gaps || [],
  };
  let used = size(head);

  const edges = [];
  for (const e of allEdges) {
    const s = size(e);
    if (used + s > charBudget) break;
    edges.push(e);
    used += s;
  }

  const pivotRank = new Map((Array.isArray(theme.pivots) ? theme.pivots : []).map((p, i) => [p.id, i]));
  const ordered = [...(theme.member_ids || [])].sort((a, b) => (pivotRank.get(a) ?? 99) - (pivotRank.get(b) ?? 99) || (a < b ? -1 : 1));

  const members = [];
  const omittedMembers = [];
  let claimsTotal = 0, claimsOmitted = 0, eventsTotal = 0, eventsOmitted = 0;
  for (const id of ordered) {
    const it = itemById.get(id);
    const claims = (claimsBy.get(id) ?? []).map((c) => ({ claim_id: c.id, kind: c.claim_kind, claim_text: c.claim_text, source_id: c.source_id ?? null }));
    const events = (eventsBy.get(id) ?? []).map((e) => ({
      event_id: e.id, event_date: e.event_date, date_precision: e.date_precision, event_kind: e.event_kind,
      obligation_text: e.obligation_text, source_span: e.source_span, confidence: e.confidence,
    }));
    claimsTotal += claims.length;
    eventsTotal += events.length;
    const rec = {
      id,
      title: it?.title ?? null,
      item_type: it?.item_type ?? null,
      surface: it ? surfaceOf(it.item_type, it.domain) : "uncategorized",
      jurisdictions: it?.jurisdiction_iso ? [it.jurisdiction_iso] : [],
      priority: it?.priority ?? null,
      summary: it?.summary ?? null,
      claims: [],
      forward_events: [],
    };
    const bare = size(rec);
    if (used + bare > charBudget) {
      omittedMembers.push({ id, title: it?.title ?? null });
      claimsOmitted += claims.length;
      eventsOmitted += events.length;
      continue;
    }
    used += bare;
    // Events first (they date the watch section), then claims, each kept while the budget allows.
    for (const ev of events) {
      const s = size(ev);
      if (used + s > charBudget) { eventsOmitted++; continue; }
      rec.forward_events.push(ev);
      used += s;
    }
    for (const c of claims) {
      const s = size(c);
      if (used + s > charBudget) { claimsOmitted++; continue; }
      rec.claims.push(c);
      used += s;
    }
    members.push(rec);
  }

  return {
    ...head,
    members,
    intra_theme_edges: edges,
    truncation: {
      char_budget: charBudget,
      chars_used: used,
      members_total: ordered.length,
      members_included: members.length,
      members_omitted: omittedMembers.length,
      omitted_members: omittedMembers,
      claims_total: claimsTotal,
      claims_omitted: claimsOmitted,
      forward_events_total: eventsTotal,
      forward_events_omitted: eventsOmitted,
      edges_total: allEdges.length,
      edges_omitted: allEdges.length - edges.length,
    },
  };
}
