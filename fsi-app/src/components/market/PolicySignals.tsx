"use client";

/**
 * PolicySignals — POLICY ACCELERATION SIGNALS list with sourced badges.
 *
 * Per dispatch G + CC3 (source citations):
 *   "POLICY ACCELERATION SIGNALS section with sourced badges per CC3
 *    (EUR-Lex, CARB, UK DfT, IRS / Federal Register style)"
 *
 * Data layer status: REAL.
 * - intelligence_items rows expose sourceName + sourceUrl + sourceTier
 *   (Resource type lines 150-153). Confirmed populated for items linked
 *   to a source row (45 of 123 in legacy seed; live DB has higher
 *   coverage post-Phase B).
 * - "Acceleration" filter: items with priority CRITICAL or HIGH AND
 *   added within the last 90 days. Composes with the page's existing
 *   priority filter naturally.
 * - Sourced badge: derived directly from sourceName, with sourceTier
 *   shown as a Tier-N pill when present.
 */

import type { Resource } from "@/types/resource";

interface PolicySignalsProps {
  items: Resource[];
  /** Window in days to consider "accelerating" (default 90). */
  windowDays?: number;
  /** Optional limit. */
  limit?: number;
}

const TIER_LABEL: Record<number, string> = {
  1: "T1",
  2: "T2",
  3: "T3",
  4: "T4",
  5: "T5",
  6: "T6",
  7: "T7",
};

// Item types that describe a vendor product, SaaS platform, news outlet, or
// research tracker rather than a quantitative policy/market signal. EcoVadis
// (type: "tool") is the canonical example operator surfaced 2026-05-12: it's
// a resource users can consult, but it does not contain a price, capacity,
// deployment milestone, or technology readiness shift on its own.
//
// Item-level routing (Wave 1c) will replace this with the source-role
// classifier once `source_role` is wired through Resource. Until then, the
// type+keyword gate below keeps POLICY ACCELERATION SIGNALS focused on
// items with quantitative or near-quantitative content.
const VENDOR_RESOURCE_TYPES = new Set([
  "tool",
  "tracker",
  "news",
  "journal",
  "industry",
]);

// Lightweight quantitative-signal heuristic. We look for any explicit number,
// currency symbol, percentage, unit-of-measure, or milestone vocabulary in
// the title + note + whyMatters strings. Intentionally permissive: the goal
// is to catch obvious vendor-description cards (no numbers, no timelines),
// not to grade the strength of every signal.
const QUANT_SIGNAL_RE = new RegExp(
  [
    "\\d",
    "[\\u20AC$\\u00A3\\u00A5]",
    "%",
    "\\b(?:tonne|ton|tco2|teu|kg|mwh|gwh|twh|barrel|bbl|gal|kwh|usd|eur|gbp|jpy|cny|inr)\\b",
    "\\b(?:price|quota|cap|threshold|deadline|effective|in force|phase[- ]in|phase[- ]out|takes effect)\\b",
    "\\b(?:milestone|deployment|capacity|production|order book|fleet|delivery)\\b",
  ].join("|"),
  "i"
);

function hasQuantitativeSignal(r: Resource): boolean {
  const text = `${r.title || ""} ${r.note || ""} ${r.whyMatters || ""}`;
  return QUANT_SIGNAL_RE.test(text);
}

/**
 * Filter that excludes vendor product / SaaS platform / news cards from the
 * POLICY ACCELERATION SIGNALS list. Vendor types pass only when they also
 * carry quantitative signal language (a price, quota, deployment count, or
 * compliance milestone). That's the operator's bar per the 2026-05-12
 * dispatch: knowing a resource exists is great but it's not worth a
 * separate section unless it's providing some intelligence.
 *
 * Exported for unit-test / audit reuse.
 */
export function isPolicyAccelerationSignal(r: Resource): boolean {
  const t = (r.type || "").toLowerCase();
  if (VENDOR_RESOURCE_TYPES.has(t)) {
    return hasQuantitativeSignal(r);
  }
  return true;
}

export function PolicySignals({
  items,
  windowDays = 90,
  limit = 8,
}: PolicySignalsProps) {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const accelerating = items
    .filter((it) => {
      if (it.priority !== "CRITICAL" && it.priority !== "HIGH") return false;
      const t = it.added ? new Date(it.added).getTime() : 0;
      if (t > 0 && t < cutoff) return false;
      // Vendor / SaaS / news cards (e.g. EcoVadis as a platform) do not
      // belong here unless they additionally carry quantitative content.
      return isPolicyAccelerationSignal(it);
    })
    .sort((a, b) => {
      const ar = a.priority === "CRITICAL" ? 0 : 1;
      const br = b.priority === "CRITICAL" ? 0 : 1;
      if (ar !== br) return ar - br;
      const at = a.added ? new Date(a.added).getTime() : 0;
      const bt = b.added ? new Date(b.added).getTime() : 0;
      return bt - at;
    })
    .slice(0, limit);

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          margin: "16px 0 10px",
        }}
      >
        Policy acceleration signals
      </div>

      {accelerating.length === 0 ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px dashed var(--border-sub)",
            borderRadius: "var(--r-sm)",
            padding: "14px 16px",
            fontSize: 12.5,
            color: "var(--text-2)",
            lineHeight: 1.55,
          }}
        >
          No CRITICAL or HIGH-priority signals in the last {windowDays} days
          for this section. As new items move into watch or elevated
          state, they appear here with primary-source attribution.
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {accelerating.map((it) => {
            const isCritical = it.priority === "CRITICAL";
            return (
              <li
                key={it.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-sub)",
                  borderLeft: `3px solid ${isCritical ? "var(--critical)" : "var(--high)"}`,
                  borderRadius: "var(--r-sm)",
                  padding: "10px 14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text)",
                      lineHeight: 1.35,
                    }}
                  >
                    {it.title}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      color: isCritical ? "var(--critical)" : "var(--high)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isCritical ? "WATCH" : "ELEVATED"}
                  </span>
                </div>

                {/* Sourced badge row per CC3 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 6,
                    fontSize: 11,
                    color: "var(--text-2)",
                  }}
                >
                  {it.sourceName ? (
                    <SourceBadge
                      name={it.sourceName}
                      tier={it.sourceTier}
                      url={it.sourceUrl || it.url}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--text-2)",
                        padding: "2px 6px",
                        border: "1px dashed var(--border-sub)",
                        borderRadius: 3,
                      }}
                    >
                      Source pending
                    </span>
                  )}
                  {it.jurisdiction && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: "var(--text-2)",
                      }}
                    >
                      · {it.jurisdiction}
                    </span>
                  )}
                  {it.added && (
                    <span style={{ fontSize: 10, color: "var(--text-2)" }}>
                      · {new Date(it.added).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>

                {it.note && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-2)",
                      lineHeight: 1.5,
                      margin: "6px 0 0",
                    }}
                  >
                    {it.note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SourceBadge({
  name,
  tier,
  url,
}: {
  name: string;
  tier?: number;
  url?: string;
}) {
  const inner = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--accent)",
        padding: "2px 6px",
        background: "var(--accent-strip)",
        border: "1px solid var(--accent-strip-bd)",
        borderRadius: 3,
      }}
    >
      {name}
      {tier && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "var(--text-2)",
            opacity: 0.85,
          }}
        >
          {TIER_LABEL[tier] || `T${tier}`}
        </span>
      )}
    </span>
  );
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open primary source: ${name}`}
        style={{ textDecoration: "none" }}
      >
        {inner}
      </a>
    );
  }
  return inner;
}
