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

import { isBriefStale } from "../connections/brief-staleness.mjs";

/**
 * @typedef {{ id: string, member_ids: string[] }} ConnectionThemeRow
 * @typedef {{ theme_id: string, title: string, brief_md: string, member_hash: string, generated_at: string }} ThemeBriefRow
 * @typedef {{
 *   themeId: string,
 *   title: string,
 *   briefMd: string,
 *   generatedAt: string,
 *   memberCount: number,
 *   stale: boolean,
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
 * @returns {ThemeBriefView | null}
 */
export function selectThemeBriefForItem(itemId, themes, briefs) {
  const theme = findThemeForItem(itemId, themes);
  if (!theme) return null;
  const brief = (Array.isArray(briefs) ? briefs : []).find((b) => b && b.theme_id === theme.id);
  if (!brief) return null;
  return {
    themeId: theme.id,
    title: brief.title,
    briefMd: brief.brief_md,
    generatedAt: brief.generated_at,
    memberCount: theme.member_ids.length,
    stale: isBriefStale(brief.member_hash, theme.member_ids),
  };
}
