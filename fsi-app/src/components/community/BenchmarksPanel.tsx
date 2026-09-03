"use client";

/**
 * BenchmarksPanel — house-seeded recurring benchmark surveys (spec 05 §3, §5 components 3/4:
 * "structured aggregate-only instruments... house-seeded recurring benchmark on a fixed calendar").
 * Fetches GET /api/community/benchmarks/current ONCE on mount (no polling — a benchmark's aggregate
 * changes on a calendar cadence, not in real time) via api-client.getCurrentBenchmarks.
 *
 * Renders AGGREGATES ONLY. When `aggregate.publishable` is false, shows the reason (k-anonymity /
 * dominance / lag) instead of any value — never a point estimate, and never a fabricated number to
 * fill the gap (spec 05 §1, §4: "eligible to appear as a signal... with the distribution shown,
 * never as a point estimate").
 */

import { useEffect, useState } from "react";
import { getCurrentBenchmarks } from "./api-client";
import type { CommunityBenchmark } from "./types";

export function BenchmarksPanel() {
  const [benchmarks, setBenchmarks] = useState<CommunityBenchmark[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getCurrentBenchmarks();
      if (!cancelled) {
        setBenchmarks(result);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          padding: "32px 20px",
          textAlign: "center",
          fontSize: 13,
          color: "var(--color-text-secondary)",
        }}
      >
        Loading benchmarks...
      </div>
    );
  }

  if (!benchmarks || benchmarks.length === 0) {
    return (
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px dashed var(--color-border)",
          borderRadius: 6,
          padding: "32px 20px",
          textAlign: "center",
          fontSize: 13,
          color: "var(--color-text-secondary)",
        }}
      >
        No open benchmarks right now. The house seeds these on a fixed calendar (spec 05 §3).
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {benchmarks.map((b) => (
        <BenchmarkCard key={b.key} benchmark={b} />
      ))}
    </div>
  );
}

function BenchmarkCard({ benchmark }: { benchmark: CommunityBenchmark }) {
  const agg = benchmark.aggregate;
  return (
    <article
      style={{
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3
          data-guard-title
          style={{
            margin: 0,
            flex: 1,
            minWidth: 0,
            fontSize: 15,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            overflowWrap: "anywhere",
          }}
        >
          {benchmark.title}
        </h3>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
            borderRadius: 3,
            padding: "1px 6px",
            flexShrink: 0,
          }}
        >
          {benchmark.calendar_cycle} · {benchmark.status}
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 12.5,
          color: "var(--color-text-secondary)",
          lineHeight: 1.5,
          overflowWrap: "anywhere",
        }}
      >
        {benchmark.question}
      </p>
      {agg.publishable ? (
        <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)" }}>
          {agg.value}
          {benchmark.unit ? ` ${benchmark.unit}` : ""}
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", marginLeft: 8 }}>
            {agg.distinct_organisations} orgs · {agg.response_count} responses
          </span>
        </p>
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--color-high, #b45309)",
            background: "var(--color-high-bg, #fff7ed)",
            border: "1px solid var(--color-high-border, #fed7aa)",
            borderRadius: 4,
            padding: "8px 10px",
            lineHeight: 1.5,
          }}
        >
          Not yet publishable — {agg.reason ?? `fewer than ${agg.min_contributors} distinct contributing organisations`}.
          {" "}({agg.distinct_organisations} of {agg.min_contributors} minimum, {agg.response_count} response
          {agg.response_count === 1 ? "" : "s"} so far.)
        </p>
      )}
    </article>
  );
}
