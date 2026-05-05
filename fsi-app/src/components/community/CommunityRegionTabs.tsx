"use client";

/**
 * CommunityRegionTabs — horizontal scrolling row of region tabs that
 * filter the community feed by `region`.
 *
 * Tabs follow the canonical region codes from migration 028:
 *   EU · UK · US · LATAM · APAC · HK · MEA · GLOBAL
 *
 * Selecting a tab shallow-updates ?region=<code> using the App Router
 * useRouter()/useSearchParams() pair so the URL stays canonical and a
 * full reload re-hydrates the same view. The active tab is underlined
 * in the critical (primary accent) color and its count chip is filled.
 *
 * Counts are passed in by the server component; they reflect the set
 * of groups currently visible to the caller via RLS (public groups +
 * private where the user is a member).
 */

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { CommunityRegion } from "./types";

interface CommunityRegionTabsProps {
  regions: CommunityRegion[];
  counts: Record<string, number>;
  initialRegion: string;
}

export function CommunityRegionTabs({
  regions,
  counts,
  initialRegion,
}: CommunityRegionTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = (searchParams.get("region") || initialRegion).toUpperCase();

  const onSelect = useCallback(
    (code: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("region", code.toLowerCase());
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div
      role="tablist"
      aria-label="Filter by region"
      style={{
        display: "flex",
        gap: 0,
        alignItems: "stretch",
        padding: "0 36px",
        background: "var(--color-bg-raised, var(--color-bg-surface))",
        borderBottom: "1px solid var(--color-border)",
        overflowX: "auto",
      }}
      className="scrollbar-none"
    >
      {regions.map((r) => {
        const on = r.code === active;
        const ct = counts[r.code] ?? 0;
        return (
          <button
            key={r.code}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(r.code)}
            style={{
              padding: "14px 18px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: on ? "var(--color-primary)" : "var(--color-text-secondary)",
              cursor: "pointer",
              borderBottom: on
                ? "3px solid var(--color-primary)"
                : "3px solid transparent",
              borderLeft: 0,
              borderRight: 0,
              borderTop: 0,
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
              background: "transparent",
              fontFamily: "inherit",
            }}
          >
            {r.label}
            <span
              style={{
                fontSize: 10,
                padding: "1px 7px",
                borderRadius: 999,
                background: on ? "var(--color-primary)" : "var(--color-bg-surface)",
                border: on
                  ? "1px solid var(--color-primary)"
                  : "1px solid var(--color-border)",
                color: on ? "#fff" : "var(--color-text-muted)",
                fontWeight: 700,
              }}
            >
              {ct}
            </span>
          </button>
        );
      })}
    </div>
  );
}
