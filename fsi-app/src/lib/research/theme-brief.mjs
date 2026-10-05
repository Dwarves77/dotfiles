// theme-brief.mjs — pure view-model for WO-25's Research-detail theme-brief card.
//
// WHAT THIS IS FOR. `connection_themes` (flywheel U1/U2) clusters intelligence_items across all four
// surfaces; `theme_briefs` (migration 266, flywheel U6) stores a durable, already-synthesized editorial
// brief per theme, generated session-executed at $0. Today the ONLY reader of either table is the
// admin-only `/admin` ThemesView (via api/admin/themes/route.ts) — a Research finding's own detail page
// has no way to know its cluster or brief exist, even though 34 of 38 live Research items belong to one
// (measured live 2026-08-30; see WO-25's session report for the query). This module is the SAME join
// api/admin/themes/route.ts already performs (connection_themes -> theme_briefs, keyed on theme id),
// narrowed from "every theme" to "the one theme (if any) a single item belongs to" — the shape a per-item
// detail page needs. It performs NO I/O itself: the page fetches the (small, public-read) connection_themes
// table and the matching theme_briefs row with a plain supabase-js client, exactly like the existing
// UUID-redirect and related-findings blocks in research/[slug]/page.tsx already do, and hands the rows to
// `selectThemeBriefForItem` here.
//
// READ-ONLY, $0, NO GENERATION. This module never writes, never clusters, never calls an LLM. It renders
// rows a prior operator-directed pass already produced. Regenerating a stale/missing brief is out of
// scope for this surface entirely (the U7 boundary, connection-redesign scope doc §4 order 8) — a STOP
// condition for whoever reads this file next, not a TODO to fill in here.
//
// STALENESS: ONE HOME. The hash recipe (sort member_ids, empty-join, md5) lives ONLY in
// src/lib/connections/brief-staleness.mjs (imported below, relatively — this file must stay portable
// under plain `node --test`, so it does not use the `@/` tsconfig alias, mirroring the other
// src/lib/connections/*.mjs modules' own import style). Do not re-implement the comparison here.
//
// ORPHAN CONTRACT (migration 266's own header): "a brief whose theme id vanishes from connection_themes
// is ORPHANED and hidden by the join, kept as history, never invented into the UI." selectThemeBriefForItem
// enforces this BY CONSTRUCTION, not by an extra check: it only ever looks at a theme_briefs row reached
// FROM a live connection_themes row (the same direction api/admin/themes/route.ts joins in) — a brief row
// whose theme_id matches no row in the live `themes` array is never visited, exactly like the admin route.

import { resolveBriefForTheme } from "../connections/brief-staleness.mjs";
import { SURFACE_LABELS, SURFACE_ORDER } from "../connections/connection-view-model.mjs";
import { surfaceOf } from "../surface-of.mjs";
// One parser and one heading map for a brief's `ramifications` section: the validator that admits a brief
// (scripts/turns/theme-briefs/schema.mjs) and this reader must agree on what a "### <Surface>" subsection
// is. Same src-imports-scripts precedent as src/lib/research/assess.mjs.
import { parseRamifications, SURFACE_HEADING } from "../../../scripts/turns/theme-briefs/schema.mjs";

/**
 * @typedef {{ id: string, member_ids: string[], density?: number|null }} ConnectionThemeRow
 * @typedef {{ theme_id: string, title: string, brief_md: string, member_hash: string, generated_at: string, member_ids?: string[]|null }} ThemeBriefRow
 * @typedef {{
 *   themeId: string,
 *   title: string,
 *   briefMd: string,
 *   generatedAt: string,
 *   memberCount: number,
 *   density: number|null,
 *   stale: boolean,
 *   supersedesThemeId: string|null,
 * }} ThemeBriefView
 */

/**
 * Find the live theme (if any) whose member_ids contains itemId. Clusters are disjoint components
 * (cluster.mjs / migration 253's own comment: "themes are disjoint"), so at most one match is expected
 * on a healthy corpus; if more than one somehow matches (a clustering-pass anomaly, not a shape this
 * function should paper over), the first is returned rather than silently merging or dropping data.
 * @param {string} itemId
 * @param {ConnectionThemeRow[]} themes
 * @returns {ConnectionThemeRow | null}
 */
export function findThemeForItem(itemId, themes) {
  if (!itemId || !Array.isArray(themes)) return null;
  for (const t of themes) {
    if (t && Array.isArray(t.member_ids) && t.member_ids.includes(itemId)) return t;
  }
  return null;
}

/**
 * Build the render-ready view-model for one item, or null when there is honestly nothing to show:
 * the item is in no live theme (3-4 of 38 today), or its theme has no theme_briefs row yet.
 * Staleness is ALWAYS recomputed against the live theme's member_ids, never trusted from storage —
 * same posture as api/admin/themes/route.ts. A stale brief still returns its content (title/brief_md
 * populated) with `stale: true` — the caller renders it WITH a visible STALE badge, never as
 * indistinguishable-from-current content (migration 266: "STALENESS IS DETECTED, NEVER SILENT").
 * @param {string} itemId
 * @param {ConnectionThemeRow[]} themes
 * @param {ThemeBriefRow[]} briefs
 * @param {{lineage?: Array<{prior_id:string,new_id:string}>}} [opts] lineage from the latest run's theme_delta,
 *   so a pre-migration-351 brief (no stored members) is still found after its theme id drifted
 * @returns {ThemeBriefView | null}
 */
export function selectThemeBriefForItem(itemId, themes, briefs, opts = {}) {
  const theme = findThemeForItem(itemId, themes);
  if (!theme) return null;
  // ONE lookup (src/lib/connections/brief-staleness.mjs resolveBriefForTheme, lane S3-C): the brief stored
  // under this theme's own id, or, when the theme id drifted because its smallest member changed, the best
  // overlapping prior brief served STALE. A brief that belongs to another live theme is never borrowed.
  const resolved = resolveBriefForTheme(theme, Array.isArray(briefs) ? briefs : [], {
    liveThemeIds: new Set((Array.isArray(themes) ? themes : []).map((t) => t && t.id).filter(Boolean)),
    lineage: Array.isArray(opts?.lineage) ? opts.lineage : [],
  });
  const brief = resolved.brief;
  if (!brief) return null;
  return {
    themeId: theme.id,
    title: brief.title,
    briefMd: brief.brief_md,
    generatedAt: brief.generated_at,
    memberCount: theme.member_ids.length,
    // Artboard 07's CLUSTER SYNTHESIS meta line reads "85 items · density 0.180". `density` is
    // the cluster's intra-theme edge density (src/lib/connections/cluster.mjs F3), stored on
    // connection_themes.density and already selected by api/admin/themes/route.ts. Null when the
    // caller did not select it or the row predates it, the card omits the segment, never renders 0.
    density: typeof theme.density === "number" ? theme.density : null,
    // Always recomputed against the live member_ids (never trusted from storage); an overlap or lineage
    // match is stale by construction.
    stale: resolved.stale,
    // The prior theme whose brief this view serves (null for an exact-id brief). Present so a surface can
    // say "this synthesis was written for an earlier cluster".
    supersedesThemeId: resolved.supersedes_theme_id,
    // The structured sections (migration 351), null for a brief written before it or a database without
    // the column (the read tolerates its absence).
    sections: brief.sections && typeof brief.sections === "object" && !Array.isArray(brief.sections) ? brief.sections : null,
  };
}

/** Members shown per page before "and N more". A theme can hold dozens of items. */
export const MAX_MEMBERS_PER_PAGE = 6;

const trimOrNull = (x) => (typeof x === "string" && x.trim() ? x.trim() : null);

/**
 * The cross-page theme analysis for one item on one page (lane S3-B), or null when the item is in no theme.
 * A superset of selectThemeBriefForItem's view (themeId, title, briefMd, generatedAt, memberCount, density,
 * stale, supersedesThemeId stay), plus:
 *   hasBrief / absence      a theme with no brief says what is missing instead of vanishing
 *   sections                {connection, meaning, forThisPage, watch, gaps} when the brief is structured;
 *                           `forThisPage` is ONLY the ramifications subsection for the viewing page, so
 *                           another page's ramifications never travel to this page's render
 *   ramificationsMissing    structured brief with no subsection for this page
 *   pages                   the pages the theme spans (from its members' own item type and domain)
 *   membersByPage           the OTHER members grouped by page (other pages first, this page last), capped
 * `members` are the live, verified, non-archived items of the theme (id, legacy_id, title, item_type, domain).
 * PURE.
 * @param {{itemId:string, surface:string, themes:Array, briefs:Array, lineage?:Array, members?:Array}} input
 */
export function buildThemeAnalysisView({ itemId, surface, themes, briefs, lineage = [], members = [] } = {}) {
  const theme = findThemeForItem(itemId, themes);
  if (!theme) return null;
  const brief = selectThemeBriefForItem(itemId, [theme, ...(Array.isArray(themes) ? themes.filter((t) => t && t.id !== theme.id) : [])], briefs, { lineage });
  const pivotRank = new Map((Array.isArray(theme.pivots) ? theme.pivots : []).map((p, i) => [p?.id, i]));
  const rows = [];
  for (const m of Array.isArray(members) ? members : []) {
    if (!m || typeof m.id !== "string" || m.id === itemId || !Array.isArray(theme.member_ids) || !theme.member_ids.includes(m.id)) continue;
    const s = surfaceOf(m.item_type, m.domain);
    if (!SURFACE_LABELS[s] || !trimOrNull(m.title)) continue;
    const uiId = m.legacy_id || m.id;
    rows.push({ id: m.id, title: m.title.trim(), href: `/${s}/${encodeURIComponent(uiId)}`, surface: s });
  }
  const spanned = new Set(rows.map((r) => r.surface));
  const own = SURFACE_LABELS[surface] ? surface : null;
  if (own) spanned.add(own);
  const pages = SURFACE_ORDER.filter((s) => spanned.has(s)).map((s) => ({ surface: s, label: SURFACE_LABELS[s] }));
  const membersByPage = [...SURFACE_ORDER.filter((s) => s !== own), ...SURFACE_ORDER.filter((s) => s === own)]
    .filter((s) => rows.some((r) => r.surface === s))
    .map((s) => {
      const all = rows
        .filter((r) => r.surface === s)
        .sort((a, b) => (pivotRank.get(a.id) ?? 1e9) - (pivotRank.get(b.id) ?? 1e9) || a.title.localeCompare(b.title));
      return {
        surface: s,
        label: SURFACE_LABELS[s],
        samePage: s === own,
        total: all.length,
        items: all.slice(0, MAX_MEMBERS_PER_PAGE).map(({ id, title, href }) => ({ id, title, href })),
        moreHref: all.length > MAX_MEMBERS_PER_PAGE ? `/${s}` : null,
      };
    });

  let sections = null;
  let ramificationsMissing = false;
  if (brief?.sections) {
    const subs = parseRamifications(brief.sections.ramifications).subs;
    const mine = own ? trimOrNull(subs.get(SURFACE_HEADING[own])) : null;
    ramificationsMissing = !mine;
    sections = {
      connection: trimOrNull(brief.sections.connection),
      meaning: trimOrNull(brief.sections.meaning),
      forThisPage: mine,
      watch: trimOrNull(brief.sections.watch),
      gaps: trimOrNull(brief.sections.gaps),
    };
  }
  return {
    themeId: theme.id,
    title: brief ? brief.title : null,
    briefMd: brief ? brief.briefMd : null,
    generatedAt: brief ? brief.generatedAt : null,
    memberCount: Array.isArray(theme.member_ids) ? theme.member_ids.length : 0,
    density: typeof theme.density === "number" ? theme.density : null,
    stale: brief ? brief.stale : false,
    supersedesThemeId: brief ? brief.supersedesThemeId : null,
    hasBrief: Boolean(brief),
    absence: brief ? null : "A brief for this theme has not been written yet, so what this connection means is not stated here.",
    sections,
    ramificationsMissing,
    pages,
    membersByPage,
  };
}

/** Other-member links a chip carries beyond its own link (the Research strip's existing behaviour). */
export const MAX_CHIP_MEMBER_LINKS = 3;

/**
 * Theme chips for a list page's strip (surface set) or the dashboard (surface null), lane S3-B. PURE.
 *   surface set  every theme with at least one item on that page, most convergent first; the chip opens
 *                the highest-centrality member ON THAT PAGE (pivot rank, then title).
 *   surface null every theme spanning at least `minPages` pages; the chip opens its top pivot.
 * Pages are classified from each member's own item type and domain (surfaceOf, the router the pages use),
 * not from connection_themes.surfaces, which is computed from item type alone.
 * @param {{themes:Array, items:Array, briefs?:Array, lineage?:Array, surface?:string|null, minPages?:number, max?:number}} input
 * @returns {Array<{themeId:string, href:string, itemTitle:string, briefTitle:string|null, memberCount:number,
 *   pages:Array<{surface:string,label:string}>, hasBrief:boolean, stale:boolean,
 *   links:Array<{title:string, href:string}>}>}
 */
export function buildThemeChips({ themes, items, briefs = [], lineage = [], surface = null, minPages = 1, max = 6 } = {}) {
  const itemsById = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    if (it && typeof it.id === "string" && trimOrNull(it.title)) itemsById.set(it.id, it);
  }
  const list = (Array.isArray(themes) ? themes : []).filter((t) => t && typeof t.id === "string" && Array.isArray(t.member_ids));
  const liveThemeIds = new Set(list.map((t) => t.id));
  const out = [];
  for (const t of list) {
    const pivotRank = new Map((Array.isArray(t.pivots) ? t.pivots : []).map((p, i) => [p?.id, i]));
    const members = [];
    for (const id of t.member_ids) {
      const it = itemsById.get(id);
      if (!it) continue;
      const s = surfaceOf(it.item_type, it.domain);
      if (!SURFACE_LABELS[s]) continue;
      members.push({ id, title: it.title.trim(), href: `/${s}/${encodeURIComponent(it.legacy_id || id)}`, surface: s });
    }
    members.sort((a, b) => (pivotRank.get(a.id) ?? 1e9) - (pivotRank.get(b.id) ?? 1e9) || a.title.localeCompare(b.title));
    const pageSet = new Set(members.map((m) => m.surface));
    if (pageSet.size < minPages) continue;
    const target = surface ? members.find((m) => m.surface === surface) : members[0];
    if (!target) continue;
    const resolved = resolveBriefForTheme(t, Array.isArray(briefs) ? briefs : [], { liveThemeIds, lineage: Array.isArray(lineage) ? lineage : [] });
    const others = members.filter((m) => m.id !== target.id);
    const crossFirst = [...others.filter((m) => m.surface !== target.surface), ...others.filter((m) => m.surface === target.surface)];
    out.push({
      themeId: t.id,
      convergence: typeof t.convergence === "number" ? t.convergence : 0,
      href: target.href,
      itemTitle: target.title,
      briefTitle: resolved.brief ? resolved.brief.title ?? null : null,
      memberCount: t.member_ids.length,
      pages: SURFACE_ORDER.filter((s) => pageSet.has(s)).map((s) => ({ surface: s, label: SURFACE_LABELS[s] })),
      hasBrief: Boolean(resolved.brief),
      stale: resolved.brief ? resolved.stale : false,
      links: crossFirst.slice(0, MAX_CHIP_MEMBER_LINKS).map(({ title, href }) => ({ title, href })),
    });
  }
  out.sort((a, b) => b.convergence - a.convergence || (a.themeId < b.themeId ? -1 : 1));
  return out.slice(0, Math.max(0, max)).map((chip) => {
    const { convergence: _convergence, ...rest } = chip;
    return rest;
  });
}
