"use client";

/**
 * OperationsCalculatorPageView — the body of /operations/calculator (UI fix round 2026-09-08, item D3;
 * the operator ruled the move earlier and this round restates it).
 *
 * WHY THIS PAGE EXISTS. The capacity-investment calculator was a full-width section mounted below the
 * /operations list, under artboard 08's last card. Item D's page-scope ruling is that an artboard
 * defines the whole page, so the calculator moves to its own route.
 *
 * NO ARTBOARD. One of the three routes this round creates that Claude Design has not drawn
 * (coordinator note N4). Built in the STANDARD FRAME from parts that already exist — Masthead (the one
 * CommandBar), the content column + 300px rail grid, LegendRailCard — with the CURRENT calculator moved
 * across unchanged, not rewritten. Logged in DEVIATION-LOG.md as awaiting an artboard.
 *
 * "Recent recalculations" comes WITH it: that list is the calculator's own foot (NoticesRail, inside
 * AutomateVsHireCalculator.tsx), so removing it from the list page and moving the calculator are the
 * same act, not two.
 */

import { Masthead } from "@/components/ui/Masthead";
import { LegendRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { LIST_SURFACE_MOBILE_CSS } from "@/components/list-surface/ListSurfaceShell";
import { AutomateVsHireCalculator } from "@/components/operations/AutomateVsHireCalculator";

export function OperationsCalculatorPageView({
  dateLabel,
  nowIso,
  itemCount,
}: {
  dateLabel: string;
  nowIso?: string;
  /** The Operations corpus size, so this page's command bar states the same scope every other
   *  Operations surface does rather than inventing one of its own. */
  itemCount: number;
}) {
  return (
    <>
      <div className="cl-list-surface-masthead" style={{ padding: "20px 40px 0" }}>
        <style>{LIST_SURFACE_MOBILE_CSS}</style>
        <Masthead
          title="Capacity investment estimate"
          dek={
            <>
              What an equipment investment returns against your current handling cost ·{" "}
              <b style={{ color: "var(--ink)" }}>NPV, payback and the labour-rate break-even</b>, all three
              with equal billing · every field recomputes in your browser, nothing is stored
            </>
          }
          dateLabel={dateLabel}
          nowIso={nowIso}
          commandBar={{
            itemCount,
            scope: "operations",
            placeholder: 'Ask about this estimate — e.g. "what drives the payback period?"',
          }}
        />
      </div>
      <div
        className="cl-list-surface-grid"
        style={{
          padding: "20px 40px 40px",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 300px",
          gap: 28,
          alignItems: "start",
        }}
      >
        <style>{`
          @media (max-width: 1280px) {
            .cl-list-surface-grid { grid-template-columns: minmax(0, 1fr) !important; }
          }
        `}</style>
        <style>{LIST_SURFACE_MOBILE_CSS}</style>
        <div data-audit="calculator-column" style={{ minWidth: 0 }}>
          <AutomateVsHireCalculator />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <LegendRailCard />
        </div>
      </div>
    </>
  );
}
