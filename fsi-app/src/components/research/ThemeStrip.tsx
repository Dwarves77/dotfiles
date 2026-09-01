/**
 * ThemeStrip — the CUSTOMER-FACING cross-surface themes strip for the Research LIST page, lane SURF
 * (2026-09-01). Server component, no "use client".
 *
 * WHY THIS EXISTS. connection_themes (flywheel U1/U2, migration 253) clusters intelligence_items across
 * all four surfaces — 9 live themes today — and is read by exactly one surface: the admin-only ThemesView
 * (src/components/sources/ThemesView.tsx, via the platform-admin-gated GET /api/admin/themes). No
 * customer sees a theme at all. This component is the first customer-facing render of connection_themes.
 *
 * DATA ACCESS + THE RLS FINDING (verified live this session, not assumed). Both tables read through the
 * SAME request-scoped client (createSupabaseServerClient — cookie-bound, anon key, RLS applies), per this
 * lane's instruction. Verified live via `set local role anon`:
 *   - connection_themes: public read (migration 253, `USING (true)`) — 9/9 rows visible to anon.
 *   - theme_briefs: RLS ENABLED WITH NO POLICIES (migration 266's own comment: "RLS on with no policies
 *     = deny-all to anon/authenticated; the service role bypasses RLS by construction") — 0/9 rows
 *     visible to anon. research/[slug]/page.tsx's existing theme-brief card only works today because
 *     that page reads through a SERVICE-ROLE client for its whole block, not because theme_briefs is
 *     actually public-read. This CONTRADICTS the assumption that both tables are public-read — reported
 *     rather than silently worked around (this lane has no migrations in its write set to fix the RLS
 *     gap). This component still queries theme_briefs through the request-scoped client (future-correct:
 *     the moment an operator adds a public SELECT policy, brief badges start appearing with no code
 *     change here) but degrades to "no brief" today, honestly — it never blocks or errors on the empty
 *     result.
 *
 * "NAME FROM PIVOTS' TITLES" — deliberately NOT theme_briefs.title (the admin ThemesView's own brief
 * title is a separate, optional, LLM-authored editorial title this component does not have read access
 * to today per the finding above, and the task's own instruction is explicit: derive the name from the
 * pivot). connection_themes.pivots is `{id, centrality}[]` (top members by weighted-degree centrality,
 * cluster.mjs/F2) — this component takes the HIGHEST-centrality pivot's own intelligence_items.title as
 * the theme's display name, a real, grounded string rather than the admin panel's own truncated-id
 * rendering ("a1b2c3d4… (0.82)", ThemesView.tsx's ThemeCard) — this surface can do better because it
 * joins pivot ids back to their items, which the admin panel never does.
 *
 * NO NEW JOIN HOME. The connection_themes -> theme_briefs attach-by-id is the same one-line Map join
 * already inlined twice in this codebase (api/admin/themes/route.ts, research/[slug]/page.tsx) — not a
 * new pattern introduced here. The staleness hash comparison (member_hash vs live member_ids) is NOT
 * re-implemented here; it is imported from its one real home, src/lib/connections/brief-staleness.mjs
 * (which src/lib/research/theme-brief.mjs itself imports from, for the identical reason).
 *
 * ITEM LOOKUP is the SAME customer read gate used throughout this lane's other new surfaces
 * (is_archived=false + provenance_status='verified') — belt-and-suspenders on top of migration 157/259's
 * intelligence_items_read RLS policy, which already enforces exactly that.
 */

import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { itemDetailHref } from "@/lib/item-links";
import { isBriefStale } from "@/lib/connections/brief-staleness.mjs";

interface ConnectionThemeRow {
  id: string;
  member_ids: string[];
  surfaces: string[];
  pivots: { id: string; centrality: number }[];
}

interface ThemeBriefRow {
  theme_id: string;
  member_hash: string;
}

interface ItemLite {
  id: string;
  title: string;
  legacy_id: string | null;
  type?: string | null;
  domain?: number | null;
}

/** How many themes the compact strip shows at once — connection_themes is small (9 live), but this
 *  caps defensively rather than assuming the corpus stays that size. */
const MAX_THEMES = 6;
/** How many member links (beyond the pivot itself) each theme card shows. */
const MAX_MEMBER_LINKS = 3;

export async function ThemeStrip() {
  const supabase = await createSupabaseServerClient();

  let themes: ConnectionThemeRow[] = [];
  try {
    const { data } = await supabase
      .from("connection_themes")
      .select("id, member_ids, surfaces, pivots")
      .order("convergence", { ascending: false })
      .limit(MAX_THEMES);
    themes = (data ?? []) as ConnectionThemeRow[];
  } catch {
    return null; // soft-fail — never breaks the Research list page
  }
  if (themes.length === 0) return null; // honest omission — no live themes, no strip

  // Best-effort brief presence, per this component's own header note on the live RLS finding — an empty
  // result here (today's reality) is not an error, just fewer badges.
  let briefsByThemeId = new Map<string, ThemeBriefRow>();
  try {
    const { data: briefRows } = await supabase
      .from("theme_briefs")
      .select("theme_id, member_hash")
      .in("theme_id", themes.map((t) => t.id));
    briefsByThemeId = new Map((briefRows ?? []).map((b: ThemeBriefRow) => [b.theme_id, b]));
  } catch {
    briefsByThemeId = new Map();
  }

  // Collect: the top pivot id per theme (for the display name) + up to MAX_MEMBER_LINKS more member ids
  // per theme (for the "linking to member items" chips), deduped across themes into one batched lookup.
  const idsNeeded = new Set<string>();
  const topPivotIdByTheme = new Map<string, string | null>();
  const linkMemberIdsByTheme = new Map<string, string[]>();
  for (const t of themes) {
    const pivots = Array.isArray(t.pivots) ? [...t.pivots].sort((a, b) => (b.centrality ?? 0) - (a.centrality ?? 0)) : [];
    const topPivotId = pivots[0]?.id ?? null;
    topPivotIdByTheme.set(t.id, topPivotId);
    if (topPivotId) idsNeeded.add(topPivotId);

    const memberIds = Array.isArray(t.member_ids) ? t.member_ids : [];
    const links = memberIds.filter((id) => id !== topPivotId).slice(0, MAX_MEMBER_LINKS);
    linkMemberIdsByTheme.set(t.id, links);
    for (const id of links) idsNeeded.add(id);
  }

  const itemsById = new Map<string, ItemLite>();
  const idList = [...idsNeeded];
  try {
    for (let i = 0; i < idList.length; i += 200) {
      const { data: itemRows } = await supabase
        .from("intelligence_items")
        .select("id, title, legacy_id, type, domain")
        .eq("is_archived", false)
        .eq("provenance_status", "verified")
        .in("id", idList.slice(i, i + 200));
      for (const row of (itemRows ?? []) as ItemLite[]) itemsById.set(row.id, row);
    }
  } catch {
    // soft-fail — themes with no resolvable pivot title are dropped below rather than shown blank
  }

  const cards = themes
    .map((t) => {
      const pivotId = topPivotIdByTheme.get(t.id) ?? null;
      const pivotItem = pivotId ? itemsById.get(pivotId) : undefined;
      if (!pivotItem) return null; // honest omission — never a theme card with a fabricated/blank name
      const brief = briefsByThemeId.get(t.id);
      const stale = brief ? isBriefStale(brief.member_hash, t.member_ids) : null;
      const links = (linkMemberIdsByTheme.get(t.id) ?? [])
        .map((id) => itemsById.get(id))
        .filter((x): x is ItemLite => Boolean(x));
      return {
        id: t.id,
        pivotItem,
        memberCount: Array.isArray(t.member_ids) ? t.member_ids.length : 0,
        surfaces: Array.isArray(t.surfaces) ? t.surfaces : [],
        links,
        hasBrief: Boolean(brief),
        stale,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (cards.length === 0) return null;

  return (
    <section style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 36px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <h2
          style={{
            fontSize: 13,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Themes across the corpus
        </h2>
        <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
          {cards.length} active
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
        {cards.map((c) => (
          <ThemeCard key={c.id} card={c} />
        ))}
      </div>
    </section>
  );
}

function ThemeCard({
  card,
}: {
  card: {
    id: string;
    pivotItem: ItemLite;
    memberCount: number;
    surfaces: string[];
    links: ItemLite[];
    hasBrief: boolean;
    stale: boolean | null;
  };
}) {
  return (
    <div
      style={{
        flex: "0 0 260px",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "10px 12px",
        background: "var(--color-surface)",
      }}
    >
      <Link
        href={itemDetailHref({ id: card.pivotItem.legacy_id || card.pivotItem.id, type: card.pivotItem.type, domain: card.pivotItem.domain })}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {card.pivotItem.title}
        </div>
      </Link>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "5px 0" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)" }}>
          {card.memberCount} {card.memberCount === 1 ? "item" : "items"}
        </span>
        {card.surfaces.map((s) => (
          <span
            key={s}
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.03em",
              padding: "1px 5px",
              borderRadius: 4,
              color: "var(--color-primary)",
              background: "var(--color-active-bg, rgba(37,99,235,0.08))",
            }}
          >
            {s}
          </span>
        ))}
        {card.hasBrief && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              padding: "1px 5px",
              borderRadius: 4,
              color: card.stale ? "var(--color-warning)" : "var(--color-text-muted)",
              border: "1px solid currentColor",
            }}
          >
            {card.stale ? "Brief · stale" : "Brief"}
          </span>
        )}
      </div>
      {card.links.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {card.links.map((m) => (
            <Link
              key={m.id}
              href={itemDetailHref({ id: m.legacy_id || m.id, type: m.type, domain: m.domain })}
              style={{
                fontSize: 11,
                color: "var(--color-text-secondary)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              · {m.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
