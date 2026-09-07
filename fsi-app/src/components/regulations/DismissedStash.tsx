"use client";

/**
 * DismissedStash — collapsed disclosure at the foot of the /regulations
 * primary card, restored (UILISTS2 lane, 2026-09-07; operator ruling: an
 * app feature not shown in the 17 artboards is restored exactly, not
 * redesigned). Deleted by the UILISTS lane's Template-02 rebuild
 * (2026-09-06) along with the per-row priority retag; both are back — see
 * RegulationsLedger.tsx's own header.
 *
 * Shows workspace-dismissed regulations (workspace_item_overrides.
 * dismissed_at IS NOT NULL) with a restore path. Built on the shared
 * MoreBelowDisclosure primitive (train 49, src/components/shared/) instead
 * of the original lane's hand-rolled `<details>` shell — same native,
 * zero-JS-for-open/close disclosure, closed by default, one shared
 * component instead of a second copy of the same pattern (CLAUDE.md rule
 * 13). Renders nothing when nothing is dismissed (MoreBelowDisclosure's own
 * `count <= 0` rule).
 */

import { MoreBelowDisclosure } from "@/components/shared/MoreBelowDisclosure";
import type { Resource } from "@/types/resource";

interface DismissedStashProps {
  dismissed: Resource[];
  /** Fires when operator clicks Restore on a row. Caller writes
   *  dismissed_at=null and the resource re-enters the active band list on
   *  the next render. */
  onRestore: (id: string) => void;
}

export function DismissedStash({ dismissed, onRestore }: DismissedStashProps) {
  return (
    <div style={{ marginTop: 8 }}>
      <MoreBelowDisclosure count={dismissed.length} itemNoun="dismissed regulations">
        <div className="cl-dismissed-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <style>{`
            @media (max-width: 720px) {
              .cl-dismissed-grid { grid-template-columns: 1fr !important; }
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
                background: "var(--card)",
                border: "1px solid var(--line-2)",
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
                    color: "var(--ink-3)",
                    marginBottom: 4,
                  }}
                >
                  {r.jurisdiction ? r.jurisdiction.toUpperCase() : "GLOBAL"}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--ink)",
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
                  minHeight: 44,
                  padding: "6px 12px",
                  background: "var(--card)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 999,
                  fontFamily: "inherit",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "var(--ink)",
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
      </MoreBelowDisclosure>
    </div>
  );
}
