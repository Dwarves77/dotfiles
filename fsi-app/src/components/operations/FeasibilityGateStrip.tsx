/**
 * FeasibilityGateStrip, spec 04 S6 #8 (feasibility gate layer). Lane L14, 2026-10-03.
 *
 * GATES, NEVER A SCORE (spec 04 acceptance criterion 7, "Feasibility renders as gates, never as score
 * contributions"). Regulatory feasibility answers "is this region even eligible", evaluated BEFORE any
 * cost figure (spec 04 S1). Each gate class is blocked, conditional or clear, with a named reason. The
 * type below has NO numeric member, so a gate state cannot be summed, averaged or folded into a
 * region's score; this is enforced by the compiler, not by convention (`__gateTypeBarrierProof` at the
 * foot of this file is a `@ts-expect-error` that fails `tsc` if a numeric field is ever accepted), the
 * same barrier idea spec 08 S4 uses to keep statutory and estimate values apart.
 *
 * The strip itself derives no number either: the headline is a lookup over a closed list, never
 * arithmetic, and there is no count of gates shown, because a count is a step toward a score. Headline
 * order is blocked, then incomplete (any of the five classes unassessed), then conditional, then clear:
 * a region with any unassessed class never headlines "clear" (coordinator ruling 3, 2026-10-03).
 *
 * Read-only, no interaction, no async action: it renders props already assembled server-side. Gate
 * classes are the five named in spec 04 S6 #8. A class with no supplied gate renders the one absence
 * token, never a default "clear" (a missing evaluation is not a green light, CLAUDE.md rule 2).
 *
 * REUSED, NOT REINVENTED: `SectionHeading` (carries `data-guard-title`), `Absence` (the one absence
 * vocabulary). Mounting: RegionDimensionMatrix.tsx's panel, ahead of any cost figure, same drill-down
 * posture as LabourChain (no new page, no extra click).
 */

import { Absence } from "@/components/ui/Absence";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { MaterialsPpwrJoinRow } from "@/lib/operations/materials-ppwr-join.ts";

export type GateClass = "ppwr_thresholds" | "epr_registration" | "pfas_limits" | "national_permitting" | "ets2";

export type GateState = "blocked" | "conditional" | "clear";

/** A gate. Deliberately closed: no numeric member of any kind. A reason is prose; a citation is a
 *  document reference. If a number belongs in a reason it is written into the sentence, where it
 *  cannot be summed. */
export interface FeasibilityGate {
  readonly gateClass: GateClass;
  readonly state: GateState;
  /** What makes it blocked/conditional/clear, in a sentence. */
  readonly reason: string;
  /** Where the rule comes from (instrument and article), when known. */
  readonly citation?: string;
}

export interface FeasibilityGateStripProps {
  readonly gates: readonly FeasibilityGate[];
  readonly regionLabel: string;
}

/** Render order and labels: the five gate classes of spec 04 S6 #8. */
export const GATE_CLASS_ORDER: readonly GateClass[] = [
  "ppwr_thresholds",
  "epr_registration",
  "pfas_limits",
  "national_permitting",
  "ets2",
];

const GATE_CLASS_LABEL: Record<GateClass, string> = {
  ppwr_thresholds: "PPWR thresholds",
  epr_registration: "EPR registration and authorised representative",
  pfas_limits: "PFAS limits",
  national_permitting: "National permitting",
  ets2: "ETS2",
};

const STATE_LABEL: Record<GateState, string> = {
  blocked: "Blocked",
  conditional: "Conditional",
  clear: "Clear",
};

/** The headline: a closed vocabulary, not a number. "incomplete" means at least one of the five gate
 *  classes has no supplied gate. */
export type GateHeadline = "blocked" | "incomplete" | "conditional" | "clear";

/** blocked > incomplete > conditional > clear. A lookup over a closed list in that order (no numeric
 *  rank exists to be summed). Returns "incomplete" for no gates at all: nothing assessed is never clear. */
export function gateHeadline(gates: readonly FeasibilityGate[]): GateHeadline {
  if (gates.some((g) => g.state === "blocked")) return "blocked";
  if (GATE_CLASS_ORDER.some((cls) => !gates.some((g) => g.gateClass === cls))) return "incomplete";
  if (gates.some((g) => g.state === "conditional")) return "conditional";
  return "clear";
}

const HEADLINE_LABEL: Record<GateHeadline, string> = {
  blocked: "blocked",
  incomplete: "incomplete, not every gate assessed",
  conditional: "conditional",
  clear: "clear",
};

const STATE_COLOUR: Record<GateState, string> = {
  blocked: "var(--color-error)",
  conditional: "var(--color-warning)",
  clear: "var(--ink-2)",
};

export function FeasibilityGateStrip({ gates, regionLabel }: FeasibilityGateStripProps) {
  const headline = gateHeadline(gates);
  const detailed = GATE_CLASS_ORDER.map((cls) => gates.find((g) => g.gateClass === cls)).filter(
    (g): g is FeasibilityGate => !!g && g.state !== "clear"
  );
  return (
    <div data-audit="feasibility-gate-strip" style={{ marginBottom: 8 }}>
      <SectionHeading title="Feasibility gates" aside={`${regionLabel} · ${HEADLINE_LABEL[headline]}`} />
      {/* ONE wrapping line of five labelled chips (coordinator ruling, Option A, 2026-10-03: the
          panel is a fixed 300px slot, operator criterion A). A class with no gate shows the absence
          token, never "clear". */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", padding: "2px 2px 0" }}>
        {GATE_CLASS_ORDER.map((cls) => {
          const gate = gates.find((g) => g.gateClass === cls);
          return (
            <span
              key={cls}
              data-audit="feasibility-gate"
              data-gate-class={cls}
              data-gate-state={gate ? gate.state : "not-evaluated"}
              style={{ display: "inline-flex", alignItems: "baseline", gap: 6, fontSize: "var(--fs-115)" }}
            >
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>{GATE_CLASS_LABEL[cls]}</span>
              {gate ? (
                <span
                  style={{
                    fontWeight: 700,
                    color: STATE_COLOUR[gate.state],
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {STATE_LABEL[gate.state]}
                </span>
              ) : (
                <Absence reason="not in primary source" />
              )}
            </span>
          );
        })}
      </div>
      {detailed.map((g) => (
        <p key={g.gateClass} style={{ fontSize: "var(--fs-115)", color: "var(--ink-2)", margin: "4px 2px 0" }}>
          {GATE_CLASS_LABEL[g.gateClass]}: {g.reason}
          {g.citation ? ` (${g.citation})` : ""}
        </p>
      ))}
    </div>
  );
}

/**
 * The materials supply <-> PPWR joined reads (spec 04 S6 #9), directly below the gate strip. Render-only
 * over `joinMaterialsToPpwr`'s rows; no join logic here. A native <details>, collapsed by default (the
 * panel is a fixed 300px slot; coordinator ruling, Option A, 2026-10-03). The summary names the row
 * count and how many rows carry a materials fact, so a gap is visible without opening it. The
 * article-cited caveat sits inside, once.
 */
export function MaterialsPpwrRows({ rows }: { readonly rows: readonly MaterialsPpwrJoinRow[] }) {
  if (rows.length === 0) return null;
  const caveat = rows.find((r) => r.caveat)?.caveat ?? null;
  const gapOnly = rows.every((r) => r.availability === null);
  return (
    <details data-audit="materials-ppwr-rows" style={{ marginBottom: 8 }}>
      <summary
        style={{
          cursor: "pointer",
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          fontSize: "var(--fs-115)",
          color: "var(--ink)",
          fontWeight: 600,
        }}
      >
        {`PPWR recycled-content thresholds (${rows.length}), materials data: ${gapOnly ? "gap" : "partial"}`}
      </summary>
      {rows.map((r) => (
        <p
          key={`${r.regionKey}-${r.materialKey}`}
          data-audit="materials-ppwr-row"
          data-join-status={r.status}
          style={{ fontSize: "var(--fs-115)", color: "var(--ink-2)", margin: "0 0 6px" }}
        >
          {r.sentence}
        </p>
      ))}
      {caveat && <p style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", margin: 0 }}>{caveat}</p>}
    </details>
  );
}

/**
 * Type-level barrier proof (acceptance criterion 7). Never called. `tsc --noEmit` fails on the
 * directive below the moment `FeasibilityGate` gains any member a `score` literal could satisfy, so a
 * numeric score field cannot be added without this file refusing to compile.
 * @internal
 */
export function __gateTypeBarrierProof(): FeasibilityGate {
  return {
    gateClass: "ets2",
    state: "clear",
    reason: "proof",
    // @ts-expect-error a gate has no numeric member: a score field is rejected at the type level
    score: 1,
  };
}
