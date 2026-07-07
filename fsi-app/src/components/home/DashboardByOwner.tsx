"use client";

/**
 * DashboardByOwner — rail card. Aggregates resources by their `actionOwner`
 * field and surfaces who has the heaviest plate plus each owner's top item.
 *
 * Redesign TEMPLATE 01 (HANDOFF §6.3 + mock): titled card; the empty state is
 * the honest-state frame (§4). No fetcher — computed from hydrated resources.
 */

import { useMemo } from "react";
import Link from "next/link";
import { DashboardRailCard, RailEmptyFrame } from "./DashboardRailCard";
import type { Resource } from "@/types/resource";

export interface DashboardByOwnerProps {
  resources: Resource[];
}

const PRIORITY_RANK: Record<Resource["priority"], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MODERATE: 2,
  LOW: 3,
};

interface OwnerGroup {
  key: string;
  displayName: string;
  count: number;
  top: { id: string; title: string; priority: Resource["priority"] };
}

function aggregateOwners(resources: Resource[]): OwnerGroup[] {
  type Bucket = { key: string; casings: Map<string, number>; items: Resource[] };
  const buckets = new Map<string, Bucket>();

  for (const r of resources) {
    const raw = r.actionOwner?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, casings: new Map<string, number>(), items: [] };
      buckets.set(key, bucket);
    }
    bucket.casings.set(raw, (bucket.casings.get(raw) || 0) + 1);
    bucket.items.push(r);
  }

  const groups: OwnerGroup[] = [];
  for (const bucket of buckets.values()) {
    let displayName = bucket.key;
    let max = -1;
    for (const [casing, freq] of bucket.casings) {
      if (freq > max) {
        max = freq;
        displayName = casing;
      }
    }
    const sortedItems = bucket.items.slice().sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority];
      const pb = PRIORITY_RANK[b.priority];
      if (pa !== pb) return pa - pb;
      return a.title.localeCompare(b.title);
    });
    const topItem = sortedItems[0];
    groups.push({
      key: bucket.key,
      displayName,
      count: bucket.items.length,
      top: { id: topItem.id, title: topItem.title, priority: topItem.priority },
    });
  }

  groups.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return PRIORITY_RANK[a.top.priority] - PRIORITY_RANK[b.top.priority];
  });

  return groups;
}

export function DashboardByOwner({ resources }: DashboardByOwnerProps) {
  const groups = useMemo(() => aggregateOwners(resources), [resources]);

  if (groups.length === 0) {
    return (
      <DashboardRailCard title="By owner">
        <RailEmptyFrame
          body="No owners assigned yet. Assign owners to regulations from any detail page to populate this view."
          cta={{ label: "Pick a regulation to assign →", href: "/regulations" }}
        />
      </DashboardRailCard>
    );
  }

  const totalItems = groups.reduce((sum, g) => sum + g.count, 0);
  const topThree = groups.slice(0, 3);

  return (
    <DashboardRailCard
      title="By owner"
      count={`${totalItems} item${totalItems === 1 ? "" : "s"} · ${groups.length} owner${groups.length === 1 ? "" : "s"}`}
    >
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {topThree.map((g) => (
          <li key={g.key}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <Link
                href={`/regulations?owner=${encodeURIComponent(g.displayName)}`}
                prefetch={false}
                style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-text-primary)", textDecoration: "none" }}
              >
                {g.displayName}
              </Link>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                {g.count} item{g.count === 1 ? "" : "s"}
              </span>
            </div>
            <Link
              href={`/regulations/${g.top.id}`}
              prefetch={false}
              style={{ display: "block", fontSize: 11.5, color: "var(--color-text-secondary)", textDecoration: "none", marginTop: 2, lineHeight: 1.4 }}
            >
              {g.top.title}
            </Link>
          </li>
        ))}
      </ul>
    </DashboardRailCard>
  );
}
