/**
 * CorridorsAppliedStripView — the pure, sync render half of the "Corridors this applies on" block
 * (regulation detail, lane SCOPE-READER 2026-09-06). Split from CorridorsAppliedStrip.tsx for the SAME
 * reason every spec-09 panel is split (see that lane's SurchargeAuditPanelView.tsx / spec09-smoke.mjs
 * headers): the data-fetch half transitively imports Next's server request-tracing chain
 * (`@opentelemetry/api`), which a plain esbuild browser bundle cannot resolve — this file imports NOTHING
 * from `next/*` or `@/lib/supabase-server`/`@/lib/entities/corridor-scope-cache`, so the rendering guard's
 * smoke harness can mount it directly.
 *
 * NOTHING RENDERS EMPTY BY DESIGN (plan §W5): `corridors.length === 0` returns `null` — no card, no
 * "no corridors" line, exactly the honest-omission contract PeersDiscussingStrip/NoticesRail already use
 * elsewhere on this same route.
 *
 * Each corridor links to `/market#corridor-<entityId>` — an anchor onto its exact card in the carbon-cost
 * overlay (CarbonCostOverlay.tsx's own `id={corridor-<entityId>}`, matching this file's link), rather than
 * a `?corridor=` query param: a searchParams-driven filter would force /market's whole index page dynamic
 * again, undoing the PERF-10 lane's deliberate removal of `force-dynamic` there (see market/page.tsx's own
 * header) for a filter the overlay's small, single-screen corridor count (4 at authoring time) does not
 * need — every corridor already renders on that page, so scrolling to the right card serves the same
 * "show me this regulation's corridor" intent without the perf regression.
 */

import Link from "next/link";

export interface CorridorAppliedRow {
  entityId: string;
  label: string;
  jurisdictions: ReadonlyArray<{ code: string; name: string | null }>;
}

interface CorridorsAppliedStripViewProps {
  corridors: ReadonlyArray<CorridorAppliedRow>;
}

export function CorridorsAppliedStripView({ corridors }: CorridorsAppliedStripViewProps) {
  if (!corridors || corridors.length === 0) return null;

  return (
    <div
      data-guard-container
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "0 var(--cl-detail-pad-x, 24px) 28px",
      }}
    >
      <div
        style={{
          border: "1px solid var(--border-sub, #E3E3E0)",
          borderRadius: "var(--r-md, 8px)",
          background: "var(--surface, #FFFFFF)",
          padding: "14px 16px",
        }}
      >
        <div
          data-guard-title
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted, #767671)",
            marginBottom: 10,
          }}
        >
          Corridors this applies on
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {corridors.map((c) => (
            <Link
              key={c.entityId}
              href={`/market#corridor-${encodeURIComponent(c.entityId)}`}
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                minHeight: 44,
                padding: "6px 8px",
                borderRadius: 6,
                textDecoration: "none",
                color: "var(--text, #17171B)",
                border: "1px solid var(--border-sub, #E3E3E0)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, overflowWrap: "anywhere", minWidth: 0 }}>{c.label}</span>
              {c.jurisdictions.length > 0 && (
                <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {c.jurisdictions.map((j) => (
                    <span
                      key={j.code}
                      style={{
                        fontSize: 10,
                        padding: "2px 7px",
                        border: "1px solid var(--border-sub, #E3E3E0)",
                        borderRadius: 999,
                        background: "var(--bg, #FAFAF8)",
                        color: "var(--text-2, #4A4A46)",
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {j.name ? `${j.name} (${j.code})` : j.code}
                    </span>
                  ))}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted, #767671)" }}>
                View on Market Intel &rarr;
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
