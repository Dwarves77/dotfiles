"use client";

/**
 * FlagsRejectionsQueue — redesign TEMPLATE 08 (HANDOFF §6.8) merged
 * "Flags & rejections" queue: one queue, three kinds, a three-way filter, and
 * a shared triage grammar.
 *
 * The three kinds reuse the existing wired admin views (real data, not the
 * mock's snapshot rows):
 *   - Integrity · per-brief  → <IntegrityFlagsView>        (migration 035)
 *   - Platform · data quality → <PlatformIntegrityFlagsView> (migration 048)
 *   - Rejections · unparseable → <IngestRejectionsView>     (triage queue)
 *
 * Filter-chip counts come from useAdminAttention where a scalar exists
 * (Integrity, Platform). No RPC scalar tracks ingest-rejection count at this
 * layer, so the Rejections chip is label-only — the count binding forbids
 * fabricating it (logged as a deviation). Bulk-resolve of the recurring
 * seed-fallback class is HONEST-PENDING (a batch endpoint for the trigger
 * class is not wired) — surfaced as a footer note, not a live button.
 */

import { useState } from "react";
import { useAdminAttention } from "@/lib/hooks/useAdminAttention";
import { IntegrityFlagsView } from "@/components/admin/IntegrityFlagsView";
import { PlatformIntegrityFlagsView } from "@/components/admin/PlatformIntegrityFlagsView";
import { IngestRejectionsView } from "@/components/admin/IngestRejectionsView";

type FlagKind = "integrity" | "platform" | "rejections";

interface KindDef {
  key: FlagKind;
  label: string;
  count: number | null;
  desc: string;
}

export function FlagsRejectionsQueue() {
  const { counts } = useAdminAttention();
  const [kind, setKind] = useState<FlagKind>("integrity");

  const integrityCount = counts?.integrity_flags_unresolved ?? null;
  const platformCount = counts?.platform_integrity_flags_open ?? null;

  const kinds: KindDef[] = [
    {
      key: "integrity",
      label: "Integrity · per-brief",
      count: integrityCount,
      desc: "Briefs where the agent self-reported it could not verify the source URL or the content did not match. Each row needs a human decision.",
    },
    {
      key: "platform",
      label: "Platform · data quality",
      count: platformCount,
      desc: "Agent-surfaced concerns not tied to a single brief: data quality, data integrity, coverage gaps. Recurring identical triggers can be resolved as a class once the batch endpoint ships.",
    },
    {
      key: "rejections",
      label: "Rejections · unparseable",
      count: null,
      desc: "Jurisdiction tokens the trigger could not normalize to a canonical entity. Reclassify when a canonical mapping should exist; retry to escalate; archive to drop.",
    },
  ];

  const active = kinds.find((k) => k.key === kind)!;

  // Meta line — computed from the scalars we actually have; never a snapshot
  // literal. Falls back to "one queue, three kinds" when scalars are pending.
  const known = [integrityCount, platformCount].filter(
    (n): n is number => typeof n === "number"
  );
  const openSum = known.length > 0 ? known.reduce((a, b) => a + b, 0) : null;
  const metaLine =
    openSum !== null
      ? `${openSum.toLocaleString()} open across integrity + platform · one queue, three kinds`
      : "one queue, three kinds";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          background: "var(--raised)",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text)",
          }}
        >
          Flags &amp; rejections
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-2)" }}>
          {metaLine}
        </span>
      </div>

      {/* Three-way filter */}
      <div
        role="tablist"
        aria-label="Flag kind"
        style={{
          padding: "14px 20px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        {kinds.map((k) => {
          const on = k.key === kind;
          return (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={on}
              aria-pressed={on}
              onClick={() => setKind(k.key)}
              style={{
                fontFamily: "inherit",
                cursor: "pointer",
                fontSize: 11.5,
                fontWeight: on ? 800 : 600,
                padding: "8px 14px",
                borderRadius: 6,
                border: on
                  ? "2px solid var(--color-primary)"
                  : "1px solid var(--color-border-medium)",
                background: on ? "var(--color-bg-ai-strip)" : "var(--surface)",
                color: on ? "var(--text)" : "var(--text-2)",
              }}
            >
              {k.label}
              {typeof k.count === "number" ? ` · ${k.count.toLocaleString()}` : ""}
            </button>
          );
        })}
      </div>

      <p
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          color: "var(--text-2)",
          margin: 0,
          padding: "12px 20px",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        {active.desc}
      </p>

      {/* Selected kind renders its existing wired view (real data). */}
      <div style={{ padding: "16px 20px" }}>
        {kind === "integrity" && <IntegrityFlagsView />}
        {kind === "platform" && <PlatformIntegrityFlagsView />}
        {kind === "rejections" && <IngestRejectionsView />}
      </div>

      <p
        style={{
          fontSize: 11,
          color: "var(--text-2)",
          margin: 0,
          padding: "10px 20px",
          background: "var(--color-background)",
        }}
      >
        Same triage verbs across all three kinds — review, fix, resolve / archive.
        One-click bulk resolve for the recurring seed-fallback trigger class lands
        with the flag-class batch endpoint.
      </p>
    </div>
  );
}
