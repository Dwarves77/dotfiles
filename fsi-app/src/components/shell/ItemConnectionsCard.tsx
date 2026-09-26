"use client";

/**
 * ItemConnectionsCard — shared right-rail "connections" card for an item detail page (flywheel U9, D1).
 *
 * Supersedes regulations/LinkedItemsCard.tsx (deleted in this PR, CLAUDE.md rule 9 — deprecation means
 * deletion, not annotation): that card only had direction (References / Referenced by) to work with
 * because the data layer didn't return `relationship`/`origin`/`basis`/`score`. It now does (U9 widened
 * fetchIntelligenceItem's item_cross_references select — same query, more columns, no new data path).
 * This card is the single home for rendering a connection row on ANY of the four intelligence surfaces
 * (Regulations/Market/Operations/Research) — one visual pattern, not four near-duplicates.
 *
 * Card pattern deliberately mirrors ThemesView.tsx's ThemeCard (flywheel U3): truncated-id text where
 * no title is available, colored pill spans for basis signals, a right-aligned numeric score. Unlike
 * ThemeCard, item titles ARE linked here — real per-surface detail routes exist for all four surfaces
 * now (checked before building this, see U9 research), so a title always gets a real href, routed to
 * the TARGET item's own surface (not assumed to be the viewer's current surface) via `surface`/`href`
 * already resolved by connection-view-model.mjs's buildAllConnectionRows.
 *
 * Pure view-model (labels, sort, basis truncation, href-by-surface) lives in
 * src/lib/connections/connection-view-model.mjs (execution-wired tests) — this component only renders.
 */

import type { CSSProperties } from "react";
import type { Supersession, ItemConnection } from "@/types/resource";
import { buildAllConnectionRows } from "@/lib/connections/connection-view-model.mjs";
import { formatNumber } from "@/lib/format";

interface ItemConnectionsCardProps {
  connections: ItemConnection[];
  /** Supersessions involving this item (either side) — a distinct table (item_supersessions), rendered
   *  first (strongest semantic relationship), same as the retired LinkedItemsCard. */
  supersessions: Supersession[];
  /** This item's own UI id (legacy_id || uuid) — determines supersession direction. */
  selfId: string;
  resourceLookup: Record<string, { id: string; title: string; priority: string }>;
  /** Card title — defaults to "Connections". */
  title?: string;
  /**
   * Design handoff 2026-09-25 (#801, boards 03/07/09): "Connections strip moves into the masthead
   * card; the rail Connections card is removed." `"masthead"` renders the artboard's own masthead
   * strip (`Caros Ledge UI System.dc.html`, the "Connections · N linked items" block: Anton 17px
   * title + a muted count, then a `repeat(3, minmax(0,1fr))` grid of bare link-cards, kind label
   * over a 2-line title, `border-left:2px solid var(--brand)`) rather than this component's own
   * bordered/shadowed rail box, since the masthead's `SectionCard` already supplies the one card
   * shell (Masthead.tsx's `connectionsSlot`, same pattern as its `actionSlot`). Default `"rail"` is
   * unchanged for the one surface (market, board 05) the new boards do not move: rule 19 - the
   * boards move only 03/07/09, so market's existing rail placement is not guessed into matching.
   */
  variant?: "rail" | "masthead";
}

function toneFor(row: { label: string; discovered: boolean }): string {
  if (row.label === "Supersedes" || row.label === "Superseded by") return "var(--high)";
  if (row.discovered) return "var(--accent)";
  return "var(--muted)";
}

function MastheadConnections({
  rows,
  title,
}: {
  rows: ReturnType<typeof buildAllConnectionRows>;
  title: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ padding: "16px 20px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontSize: 17,
            lineHeight: 1,
            color: "var(--ink)",
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: "var(--fs-105)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" }}>
          {formatNumber(rows.length)} linked {rows.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
        {rows.slice(0, 6).map((row) => {
          const body = (
            <>
              <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700, whiteSpace: "nowrap" }}>
                {row.label}
                {row.surface !== "uncategorized" ? ` · ${row.surface}` : ""}
              </span>
              <span
                title={row.title}
                style={{
                  fontSize: "var(--fs-125)",
                  fontWeight: 700,
                  lineHeight: 1.35,
                  color: "var(--ink)",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  overflowWrap: "anywhere",
                }}
              >
                {row.title}
              </span>
            </>
          );
          const cardStyle: CSSProperties = {
            display: "flex",
            flexDirection: "column",
            gap: 3,
            minWidth: 0,
            padding: "9px 12px",
            border: "1px solid var(--line-1)",
            borderLeft: "2px solid var(--brand)",
            borderRadius: "0 6px 6px 0",
            background: "var(--card)",
            textDecoration: "none",
            color: "inherit",
          };
          return row.href ? (
            <a key={row.id} href={row.href} style={cardStyle}>
              {body}
            </a>
          ) : (
            <div key={row.id} style={cardStyle}>
              {body}
            </div>
          );
        })}
      </div>
      {rows.length > 6 && (
        <div style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", fontStyle: "italic" }}>+ {rows.length - 6} more</div>
      )}
    </div>
  );
}

export function ItemConnectionsCard({
  connections,
  supersessions,
  selfId,
  resourceLookup,
  title = "Connections",
  variant = "rail",
}: ItemConnectionsCardProps) {
  const rows = buildAllConnectionRows(supersessions, selfId, connections, resourceLookup);

  if (variant === "masthead") {
    return <MastheadConnections rows={rows} title={title} />;
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-sub)",
        borderRadius: "var(--r-md)",
        padding: "14px 16px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 10,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text-2)" }}>
          {formatNumber(rows.length)}
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--muted)", fontStyle: "italic" }}>
          No connections on file yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.slice(0, 8).map((row) => {
            const body = (
              <>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: toneFor(row),
                    marginBottom: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{row.label}</span>
                  {row.surface !== "uncategorized" && <span style={{ fontWeight: 600 }}>· {row.surface}</span>}
                </div>
                {/* DEFECT 6 (lane opsclip, train 61, 2026-09-08): these entries rendered the FULL
                    untruncated regulation title, running 8 to 12 lines each in a 300px rail and
                    turning the card into a wall of text. The artboard truncates each entry to a
                    scannable line. Two lines, clamped, with the full title on `title`, a clamp
                    draws its own ellipsis, so nothing is cut without a sign. */}
                <div
                  title={row.title}
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.4,
                    color: "var(--text)",
                    fontWeight: 600,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    overflowWrap: "anywhere",
                  }}
                >
                  {row.title}
                </div>
                {row.discovered && row.basisSummary.length > 0 && (
                  <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {row.basisSummary.map((b) => (
                      <span
                        key={b.signal}
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: 999,
                          background: "var(--accent-strip, rgba(30,58,138,0.08))",
                          color: "var(--accent)",
                        }}
                      >
                        {b.signal.replaceAll("_", " ")}
                        {typeof row.score === "number" ? ` · ${row.score.toFixed(2)}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </>
            );
            return row.href ? (
              <a key={row.id} href={row.href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                {body}
              </a>
            ) : (
              <div key={row.id}>{body}</div>
            );
          })}
          {rows.length > 8 && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontStyle: "italic" }}>
              + {rows.length - 8} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
