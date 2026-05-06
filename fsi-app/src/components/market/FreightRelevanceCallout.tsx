"use client";

/**
 * FreightRelevanceCallout — yellow callout block on /market.
 *
 * Per dispatch G + visual reconciliation §3.4:
 *   "FREIGHT FORWARDING RELEVANCE callout (Dietl/Rockit-specific,
 *    yellow callout per design)"
 *
 * Static editorial copy by section. The Dietl/Rockit-specific framing
 * is workspace-scoped — when a different workspace mounts, the
 * default text is generic (driven by sectorProfile). This is a
 * pure UI component; the data is the same lifecycle filter context
 * the caller already maintains, plus an optional copy override.
 *
 * The "yellow" tone uses var(--high-bg) / var(--high) which renders as
 * the warm-amber accent in the light-first theme palette.
 */

interface FreightRelevanceCalloutProps {
  /** Section the callout is mounted under (drives default copy). */
  section: "tech" | "prices";
  /** Workspace sector profile, drives the closing line if recognized. */
  sectorProfile?: string[];
  /** Caller-supplied override copy (used when a more specific framing
   *  is appropriate — e.g. a focused jurisdiction filter). */
  body?: string;
}

const DEFAULT_TECH_COPY =
  "Technology readiness shifts on the air-freight side (SAF feedstocks, hydrogen propulsion ground equipment, on-aircraft sensor suites) and on the ocean-freight side (alternative marine fuels, port shore-power, autonomous coastal feeders) directly drive carrier capacity, surcharge structure, and lane-level cost trajectory. For high-value cargo (live events, fine art, luxury, automotive), readiness levels also gate which carriers can credibly meet client emissions claims on tender.";

const DEFAULT_PRICES_COPY =
  "Carbon, fuel, and trade-restriction signals translate into surcharge models, contract clauses, and customer pass-through positions. Items with WATCH lifecycle (threshold breached) are the highest-leverage to surface in customer comms — both as a cost explanation and as a signal that the lane mix or fuel-mix recommendation may need to change in the next 30-90 days.";

export function FreightRelevanceCallout({
  section,
  sectorProfile,
  body,
}: FreightRelevanceCalloutProps) {
  const copy =
    body ||
    (section === "tech" ? DEFAULT_TECH_COPY : DEFAULT_PRICES_COPY);

  // Sector-specific tail when sector profile is active.
  const sectorTail =
    sectorProfile && sectorProfile.length > 0
      ? ` Focus sectors in your workspace: ${sectorProfile.slice(0, 6).join(", ")}${sectorProfile.length > 6 ? ", ..." : ""}.`
      : "";

  return (
    <div
      role="note"
      aria-label="Freight forwarding relevance"
      style={{
        background: "var(--high-bg)",
        border: "1px solid var(--high-bd)",
        borderLeft: "4px solid var(--high)",
        borderRadius: "var(--r-md)",
        padding: "14px 18px",
        margin: "16px 0",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--high)",
          marginBottom: 8,
        }}
      >
        Freight forwarding relevance
      </div>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          margin: 0,
          color: "var(--text)",
        }}
      >
        {copy}
        {sectorTail}
      </p>
    </div>
  );
}
