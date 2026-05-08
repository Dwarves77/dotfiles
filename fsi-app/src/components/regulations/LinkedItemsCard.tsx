"use client";

/**
 * LinkedItemsCard — right-rail card for /regulations/[id].
 *
 * Per dispatch F22: "LINKED ITEMS card (cross-references with
 * relationship type)".
 *
 * Schema reality (item_cross_references — migration 004):
 *   - source_item_id, target_item_id, relationship (related/supersedes/
 *     implements/conflicts/amends/depends_on)
 *
 * Data layer reality (fetchIntelligenceItem in supabase-server.ts):
 *   - Returns xrefIds[] (this item references X) and refByIds[] (X
 *     references this item).
 *   - Does NOT currently return the `relationship` field.
 *
 * Out-of-scope to extend supabase-server.ts in this PR (file scope
 * constraint). So we render direction (Cross-reference / Referenced by)
 * as the available relationship signal — that's a real, accurate
 * relationship type ("this -> X" vs "X -> this") even when the agent's
 * relationship vocabulary is missing. When the data layer ships
 * relationship strings, this component swaps to render them as chips.
 *
 * Supersessions are also surfaced because they're a strict subtype of
 * cross-reference with semantic meaning ("supersedes" / "superseded by").
 */

import type { Supersession } from "@/types/resource";

interface LinkedItemsCardProps {
  /** Item ids this regulation references. */
  xrefIds: string[];
  /** Item ids that reference this regulation. */
  refByIds: string[];
  /** Supersession entries involving this item (either side). */
  supersessions: Supersession[];
  /** This regulation's UI id (legacy_id || uuid) — used to determine
   *  supersession direction. */
  selfId: string;
  /** Title/priority lookup for related items. */
  resourceLookup: Record<
    string,
    { id: string; title: string; priority: string }
  >;
}

interface LinkRow {
  id: string;
  title: string;
  /** Relationship type as a short uppercase label. */
  relationship: string;
  /** Which colour token the relationship chip uses. */
  tone: "accent" | "high" | "moderate";
}

export function LinkedItemsCard({
  xrefIds,
  refByIds,
  supersessions,
  selfId,
  resourceLookup,
}: LinkedItemsCardProps) {
  const rows: LinkRow[] = [];
  const seen = new Set<string>();

  // Supersessions first — strongest semantic relationships.
  for (const s of supersessions) {
    if (s.old === selfId && s.new && !seen.has(s.new)) {
      const ref = resourceLookup[s.new];
      rows.push({
        id: s.new,
        title: ref?.title || s.newTitle || s.new,
        relationship: "Superseded by",
        tone: "high",
      });
      seen.add(s.new);
    } else if (s.new === selfId && s.old && !seen.has(s.old)) {
      const ref = resourceLookup[s.old];
      rows.push({
        id: s.old,
        title: ref?.title || s.oldTitle || s.old,
        relationship: "Supersedes",
        tone: "high",
      });
      seen.add(s.old);
    }
  }

  // Outgoing cross-references — this item links to these.
  for (const id of xrefIds) {
    if (seen.has(id)) continue;
    const ref = resourceLookup[id];
    if (!ref) continue;
    rows.push({
      id,
      title: ref.title,
      relationship: "References",
      tone: "accent",
    });
    seen.add(id);
  }

  // Incoming cross-references — these items link to this one.
  for (const id of refByIds) {
    if (seen.has(id)) continue;
    const ref = resourceLookup[id];
    if (!ref) continue;
    rows.push({
      id,
      title: ref.title,
      relationship: "Referenced by",
      tone: "moderate",
    });
    seen.add(id);
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
        {/* User-visible label is "Linked regulations" per walkthrough P0
            rename. Component name stays LinkedItemsCard for backwards
            compatibility with existing imports. */}
        <span>Linked regulations</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "var(--text-2)",
          }}
        >
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.5,
            color: "var(--muted)",
            fontStyle: "italic",
          }}
        >
          No cross-references on file yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.slice(0, 8).map((row) => (
            <a
              key={`${row.id}-${row.relationship}`}
              href={`/regulations/${encodeURIComponent(row.id)}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "block",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: TONE_COLOR[row.tone],
                  marginBottom: 2,
                }}
              >
                {row.relationship}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.4,
                  color: "var(--text)",
                  fontWeight: 600,
                }}
              >
                {row.title}
              </div>
            </a>
          ))}
          {rows.length > 8 && (
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                marginTop: 2,
                fontStyle: "italic",
              }}
            >
              + {rows.length - 8} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TONE_COLOR: Record<LinkRow["tone"], string> = {
  accent: "var(--accent)",
  high: "var(--high)",
  moderate: "var(--moderate)",
};
