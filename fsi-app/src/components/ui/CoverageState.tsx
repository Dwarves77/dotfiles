"use client";

/**
 * CoverageState: the ONE renderer for the six states of absence (lane COV-1, 2026-10-08; spec 00 section 4).
 *
 * Six states, six treatments, never one grey dash. The codes live in src/lib/contracts/vocabularies.mjs
 * (COVERAGE_STATE), the words and the decision of which action a state carries live in
 * src/lib/coverage/coverage-state.mjs (proven by node --test), and this file only draws them:
 *
 *   not_applicable   suppress the field, explain on hover (the cell form, whatever variant is asked for)
 *   not_covered      a named coverage gap, its roadmap position, and a "Request coverage" action
 *   no_data_yet      the expected refresh, and the last known value with its as-of date
 *   suppressed       the reason class; worded as withheld, never as absent
 *   not_filtered_in  "N items hidden by your scope" and a one-click widen (the filter-bubble antidote)
 *   error            a distinct alert, a retry, and a status link
 *
 * VARIANTS. `block` (default) is the state note strip: the same left rule and tint as StateNote, so a state reads
 * as the same kind of thing everywhere (law 16). `inline` is the same words with no strip, for a rail card.
 * `cell` is for a fixed-width table cell that cannot hold a sentence: it draws the dash the Absence part draws,
 * declares itself with `data-absence` so the rendering guard's placeholder scan skips it, and carries the whole
 * explanation on aria-label and title. The cell still states WHICH of the six it is.
 *
 * A call site that cannot name the state keeps its own render: an unknown state renders `fallback` (default
 * nothing), exactly as before this component existed.
 *
 * UX (docs/design/ux-laws.md): the request action acknowledges at once ("Requesting..."), then states what
 * happened and what happens next, and a failure says what went wrong and leaves the control in place to try again
 * (laws 6, 10, 14, 15). Targets are 44 px tall (law 2).
 */

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ABSENCE_TEXT_STYLE } from "@/components/ui/Absence";
import { COVERAGE_ACTION, describeCoverageState } from "@/lib/coverage/coverage-state.mjs";
import { requestCoverageRequest } from "@/lib/coverage/client";

export type CoverageStateCode =
  | "not_applicable"
  | "not_covered"
  | "no_data_yet"
  | "suppressed"
  | "not_filtered_in"
  | "error";

export interface CoverageStateProps {
  state: CoverageStateCode | string | null | undefined;
  /** What is absent, as a short noun phrase: "OEM equipment roadmap". */
  subject: string;
  variant?: "block" | "inline" | "cell";
  /** not_applicable: why it does not apply. not_covered: the named gap. error: what failed. */
  reason?: string | null;
  /** suppressed: confidentiality | k_anonymity | licence. */
  reasonClass?: string | null;
  /** not_covered: where this sits on the roadmap, when one is recorded. */
  roadmap?: string | null;
  /** not_covered: the page path the gap is on. Present means the Request coverage action is offered. */
  requestRef?: string | null;
  /** no_data_yet */
  expectedRefresh?: string | null;
  lastValue?: string | null;
  asOf?: string | null;
  /** not_filtered_in: how many are hidden (omit when unknown) and what they are called. */
  hiddenCount?: number | null;
  noun?: string | null;
  onWiden?: (() => void) | null;
  /** error */
  onRetry?: (() => void) | null;
  /** error, for a SERVER-rendered call site that cannot pass a function: Retry becomes a link to this path. */
  retryHref?: string | null;
  statusHref?: string | null;
  /** Rendered when `state` is not one of the six, so the call site keeps its existing render. */
  fallback?: ReactNode;
}

const ACTION_BOX = { minHeight: 44, flexShrink: 0 } as const;
const LINK_BOX = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "8px 0",
  fontSize: "var(--fs-11)",
  fontWeight: 600,
  color: "var(--ink)",
} as const;

function RequestCoverageAction({ subjectRef, label }: { subjectRef: string; label: string }) {
  const [phase, setPhase] = useState<"idle" | "sending" | "done" | "already">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (phase === "sending") return;
    setPhase("sending");
    setError(null);
    const res = await requestCoverageRequest({ subjectRef, label });
    if (!res.ok) {
      setPhase("idle");
      setError(res.error ?? "Could not record that. Try again.");
      return;
    }
    setPhase(res.already ? "already" : "done");
  }

  if (phase === "done" || phase === "already") {
    return (
      <span role="status" data-coverage-feedback="requested" style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)" }}>
        {phase === "already" ? "Already requested. It is in the coverage queue." : "Requested. It is recorded in the coverage queue."}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <Button type="button" variant="secondary" size="sm" disabled={phase === "sending"} onClick={() => void send()} style={ACTION_BOX}>
        {phase === "sending" ? "Requesting..." : "Request coverage"}
      </Button>
      {error && (
        <span role="alert" data-coverage-feedback="failed" style={{ fontSize: "var(--fs-11)", color: "var(--color-error)" }}>
          {error}
        </span>
      )}
    </span>
  );
}

export function CoverageState(props: CoverageStateProps) {
  const { state, subject, variant = "block", fallback = null } = props;
  const d = describeCoverageState({
    state: state ?? "",
    subject,
    reason: props.reason,
    reasonClass: props.reasonClass,
    roadmap: props.roadmap,
    requestRef: props.requestRef,
    lastValue: props.lastValue,
    asOf: props.asOf,
    expectedRefresh: props.expectedRefresh,
    hiddenCount: props.hiddenCount,
    noun: props.noun,
    canWiden: typeof props.onWiden === "function",
    canRetry: typeof props.onRetry === "function" || !!props.retryHref,
    statusHref: props.statusHref,
  });
  if (!d) return <>{fallback}</>;

  // The cell form: a suppressed field with its explanation on hover, or any state in a cell too narrow for words.
  if (variant === "cell" || d.suppress) {
    const explanation = [`${d.label}: ${d.headline}`, ...d.lines].join(" ");
    return (
      <span
        className="cl-absence-dash"
        data-absence="dash"
        data-part="coverage-state"
        data-coverage-state={d.code}
        data-part-variant="cell"
        aria-label={explanation}
        title={explanation}
        style={{ fontSize: "inherit", color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}
      >
        {/* The dash is the JS escape, not the literal character (discipline rule 022); the same form Absence uses. */}
        {"\u2014"}
      </span>
    );
  }

  const isError = d.code === "error";
  const edge = isError ? "var(--color-error)" : "var(--brand)";
  const framed = variant === "block";

  return (
    <div
      role={d.role}
      data-part="coverage-state"
      data-coverage-state={d.code}
      data-part-variant={variant}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "4px 12px",
        ...(framed
          ? { borderLeft: `3px solid ${edge}`, background: isError ? "rgba(220,38,38,0.05)" : "var(--tag)", borderRadius: "0 6px 6px 0", padding: "9px 12px" }
          : { padding: 0 }),
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 220px" }}>
        <span data-part-slot="state-label" style={{ ...ABSENCE_TEXT_STYLE, color: isError ? "var(--color-error)" : ABSENCE_TEXT_STYLE.color }}>
          {d.label}
        </span>
        <p style={{ margin: "2px 0 0", fontSize: "var(--fs-12)", color: "var(--ink)", overflowWrap: "anywhere" }}>{d.headline}</p>
        {d.lines.map((line) => (
          <p key={line} style={{ margin: "2px 0 0", fontSize: "var(--fs-11)", color: "var(--ink-2)", lineHeight: 1.5, overflowWrap: "anywhere" }}>
            {line}
          </p>
        ))}
      </div>
      {d.actions.length > 0 && (
        <div style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {d.actions.map((a) => {
            if (a.kind === COVERAGE_ACTION.request && props.requestRef) {
              return <RequestCoverageAction key={a.kind} subjectRef={props.requestRef} label={subject} />;
            }
            if (a.kind === COVERAGE_ACTION.widen && props.onWiden) {
              return (
                <Button key={a.kind} type="button" variant="secondary" size="sm" onClick={props.onWiden} style={ACTION_BOX}>
                  {a.label}
                </Button>
              );
            }
            if (a.kind === COVERAGE_ACTION.retry && !props.onRetry && props.retryHref) {
              return (
                <a key={a.kind} href={props.retryHref} style={LINK_BOX}>
                  {a.label}
                </a>
              );
            }
            if (a.kind === COVERAGE_ACTION.retry && props.onRetry) {
              return (
                <Button key={a.kind} type="button" variant="secondary" size="sm" onClick={props.onRetry} style={ACTION_BOX}>
                  {a.label}
                </Button>
              );
            }
            if (a.kind === COVERAGE_ACTION.status && props.statusHref) {
              return (
                <a key={a.kind} href={props.statusHref} style={LINK_BOX}>
                  {a.label}
                </a>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
