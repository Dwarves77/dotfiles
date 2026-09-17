"use client";

import { formatLocaleDate } from "@/lib/format";
import { formatNumber } from "@/lib/format";
import {
  AdminPanelFrame,
  AdminPanelMetaText,
  AdminEmptyDashedFrame,
  adminThStyle,
  adminTdStyle,
} from "@/components/admin/AdminTableView";

// AssumptionRegisterPanel — admin Runtime -> Assumptions surface (WO-20 spec §4's minimum first reader,
// wired by lane W71-WIRE, 2026-09-05, plan §W7.1).
//
// WHY THIS EXISTS. assumption_register (migration 271, live) is the register for modelling constants
// THIS PRODUCT chose (a connection-scorer weight, an idf coefficient, a score floor, ...), distinct from
// emission_factors (numbers the WORLD published). Spec §4 names this exact minimum reader concretely:
// "no code in this repo can read this table today ... naming that plainly ... the WO-18 failure mode this
// repo already names ... emission_factors ships with a mandated first /admin reader before any seeder
// runs." This panel is that reader, built BEFORE the seeder is ever dispatched with --apply (still 0 rows
// live as of 2026-09-05) — the table is never populated-but-invisible, per that same rule.
//
// READ-ONLY BY DESIGN. Spec §4: "a read-only display consumer, deliberately not a runtime one." Nothing
// here writes; nothing here feeds a scorer at run time (discover.mjs's own PURE/no-DB/no-LLM constraint
// stays untouched). The register's job in v1 is to be the durable, queryable RECORD of a constant's value
// and rationale, checkable by a human against the literal in code — a drift-check script
// (scripts/verify/assumption-register-drift.mjs, spec §4's own "second-order consumer, explicitly NOT
// built by this WO") is future work, not this panel's job.
//
// HONESTY-OVER-FLATTERY EMPTY STATE (spec §4's own instruction): a NULL governing_decision renders a
// visible "no ruling on record" badge, never a blank cell — the same posture ImpactScores.tsx's "No
// scored dimensions yet" empty state already uses elsewhere in this admin surface. An empty register
// (0 rows, true as of 2026-09-05 — the seeder has not been dispatched with --apply yet) renders the same
// dashed-frame PendingFrame convention every other honest-empty admin panel in this file uses, not a
// silently blank table.

export interface AssumptionRegisterRow {
  assumption_key: string;
  subsystem: string;
  label: string;
  value_numeric: number | null;
  unit: string | null;
  derivation: string | null;
  origin_class: string | null;
  governing_decision: string | null;
  code_location: string;
  status: string;
  as_at_date: string | null;
}

interface AssumptionRegisterPanelProps {
  rows: AssumptionRegisterRow[];
}

function groupBySubsystem(rows: AssumptionRegisterRow[]): Map<string, AssumptionRegisterRow[]> {
  const groups = new Map<string, AssumptionRegisterRow[]>();
  for (const r of rows) {
    const key = r.subsystem || "(unassigned)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return groups;
}

export function AssumptionRegisterPanel({ rows }: AssumptionRegisterPanelProps) {
  const groups = groupBySubsystem(rows);
  const subsystems = [...groups.keys()].sort();

  return (
    <AdminPanelFrame
      title="Assumption register"
      right={
        <AdminPanelMetaText>
          {formatNumber(rows.length)} constant{rows.length === 1 ? "" : "s"} · {formatNumber(subsystems.length)} subsystem
          {subsystems.length === 1 ? "" : "s"} · WO-20
        </AdminPanelMetaText>
      }
    >
      {rows.length === 0 ? (
        <AdminEmptyDashedFrame title="No assumptions catalogued yet.">
          {
            // Text below is relocated verbatim from the pre-extraction inline JSX (byte-identical
            // rendered string; each `+` join reproduces the single-space line-collapse JSX itself
            // performed on the original multi-line text node).
            "The register (migration 271) is live with 0 rows — the 10-constant seed " + // glyph:verbatim
            "(scripts/gen/assumption-register-seed.mjs, docs/plans/wo20-assumption-register-spec.md §2) " + // glyph:verbatim
            "has not been dispatched with --apply yet, or migration 271 is not applied in this " +
            "environment. Empty here means not-yet-seeded, never a silent failure."
          }
        </AdminEmptyDashedFrame>
      ) : (
        <div style={{ padding: "4px 0 8px" }}>
          {subsystems.map((subsystem) => (
            <div key={subsystem} style={{ padding: "10px 20px 4px" }}>
              <p
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--text-2)",
                  margin: "0 0 6px",
                }}
              >
                {subsystem}
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-2)" }}>
                      <th style={adminThStyle}>Assumption</th>
                      <th style={adminThStyle}>Value</th>
                      <th style={adminThStyle}>Governing decision</th>
                      <th style={adminThStyle}>Code location</th>
                      <th style={adminThStyle}>As at</th>
                      <th style={adminThStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.get(subsystem)!.map((r) => (
                      <tr key={r.assumption_key} style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
                        <td style={adminTdStyle}>
                          <span style={{ display: "block", fontWeight: 700, color: "var(--text)" }}>
                            {r.label}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono, monospace)",
                              fontSize: 10.5,
                              color: "var(--text-2)",
                            }}
                          >
                            {r.assumption_key}
                          </span>
                        </td>
                        <td style={{ ...adminTdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                          {r.value_numeric === null ? "—" : `${r.value_numeric}${r.unit ? ` ${r.unit}` : ""}`}
                        </td>
                        <td style={adminTdStyle}>
                          {r.governing_decision ? (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: "1px 7px",
                                borderRadius: 999,
                                background: "var(--raised)",
                                border: "1px solid var(--color-border)",
                                color: "var(--color-primary)",
                              }}
                            >
                              {r.governing_decision}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: "1px 7px",
                                borderRadius: 999,
                                background: "var(--raised)",
                                border: "1px solid var(--color-border-medium)",
                                color: "var(--text-2)",
                              }}
                            >
                              no ruling on record
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            ...adminTdStyle,
                            color: "var(--text-2)",
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: 10.5,
                          }}
                        >
                          {r.code_location}
                        </td>
                        <td style={{ ...adminTdStyle, color: "var(--text-2)" }}>
                          {r.as_at_date ? formatLocaleDate(new Date(r.as_at_date)) : "—"}
                        </td>
                        <td style={adminTdStyle}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: "1px 7px",
                              borderRadius: 999,
                              background: "var(--raised)",
                              border: "1px solid var(--color-border)",
                              color: r.status === "active" ? "var(--sev-low, var(--text-2))" : "var(--text-2)",
                            }}
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPanelFrame>
  );
}
