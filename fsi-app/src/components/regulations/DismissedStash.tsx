"use client";

/**
 * DismissedStash — collapsed drawer at the bottom of /regulations.
 *
 * Sprint 3 followup Part 2.
 *
 * Shows workspace-dismissed regulations (regulations where
 * workspace_item_overrides.dismissed_at IS NOT NULL). Uses a native
 * <details> element so the drawer ships zero JS for the open/close
 * itself. Per CLAUDE.md accordion default-state rule (in force from
 * 2026-05-07), the drawer is CLOSED by default.
 *
 * Style:
 *   - dashed border, paper-tinted background, padding
 *   - summary: "Dismissed regulations" + live count badge + italic hint
 *   - expanded body: 2-column grid of rows showing jurisdiction kicker +
 *     title + "↺ Restore" pill button on the right
 *   - empty state inside the body when count = 0 (the drawer renders
 *     only when there's something to show OR an explicit always-render
 *     prop is set; for now we render the drawer iff count > 0 to keep
 *     the bottom of /regulations clean for workspaces that don't dismiss)
 *
 * Integrity rule: the count badge derives from the array length, never
 * a hardcoded number.
 */

import type { Resource } from "@/types/resource";

interface DismissedStashProps {
  dismissed: Resource[];
  /** Fires when operator clicks ↺ Restore on a row. Caller writes
   *  dismissed_at=null and the resource re-enters its Kanban column on
   *  the next render. */
  onRestore: (id: string) => void;
}

export function DismissedStash({ dismissed, onRestore }: DismissedStashProps) {
  // Don't render the drawer at all when nothing is dismissed. Keeps the
  // bottom of /regulations clean for the common case. The dispatch spec
  // describes the empty state inside the open drawer; we treat the
  // never-dismissed-anything state as "no drawer at all" since the
  // drawer's whole purpose is to surface non-zero dismissals.
  if (dismissed.length === 0) return null;

  return (
    <details
      style={{
        marginTop: 32,
        padding: "16px 20px",
        background: "var(--color-surface-raised, #F5F2EE)",
        border: "1px dashed var(--color-border-strong, rgba(0,0,0,0.20))",
        borderRadius: "var(--radius-md, 8px)",
      }}
    >
      {/* IMPORTANT: no `open` attribute. Per CLAUDE.md (2026-05-07
          accordion default-state rule), accordions are CLOSED across
          the platform. */}
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          listStyle: "none",
        }}
      >
        <span style={{ fontWeight: 700 }}>Dismissed regulations</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 22,
            height: 18,
            padding: "0 7px",
            background: "var(--color-text-primary)",
            color: "#fff",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {dismissed.length}
        </span>
        <span
          style={{
            fontStyle: "italic",
            color: "var(--color-text-muted)",
            fontWeight: 400,
            fontSize: 12,
          }}
        >
          Click to expand · click ↺ Restore on any row to bring back into your active columns
        </span>
      </summary>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
        }}
      >
        <style>{`
          @media (max-width: 720px) {
            details > div { grid-template-columns: 1fr !important; }
          }
        `}</style>
        {dismissed.map((r) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              alignItems: "center",
              padding: "10px 12px",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "var(--radius-sm, 4px)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  marginBottom: 4,
                }}
              >
                {r.jurisdiction ? r.jurisdiction.toUpperCase() : "GLOBAL"}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  lineHeight: 1.35,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={r.title}
              >
                {r.title}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRestore(r.id);
              }}
              aria-label={`Restore ${r.title}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 999,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: "var(--color-text-primary)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {/* Unicode "anticlockwise open circle arrow" — not an emoji */}
              <span>↺</span>
              Restore
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
