"use client";

/**
 * DashboardByOwner — rail widget (bottom). Aggregates resources by their
 * `actionOwner` field (canonical name resolved per Track 1E investigation;
 * see src/types/resource.ts:158). Surfaces who has the heaviest plate plus
 * each owner's most-urgent item.
 *
 * - No fetcher. Computed in-component from the already-hydrated resources.
 * - Display-layer normalisation: name.trim().toLowerCase() as group key,
 *   display the most-frequent original casing.
 * - Sort by count desc, ties broken by highest priority of the top item.
 * - Slice to top 3.
 *
 * Empty state uses spec-verbatim copy.
 *
 * CSS in src/app/globals.css under the "Dashboard sidebar widgets" block:
 *   .cl-ow-item (.row, .name, .ct, .top, .top.crit/.high/.mod, .dot).
 */

import { useMemo } from "react";
import Link from "next/link";
import { TypesetSection } from "./TypesetSection";
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

const PRIORITY_TONE: Record<Resource["priority"], "crit" | "high" | "mod"> = {
  CRITICAL: "crit",
  HIGH: "high",
  MODERATE: "mod",
  LOW: "mod",
};

interface OwnerGroup {
  key: string;
  displayName: string;
  count: number;
  top: { id: string; title: string; priority: Resource["priority"] };
}

function aggregateOwners(resources: Resource[]): OwnerGroup[] {
  type Bucket = {
    key: string;
    casings: Map<string, number>;
    items: Resource[];
  };
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
      top: {
        id: topItem.id,
        title: topItem.title,
        priority: topItem.priority,
      },
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
      <TypesetSection eyebrow="On whose plate" title="By Owner">
        <p
          style={{
            fontSize: 12,
            color: "var(--text-2)",
            lineHeight: 1.5,
            margin: "4px 0 12px",
          }}
        >
          Assign owners to regulations from any detail page to populate this view.
        </p>
        <Link
          href="/regulations"
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          Pick a regulation to assign →
        </Link>
      </TypesetSection>
    );
  }

  const totalItems = groups.reduce((sum, g) => sum + g.count, 0);
  const topThree = groups.slice(0, 3);

  return (
    <TypesetSection
      eyebrow="On whose plate"
      title="By Owner"
      count={`${totalItems} items · ${groups.length} owner${groups.length === 1 ? "" : "s"}`}
      footer={<Link href="/profile?tab=owners">View all owners →</Link>}
    >
      <ul className="cl-typeset-list">
        {topThree.map((g) => {
          const tone = PRIORITY_TONE[g.top.priority];
          return (
            <li key={g.key} className="cl-ow-item">
              <div className="row">
                <Link
                  href={`/regulations?owner=${encodeURIComponent(g.displayName)}`}
                  className="name"
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  {g.displayName}
                </Link>
                <span className="ct">
                  {g.count}
                  <sub>items</sub>
                </span>
              </div>
              <Link
                href={`/regulations/${g.top.id}`}
                className={`top ${tone}`}
                style={{ color: "inherit", textDecoration: "none", display: "block" }}
              >
                <span className="dot" />
                {g.top.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </TypesetSection>
  );
}
