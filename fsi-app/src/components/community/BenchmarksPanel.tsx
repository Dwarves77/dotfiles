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
 *
 * Lane COMMUNITY-C addition (2026-09-03): each OPEN instrument also carries its own response form
 * (POST /api/community/benchmarks/[key]/respond) — the write path this surface previously lacked
 * entirely ("not publishable: 0 of 5 organisations" could never change). One numeric field with the
 * instrument's unit, one primary action ("Submit"); UX contract: pending state within 400 ms (set
 * synchronously on click, before the network round-trip — law 6), success never shows a value (only
 * the organisation count, until the pool itself clears k-anonymity — spec 05 §1), and a refusal keeps
 * the entered value and names the fix (law 15) — an unverified refusal links straight to
 * /community/profile.
 */

import { useEffect, useState } from "react";
import { getCurrentBenchmarks, submitBenchmarkResponse } from "./api-client";
import type { CommunityBenchmark } from "./types";
import type { BenchmarkAggregate } from "./api-client";

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
  // Local override so a successful submission updates the shown aggregate immediately (the response
  // route returns a freshly recomputed one) without waiting for a second GET round-trip.
  const [agg, setAgg] = useState<BenchmarkAggregate>(benchmark.aggregate);

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
      {/* Title on its own row, badge on the next — NOT a shared flex row with flexWrap:"wrap": that
          layout gives the title only the leftover space on its first line before wrapping, which
          squeezed a real (non-lorem) instrument title to <60% of the card width at 375px (F35's law-2
          neighbour — caught live by the rendering guard's UX smoke slot on this lane's own
          community-smoke.mjs extension). An always-stacked header is correct at EVERY viewport, not
          just narrow ones, and needs no CSS media query to prove it (the .cl-comm-row/-aside classes
          in community.css are CSS-driven and therefore invisible to the smoke harness's CSS-free
          esbuild bundle — see stub-community-css.mjs's own header — so a layout that is correct by
          construction, not by a media query, is what actually gets verified here). */}
      <h3
        data-guard-title
        style={{
          margin: 0,
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
          alignSelf: "flex-start",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          border: "1px solid var(--color-border)",
          borderRadius: 3,
          padding: "1px 6px",
        }}
      >
        {benchmark.calendar_cycle} · {benchmark.status}
      </span>
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
      {benchmark.status === "open" ? (
        <BenchmarkResponseForm
          instrumentKey={benchmark.key}
          unit={benchmark.unit}
          minContributors={agg.min_contributors}
          onAccepted={setAgg}
        />
      ) : null}
    </article>
  );
}

type ResponseFormStatus = "idle" | "pending" | "success" | "error";

/**
 * The response form for one OPEN instrument (spec 05 §1, §3, §5 components 3/4 — the write path).
 * One numeric field with unit, one primary action ("Submit"). Never shows a value on success — only
 * the organisation count, matching the aggregate rendering above (spec 05 §1: "never a point
 * estimate"). A refusal PRESERVES the entered value (law 15) and names the fix; an unverified refusal
 * links to /community/profile.
 */
function BenchmarkResponseForm({
  instrumentKey,
  unit,
  minContributors,
  onAccepted,
}: {
  instrumentKey: string;
  unit: string | null;
  minContributors: number;
  onAccepted: (aggregate: BenchmarkAggregate) => void;
}) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<ResponseFormStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [orgsSoFar, setOrgsSoFar] = useState<number | null>(null);

  const inputId = `benchmark-response-${instrumentKey}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(value);
    if (!value.trim() || !Number.isFinite(parsed)) {
      setStatus("error");
      setMessage("Enter a number before submitting.");
      setVerifyUrl(null);
      return;
    }

    // Acknowledge within 400 ms (law 6): set the pending state synchronously, before the await.
    setStatus("pending");
    setMessage(null);
    setVerifyUrl(null);

    const result = await submitBenchmarkResponse(instrumentKey, parsed);

    if (!result.ok) {
      setStatus("error");
      setMessage(result.error);
      setVerifyUrl(result.verifyUrl ?? null);
      // Input value is intentionally left as-is (law 15: preserve the reader's work on error).
      return;
    }

    setStatus("success");
    setOrgsSoFar(result.aggregate.distinct_organisations);
    onAccepted(result.aggregate);
  }

  return (
    <form
      aria-label={`Submit your value for ${instrumentKey}`}
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginTop: 4,
        paddingTop: 10,
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <label htmlFor={inputId} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text-secondary)" }}>
        Your value{unit ? ` (${unit})` : ""}
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={status === "pending"}
          style={{
            flex: "1 1 120px",
            minWidth: 100,
            height: 44,
            padding: "0 10px",
            fontSize: 14,
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            background: "var(--color-bg-surface)",
            color: "var(--color-text-primary)",
          }}
        />
        <button
          type="submit"
          disabled={status === "pending"}
          style={{
            height: 44,
            minWidth: 96,
            padding: "0 16px",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--color-bg-surface)",
            background: status === "pending" ? "var(--color-text-muted)" : "var(--color-text-primary)",
            border: "none",
            borderRadius: 4,
            cursor: status === "pending" ? "default" : "pointer",
          }}
        >
          {status === "pending" ? "Submitting…" : "Submit"}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {status === "success" ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>
            Your organisation is counted — {orgsSoFar ?? "?"} of {minContributors} organisations so far.
          </p>
        ) : null}
        {status === "error" ? (
          <p role="alert" style={{ margin: 0, fontSize: 12, color: "var(--color-high, #b45309)" }}>
            {message}
            {verifyUrl ? (
              <>
                {" "}
                <a href={verifyUrl} style={{ color: "inherit", fontWeight: 700 }}>
                  Verify your profile
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </form>
  );
}
