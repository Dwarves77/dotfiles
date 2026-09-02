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
 * RecalculationNotice list underneath is fed by GET /api/notices — Bearer-token auth via the browser
 * session, same idiom WatchButton.tsx already establishes for this codebase's client-side auth calls.
 */

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { automateVsHire, DEFAULT_SCENARIO } from "@/lib/operations/automate-vs-hire.mjs";
import { EstimatedFigure } from "@/components/figures/EstimatedFigure";
import { RecalculationNotice } from "@/components/figures/RecalculationNotice";
import type { RecalculationNoticeItem } from "@/components/figures/RecalculationNotice";
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
  { key: "labourCostPerHour", label: "Wage (USD/hour)", step: 0.5, suffix: "USD/hr" },
  { key: "hoursPerUnitManual", label: "Hours per unit — manual", step: 0.01 },
  { key: "hoursPerUnitAutomated", label: "Hours per unit — automated", step: 0.01 },
  { key: "energyPricePerKwh", label: "Energy price (USD/kWh)", step: 0.01, suffix: "USD/kWh" },
  { key: "kwhPerUnitAutomated", label: "kWh per unit — automated", step: 0.01 },
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
  const [notices, setNotices] = useState<RecalculationNoticeItem[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);

  const scenario = useMemo(() => automateVsHire(form), [form]);
  const figure = useMemo(() => makeSyntheticValue(scenario), [scenario]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/notices", {
          headers: { Authorization: `Bearer ${session?.access_token || ""}` },
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && Array.isArray(json.notices)) setNotices(json.notices);
      } catch {
        // Fail soft — the notices rail is a courtesy, never a blocker for the calculator itself.
      } finally {
        if (!cancelled) setNoticesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function update(key: keyof FormState, raw: string) {
    const n = Number(raw);
    setForm((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : prev[key] }));
  }

  return (
    <section className="cl-card" style={{ padding: "20px 22px", marginTop: 24 }} aria-labelledby="automate-vs-hire-heading">
      <h2 id="automate-vs-hire-heading" className="cl-page-title" style={{ fontSize: 17, marginBottom: 4 }}>
        Automate vs. hire
      </h2>
      <p className="cl-card-body" style={{ marginBottom: 16 }}>
        A live estimate — NPV, payback and break-even wage, all three with equal billing (ADR-024: never a
        bare point). Adjust any input; every field recomputes instantly, entirely in your browser.
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
            label: "Break-even wage",
            low: scenario.breakEvenWagePerHour.low,
            point: scenario.breakEvenWagePerHour.point,
            high: scenario.breakEvenWagePerHour.high,
            unit: "USD/hour",
            refusal: scenario.refusal,
          },
        ]}
      />

      <div style={{ marginTop: 20 }}>
        <div className="cl-section-label" style={{ marginBottom: 8 }}>Recent recalculations</div>
        {noticesLoading ? (
          <div className="cl-card-meta">Loading…</div>
        ) : (
          <RecalculationNotice notices={notices} emptyMessage="No recalculations on your team's watchlist since your last visit." />
        )}
      </div>
    </section>
  );
}
