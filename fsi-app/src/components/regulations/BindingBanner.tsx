"use client";

/**
 * BindingBanner, lane OBL-2 (2026-10-08), spec 01 section 4 component 1 (the binding-position banner) at ITEM
 * level on the Regulations detail page, mounted above the obligations register section.
 *
 * WHAT IT SHOWS. One line per distinct binding_position among the item's current obligation objects
 * (migration 376): the position by its vocabulary label ("Your duty", "Carrier pass-through", ...), the
 * duty-holder classes, the applicability trigger that put the customer in scope (spec 01 section 3.5: every row
 * carries the trigger, and it is a profile attribute the customer can see and change), and whether it applies to
 * the viewer's organisation. The cost slots of spec 01 section 3.4 appear only when an object carries them, each
 * labelled by name and never merged: "Penalty exposure", "Direct compliance cost", and "Effort (person-days, not
 * money)". When the item has no objects the banner says "Obligations not yet decomposed", never an empty section.
 *
 * DATA. GET /api/detail/relevance?itemId= (the route computes `binding` at obligation grain in
 * src/lib/workspace/relevance.mjs; this is the first reader of the gate's `applicability` output). A client
 * fetch, the same mechanism RelevanceBadgeClient and ObligationRegister use, so the detail page stays static
 * (PERF-10).
 *
 * UX COMPLIANCE (docs/design/ux-laws.md, DP-2).
 *  - Goal: is this regulation mine, my carrier's, or my customer's. Path: read the banner, zero clicks.
 *  - One primary action at most: "Open organisation profile" appears only when the answer needs profile input;
 *    "Try again" appears only after a failed load. Never both at once, each at least 44 px tall (law 2).
 *  - Feedback: a loading line while the fetch is in flight (law 6), a plain-language failure with a retry that
 *    keeps the page intact (laws 14, 15), a completion state in every branch (law 10).
 *  - Mobile (375 px): lines wrap (flex-wrap, overflow-wrap anywhere), no fixed widths, no horizontal scroll;
 *    the title carries data-guard-title.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Applicability {
  status: "applies" | "does_not_apply" | "needs_profile_input";
  reasons: string[];
  missingDimensions: string[];
}
interface CostSlot {
  slot: "penalty_exposure" | "direct_compliance_cost" | "effort";
  label: string;
  entries: string[];
}
export interface BindingLine {
  position: string;
  label: string;
  note: string;
  dutyHolders: { id: string; label: string }[];
  triggers: { attribute: string; value: string; label: string }[];
  applicability: Applicability | null;
  objectCount: number;
  costSlots: CostSlot[];
}
export interface BindingData {
  decomposed: boolean;
  objectCount: number;
  applicability: Applicability | null;
  lines: BindingLine[];
  loadFailed?: boolean;
}

type State = { phase: "loading" } | { phase: "error" } | { phase: "ready"; binding: BindingData };

const STATUS_TEXT: Record<Applicability["status"], string> = {
  applies: "Applies to your organisation",
  does_not_apply: "Does not apply to your organisation",
  needs_profile_input: "Needs your organisation profile",
};

const wrapStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "24px auto 0",
  padding: "0 var(--cl-detail-pad-x, 16px)",
};
const panelStyle: React.CSSProperties = {
  background: "var(--surface, #fff)",
  border: "1px solid var(--border-sub, #E3E3E0)",
  borderRadius: "var(--r-md, 8px)",
  padding: "14px 16px",
};
const headingStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text, #17171B)",
  margin: 0,
};
const mutedStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--muted, #6B6B66)", margin: 0, lineHeight: 1.45 };
const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 8,
  border: "1px solid var(--accent, #E8610A)",
  background: "var(--accent, #E8610A)",
  color: "var(--surface, #fff)",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
};

export function BindingBanner({ itemId }: { itemId: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/detail/relevance?itemId=${encodeURIComponent(itemId)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((body: { binding?: BindingData | null }) => {
        if (cancelled) return;
        if (!body.binding || body.binding.loadFailed) setState({ phase: "error" });
        else setState({ phase: "ready", binding: body.binding });
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, attempt]);

  const retry = useCallback(() => {
    setState({ phase: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return (
    <section id="binding-banner" aria-labelledby="binding-banner-title" style={wrapStyle}>
      <div style={panelStyle}>
        <h2 id="binding-banner-title" data-guard-title style={headingStyle}>
          How this regulation reaches you
        </h2>
        <Body state={state} onRetry={retry} />
      </div>
    </section>
  );
}

function Body({ state, onRetry }: { state: State; onRetry: () => void }) {
  if (state.phase === "loading") {
    return (
      <p role="status" aria-live="polite" style={{ ...mutedStyle, marginTop: 8 }}>
        Checking which obligations reach your organisation…
      </p>
    );
  }
  if (state.phase === "error") {
    return (
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <p role="alert" style={{ ...mutedStyle, flex: "1 1 220px", minWidth: 0 }}>
          The obligation positions for this regulation could not be loaded. The rest of the page is unaffected.
        </p>
        <button type="button" onClick={onRetry} style={buttonStyle}>
          Try again
        </button>
      </div>
    );
  }
  const { binding } = state;
  if (!binding.decomposed || binding.lines.length === 0) {
    return (
      <div style={{ marginTop: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text, #17171B)", margin: 0 }}>Obligations not yet decomposed</p>
        <p style={{ ...mutedStyle, marginTop: 4 }}>
          This regulation has not been broken into individual obligations yet. The dated events below are listed as they were extracted.
        </p>
      </div>
    );
  }
  const needsInput = binding.lines.some((l) => l.applicability?.status === "needs_profile_input");
  return (
    <div style={{ marginTop: 8 }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {binding.lines.map((line) => (
          <LineView key={line.position} line={line} />
        ))}
      </ul>
      {needsInput && (
        <div style={{ marginTop: 14 }}>
          <Link href="/settings" prefetch={false} style={buttonStyle}>
            Open organisation profile
          </Link>
        </div>
      )}
    </div>
  );
}

function LineView({ line }: { line: BindingLine }) {
  const status = line.applicability?.status;
  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px" }}>
        <span title={line.note} style={{ fontSize: 13, fontWeight: 800, color: "var(--text, #17171B)" }}>
          {line.label}
        </span>
        {status && (
          <span style={{ fontSize: 12, fontWeight: 700, color: status === "applies" ? "var(--accent, #E8610A)" : "var(--muted, #6B6B66)" }}>
            {STATUS_TEXT[status]}
          </span>
        )}
      </div>
      <p style={{ ...mutedStyle, overflowWrap: "anywhere" }}>
        <strong style={{ fontWeight: 700 }}>Duty holders: </strong>
        {line.dutyHolders.map((d) => d.label).join(", ")}
      </p>
      {line.triggers.length > 0 && (
        <p style={{ ...mutedStyle, overflowWrap: "anywhere" }}>
          <strong style={{ fontWeight: 700 }}>In scope because: </strong>
          {line.triggers.map((t) => t.label).join("; ")}
        </p>
      )}
      {line.applicability && line.applicability.status !== "applies" && line.applicability.reasons.length > 0 && (
        <p style={{ ...mutedStyle, overflowWrap: "anywhere" }}>{line.applicability.reasons.join(" ")}</p>
      )}
      {line.costSlots.map((slot) => (
        <p key={slot.slot} style={{ ...mutedStyle, overflowWrap: "anywhere" }}>
          <strong style={{ fontWeight: 700 }}>{slot.label}: </strong>
          {slot.entries.join("; ")}
        </p>
      ))}
    </li>
  );
}
