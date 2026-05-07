"use client";

/**
 * AffectedLanesCard — right-rail card for /regulations/[id].
 *
 * Per dispatch F22: "AFFECTED LANES card (origin/destination city pairs,
 * freight modes, volume estimates)". Schema reality: there is no
 * lane-pair table in migrations 001-047. The closest signal we have is
 * `transport_modes` (modes[]) and `jurisdictions` (jurisdiction strings).
 *
 * Per the dispatch's halt clause for F22:
 *   "AFFECTED LANES requires substantial schema additions (defer to
 *    data layer track; render honest empty state per #33 banner pattern)"
 *
 * This component therefore renders an honest empty state by default,
 * surfacing the partial signal (modes + jurisdictions) it CAN derive
 * without claiming lane-level granularity it doesn't have. When backend
 * lane data ships, the component swaps shape; the card slot stays.
 *
 * The "honest empty" pattern matches WatchlistSidebar: a real visible
 * card that names what's missing, not a hidden component or a fake
 * placeholder masquerading as data.
 */

import type { Resource } from "@/types/resource";
import { JURISDICTIONS } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";

interface AffectedLanesCardProps {
  resource: Resource;
}

export function AffectedLanesCard({ resource: r }: AffectedLanesCardProps) {
  const modes = (r.modes && r.modes.length > 0 ? r.modes : [r.cat]).filter(
    Boolean
  );

  const jurisdictionLabels =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel)
      : r.jurisdiction
      ? [
          JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label ||
            r.jurisdiction,
        ]
      : [];

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
        }}
      >
        Affected lanes
      </div>

      {/* Mode chips — real signal */}
      {modes.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-2)",
              marginBottom: 6,
            }}
          >
            Modes
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {modes.map((m) => (
              <span
                key={m}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  background: "var(--bg)",
                  color: "var(--text)",
                  letterSpacing: "0.04em",
                }}
              >
                {m.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Jurisdiction chips — real signal */}
      {jurisdictionLabels.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-2)",
              marginBottom: 6,
            }}
          >
            Jurisdictions
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {jurisdictionLabels.map((j) => (
              <span
                key={j}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  border: "1px solid var(--border-sub)",
                  borderRadius: 3,
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontWeight: 600,
                }}
              >
                {j}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Honest empty banner — per dispatch halt clause */}
      <div
        style={{
          fontSize: 11,
          lineHeight: 1.5,
          color: "var(--muted)",
          paddingTop: 10,
          borderTop: "1px solid var(--border-sub)",
          fontStyle: "italic",
        }}
      >
        Lane-pair, volume, and origin/destination data not yet in schema.
        Workspace shipment integration will populate this card.
      </div>
    </div>
  );
}
