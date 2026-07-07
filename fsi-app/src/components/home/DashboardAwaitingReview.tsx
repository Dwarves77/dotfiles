"use client";

/**
 * DashboardAwaitingReview — Housekeeping card (right). Top oldest items waiting
 * for admin review across provisional sources, integrity flags, and staged
 * spot-checks (composed server-side; permission-gated to admins — non-admins
 * get []).
 *
 * Redesign TEMPLATE 01 (HANDOFF §6.3 + mock). Each row carries a dashed
 * provisional-style chip (epistemic amber #B45309), the item title, and its
 * wait time. The header carries the oldest-waiting flag when present. Empty
 * state is the honest "caught up" copy.
 */

import { use } from "react";
import type { ReviewItem } from "@/lib/data";

export interface DashboardAwaitingReviewProps {
  promise: Promise<ReviewItem[]>;
}

const TYPE_LABEL: Record<ReviewItem["type"], string> = {
  provisional: "Provisional",
  integrity: "Flag",
  spotcheck: "Spot",
};

function formatAgo(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day waiting";
  if (days < 30) return `${days} days waiting`;
  const months = Math.floor(days / 30);
  return `${months} mo waiting`;
}

function oldestLabel(days: number): string {
  if (days < 30) return `oldest waiting ${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  return `oldest waiting ${months} mo`;
}

const cardStyle = {
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "16px 18px",
} as const;

const eyebrowStyle = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  margin: "0 0 2px",
} as const;

const titleStyle = {
  fontFamily: "var(--font-display)",
  fontWeight: 400,
  fontSize: 19,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  margin: 0,
} as const;

export function DashboardAwaitingReview({ promise }: DashboardAwaitingReviewProps) {
  const items = use(promise);

  if (items.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={eyebrowStyle}>What you should do today</p>
        <h3 style={{ ...titleStyle, margin: "0 0 8px" }}>Awaiting review</h3>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0 }}>
          Caught up. No items awaiting review.
        </p>
      </div>
    );
  }

  const oldest = items.reduce((max, i) => Math.max(max, i.daysWaiting), 0);

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>What you should do today</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", margin: "0 0 12px" }}>
        <h3 style={titleStyle}>Awaiting review</h3>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)" }}>
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
        {oldest > 7 && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "var(--epistemic-signal)",
            }}
          >
            {oldestLabel(oldest)}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {items.map((it, idx) => (
          <a
            key={it.id}
            href={it.href}
            style={{
              display: "grid",
              gridTemplateColumns: "92px 1fr auto",
              gap: 12,
              alignItems: "center",
              padding: "11px 4px",
              borderTop: "1px solid var(--color-border-subtle)",
              borderBottom: idx === items.length - 1 ? "1px solid var(--color-border-subtle)" : undefined,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "var(--epistemic-signal)",
                border: "1px dashed rgba(180,83,9,0.45)",
                borderRadius: 4,
                padding: "3px 6px",
                textAlign: "center",
              }}
            >
              {TYPE_LABEL[it.type] ?? String(it.type ?? "?")}
            </span>
            <p style={{ fontSize: 12.5, fontWeight: 700, margin: 0, lineHeight: 1.4 }}>{it.title}</p>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
              {formatAgo(it.daysWaiting)}
            </span>
          </a>
        ))}
      </div>
      <a
        href="/admin"
        style={{
          display: "inline-block",
          margin: "12px 0 0",
          fontSize: 11.5,
          fontWeight: 800,
          color: "var(--color-primary)",
          textDecoration: "none",
        }}
      >
        Open admin queue →
      </a>
    </div>
  );
}
