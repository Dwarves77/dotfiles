"use client";

/**
 * DashboardRailCard + RailEmptyFrame — shared rail primitives for the
 * Dashboard (TEMPLATE 01, HANDOFF §6.3 + mock).
 *
 * DashboardRailCard: a titled white card (uppercase muted eyebrow title,
 * optional count) — the container for Watchlist / By owner.
 *
 * RailEmptyFrame: the honest-state frame (HANDOFF §4) — 1px dashed
 * rgba(0,0,0,0.25) border, bg --color-bg-base, radius 6, a muted one-liner
 * stating what is absent, and a recovery CTA. One pattern for every empty rail
 * widget so the honest-state language stays identical.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export function DashboardRailCard({
  title,
  count,
  children,
}: {
  title: string;
  count?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          margin: "0 0 8px",
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            margin: 0,
          }}
        >
          {title}
        </p>
        {count && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)" }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export function RailEmptyFrame({
  body,
  cta,
}: {
  body: string;
  cta: { label: string; href: string };
}) {
  return (
    <div
      style={{
        border: "1px dashed rgba(0,0,0,0.25)",
        borderRadius: 6,
        background: "var(--color-bg-base)",
        padding: "12px 14px",
      }}
    >
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.55, margin: "0 0 8px" }}>
        {body}
      </p>
      <Link
        href={cta.href}
        prefetch={false}
        style={{ fontSize: 11.5, fontWeight: 800, color: "var(--color-primary)", textDecoration: "none" }}
      >
        {cta.label}
      </Link>
    </div>
  );
}
