/**
 * VendorMentionsRail — side-card showing a small subset of vendors
 * mentioned this week. Lifts a 4-row preview into the right rail of
 * /community/[slug] and the default /community body, with a deep-link
 * down to /community/vendors for the full directory.
 *
 * Why a static lift, not an API fetch:
 *   The source page /community/vendors stores its directory inline as a
 *   client-side VENDORS array (see src/app/community/vendors/page.tsx).
 *   The dispatch's "additive UI only, no backend changes" rule plus the
 *   reuse-before-construction principle make a static slice the right
 *   choice here. When the vendor backend lands in Phase D (per the
 *   "Coming soon" toast on that page), this rail can switch to the same
 *   data path without any visual change.
 *
 *   Selection: the four most distinct + verified vendors from the
 *   curated list, mirroring the design preview's "EU VENDORS MENTIONED
 *   THIS WEEK" pattern (Chenue ✓, Mtec Fine Art ✓, Earthcrate, Rokbox).
 *
 * Pure presentational, server-renderable (no hooks).
 */

import Link from "next/link";
import { Check } from "lucide-react";

interface VendorRow {
  name: string;
  verified: boolean;
  blurb: string;
}

const RAIL_VENDORS: VendorRow[] = [
  { name: "Chenue", verified: true, blurb: "EV art transport · biofuel" },
  { name: "Mtec Fine Art", verified: true, blurb: "Sustainable crating" },
  { name: "Earthcrate", verified: false, blurb: "Reusable crating" },
  { name: "Rokbox", verified: false, blurb: "Reusable hard cases" },
];

export function VendorMentionsRail() {
  return (
    <aside
      aria-label="Vendors mentioned this week"
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            margin: 0,
          }}
        >
          Vendors mentioned
        </h3>
        <Link
          href="/community/vendors"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-text-secondary)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Directory →
        </Link>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {RAIL_VENDORS.map((v) => (
          <li
            key={v.name}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              paddingBottom: 8,
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                lineHeight: 1.3,
              }}
            >
              {v.name}
              {v.verified && (
                <span
                  aria-label="Verified vendor"
                  title="Verified vendor"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    color: "var(--color-low, var(--color-text-secondary))",
                  }}
                >
                  <Check size={11} strokeWidth={2.5} aria-hidden="true" />
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                lineHeight: 1.4,
              }}
            >
              {v.blurb}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
