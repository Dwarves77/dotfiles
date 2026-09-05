"use client";

/**
 * AutomateVsHireCalculator — the Operations page's calculator section (docs/specs/08-flywheel-design.md
 * §2.3 worked example, instantiated). Lane DP-SURF, system-completion train, 2026-09-02.
 *
 * PURE CLIENT-SIDE COMPUTE, DELIBERATELY. automateVsHire() (src/lib/operations/automate-vs-hire.mjs) is a
 * zero-dependency pure function of ten numbers — every keystroke recomputes it locally with no server
 * round-trip, no API route to build/version/gate, and no risk of a stale response racing a fast typist.
 * This mirrors this file's own module header ("Safe to import directly from a 'use client' React
 * component") and is why this lane decided NOT to build
 * src/app/api/operations/automate-vs-hire/route.ts — a route would only add latency and a second place
 * for the same ten-line calculation to drift from automate-vs-hire.mjs's own tests.
 *
 * THE RESULT IS RENDERED THROUGH EstimatedFigure — even though this specific number was never persisted
 * as a derived_values row (a reader's live "what if" preview, not a stored fact) — because ADR-024's
 * range-native, one-gate discipline applies to every number this shape produces, live preview or not. The
 * synthetic `Value` below carries `admissibility: "analysis_ok"` and a real assertedAt/confidence so
 * admissibleFor() evaluates it exactly as it would a persisted row; a live, unstored preview cannot be
 * called MORE trustworthy than a persisted one, so it gets the same gate, not a bypass.
 *
 * RecalculationNotice list underneath is fed by GET /api/notices via NoticesRail
 * (src/components/figures/NoticesRail.tsx, lane NOTICES 2026-09-05) — extracted from this file's own
 * former inline fetch-and-render copy once the Market index page and the four item detail surfaces needed
 * the identical sequence (CLAUDE.md "no copies of logic"); behaviour here is unchanged, only the fetch
 * itself moved to a shared module.
 */

import { useMemo, useState } from "react";
import { automateVsHire, DEFAULT_SCENARIO } from "@/lib/operations/automate-vs-hire.mjs";
import { EstimatedFigure } from "@/components/figures/EstimatedFigure";
import { NoticesRail } from "@/components/figures/NoticesRail";
import type { Value } from "@/lib/propagation/types.ts";

interface FormState {
  capexUsd: number;
  annualThroughputUnits: number;
  labourCostPerHour: number;
  hoursPerUnitManual: number;
  hoursPerUnitAutomated: number;
  energyPricePerKwh: number;
  kwhPerUnitAutomated: number;
  maintenancePctOfCapex: number;
  discountRate: number;
  horizonYears: number;
}

const INITIAL_STATE: FormState = {
  ...DEFAULT_SCENARIO,
  labourCostPerHour: 32,
  energyPricePerKwh: 0.2,
};

const FIELDS: Array<{ key: keyof FormState; label: string; step?: number; suffix?: string }> = [
  { key: "capexUsd", label: "Capex (USD)", step: 1000, suffix: "USD" },
  { key: "annualThroughputUnits", label: "Annual throughput (units)", step: 100 },
  { key: "labourCostPerHour", label: "Loaded labour rate (USD/hour)", step: 0.5, suffix: "USD/hr" },
  { key: "hoursPerUnitManual", label: "Hours per unit — current process", step: 0.01 },
  { key: "hoursPerUnitAutomated", label: "Hours per unit — with the investment", step: 0.01 },
  { key: "energyPricePerKwh", label: "Energy price (USD/kWh)", step: 0.01, suffix: "USD/kWh" },
  { key: "kwhPerUnitAutomated", label: "kWh per unit — with the investment", step: 0.01 },
  { key: "maintenancePctOfCapex", label: "Maintenance (% of capex/yr)", step: 0.01 },
  { key: "discountRate", label: "Discount rate", step: 0.01 },
  { key: "horizonYears", label: "Horizon (years)", step: 1 },
];

function makeSyntheticValue(scenario: ReturnType<typeof automateVsHire>): Value {
  const now = new Date().toISOString();
  return {
    valueId: "preview",
    entityId: null,
    methodId: "automate_vs_hire",
    methodVersion: "1.0.0",
    value: scenario.npv.point,
    valueLow: scenario.npv.low,
    valueHigh: scenario.npv.high,
    unit: "USD",
    currency: "USD",
    derivation: "modelled",
    originClass: "modelled",
    lifecycle: "emerging",
    admissibility: "analysis_ok",
    baseConfidence: 0.6,
    assertedAt: now,
    halfLifeDays: 365,
    inputs: [],
    supersedes: null,
    computedAt: now,
    computedBy: "client-preview",
  };
}

export function AutomateVsHireCalculator() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);

  const scenario = useMemo(() => automateVsHire(form), [form]);
  const figure = useMemo(() => makeSyntheticValue(scenario), [scenario]);

  function update(key: keyof FormState, raw: string) {
    const n = Number(raw);
    setForm((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : prev[key] }));
  }

  return (
    <section className="cl-card" style={{ padding: "20px 22px", marginTop: 24 }} aria-labelledby="capacity-investment-heading">
      {/* Customer-facing wording (operator ruling 2026-09-02): this is a capacity-investment estimate, not
          "automate vs. hire" — that phrasing frames equipment against people and reads badly to the
          workforce the reader manages. The method id and module keep their registry names
          (automate_vs_hire@1.0.0 is a persisted key); only what a reader sees changed. */}
      <h2 id="capacity-investment-heading" className="cl-page-title" style={{ fontSize: 17, marginBottom: 4 }}>
        Capacity investment estimate
      </h2>
      <p className="cl-card-body" style={{ marginBottom: 16 }}>
        What an equipment investment returns against your current handling cost — NPV, payback and the
        labour-rate break-even, all three with equal billing (ADR-024: never a bare point). Adjust any
        input; every field recomputes instantly, entirely in your browser.
      </p>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginBottom: 20 }}>
        {FIELDS.map(({ key, label, step, suffix }) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-text-secondary)" }}>
            {label}
            <input
              type="number"
              step={step ?? 1}
              value={form[key]}
              onChange={(e) => update(key, e.target.value)}
              style={{
                padding: "6px 8px",
                borderRadius: "var(--radius-md, 8px)",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-surface)",
                color: "var(--color-text-primary)",
                fontSize: 13,
              }}
            />
            {suffix && <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{suffix}</span>}
          </label>
        ))}
      </div>

      <EstimatedFigure
        figure={figure}
        label="Net present value (NPV)"
        pedigreeNote="±10% sensitivity band on wage and energy inputs — see automate-vs-hire.mjs's own documented convention. A live preview, not a persisted figure."
        companions={[
          {
            label: "Payback period",
            low: scenario.paybackYears.low,
            point: scenario.paybackYears.point,
            high: scenario.paybackYears.high,
            unit: "years",
            refusal: scenario.paybackYears.point === null && !scenario.refusal ? "Never pays back at this input point." : null,
          },
          {
            label: "Break-even labour rate",
            low: scenario.breakEvenWagePerHour.low,
            point: scenario.breakEvenWagePerHour.point,
            high: scenario.breakEvenWagePerHour.high,
            unit: "USD/hour",
            refusal: scenario.refusal,
          },
        ]}
      />

      <div style={{ marginTop: 20 }}>
        <NoticesRail heading="Recent recalculations" bare />
      </div>
    </section>
  );
}
