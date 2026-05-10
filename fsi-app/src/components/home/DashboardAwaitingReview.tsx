"use client";

/**
 * DashboardAwaitingReview — Housekeeping body (right). Surfaces the top 3
 * oldest items waiting for admin review across three heterogeneous
 * sources: provisional sources, integrity flags, and staged updates
 * pending spot-check. Composed from existing tables in the fetcher
 * (no unified RPC yet).
 *
 * - Reads via React 19 use() inside a Suspense boundary set by HomeSurface.
 * - Permission gate handled server-side: fetchAwaitingReview returns []
 *   for non-admins. The widget renders the empty-state for that case
 *   (fine because the strings are also spec-approved).
 * - Stale flag: if any item has daysWaiting > 7, render the (stale) pill
 *   in the header AND apply .high-sev to that row.
 * - Type chips: prov / intg / spot, mapped to provisional / integrity /
 *   spotcheck per the spec.
 *
 * Empty + error copy is spec-verbatim.
 */

import { use } from "react";
import { TypesetSection } from "./TypesetSection";
import type { ReviewItem } from "@/lib/data";

export interface DashboardAwaitingReviewProps {
  promise: Promise<ReviewItem[]>;
}

const TYPE_TO_CHIP: Record<ReviewItem["type"], { cls: string; label: string }> = {
  provisional: { cls: "prov", label: "Prov" },
  integrity: { cls: "intg", label: "Flag" },
  spotcheck: { cls: "spot", label: "Spot" },
};

function formatAgo(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day waiting";
  if (days < 30) return `${days} days waiting`;
  const months = Math.floor(days / 30);
  return `${months} mo waiting`;
}

export function DashboardAwaitingReview({
  promise,
}: DashboardAwaitingReviewProps) {
  // The promise is constructed by getAwaitingReview in src/lib/data.ts
  // which catches all errors and resolves to []. We cannot wrap use() in
  // try/catch because it throws a Suspense exception React needs to
  // bubble. The "Couldn't load review queue · retry" copy is reserved
  // for an error boundary at the HomeSurface level (future work); for
  // now the fetcher's try/catch routes failures through the empty-state
  // copy below, which the user has approved as the safe fallback.
  const items = use(promise);

  if (items.length === 0) {
    return (
      <TypesetSection
        eyebrow="What you should do today"
        title="Awaiting review"
      >
        <p
          style={{
            fontSize: 12,
            color: "var(--text-2)",
            lineHeight: 1.5,
            margin: "4px 0 0",
          }}
        >
          Caught up. No items awaiting review.
        </p>
      </TypesetSection>
    );
  }

  const isStale = items.some((i) => i.daysWaiting > 7);
  const titleNode = (
    <>
      Awaiting review
      {isStale && <span className="cl-stale-pill">(stale)</span>}
    </>
  );

  // TypesetSection takes title:string; we render the stale pill via a
  // post-render trick: pass title="Awaiting review" and inject the pill
  // through deck slot would mis-position it. Use a sub-section here that
  // matches the same DOM as TypesetSection.
  return (
    <section className="cl-typeset">
      <div className="cl-typeset-eyebrow">What you should do today</div>
      <h3 className="cl-typeset-h">
        <span style={{ display: "inline-flex", alignItems: "baseline" }}>
          {titleNode}
        </span>
        <span className="count">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </h3>
      <ul className="cl-typeset-list">
        {items.map((it) => {
          const chip = TYPE_TO_CHIP[it.type];
          const itemStale = it.daysWaiting > 7;
          return (
            <li
              key={it.id}
              className={`cl-rev-item${itemStale ? " high-sev" : ""}`}
            >
              <span className={`cl-rev-chip ${chip.cls}`}>{chip.label}</span>
              <a
                href={it.href}
                style={{
                  color: "inherit",
                  textDecoration: "none",
                  display: "block",
                  minWidth: 0,
                }}
              >
                <div className="t">{it.title}</div>
                <div className="ago">{formatAgo(it.daysWaiting)}</div>
              </a>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </li>
          );
        })}
      </ul>
      <div className="cl-typeset-foot">
        <a href="/admin">Open admin queue →</a>
      </div>
    </section>
  );
}
