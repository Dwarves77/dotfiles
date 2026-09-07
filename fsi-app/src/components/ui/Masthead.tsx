"use client";

/**
 * Masthead — the frame masthead (UI system handoff 2026-09-06, README
 * §0.3): "VOL IV · No. 36 · <date>" line, Anton title (34px list/dashboard,
 * 28px detail), dek or breadcrumb, then the command bar.
 *
 * A NEW component, not a rewrite of the pre-existing PageMasthead/
 * EditorialMasthead pair (src/components/shell/PageMasthead.tsx,
 * src/components/ui/EditorialMasthead.tsx) — those remain in place and
 * keep rendering the other, not-yet-migrated surfaces unchanged. This
 * lane's dashboard (the one page this lane builds per README scope)
 * mounts THIS component; migrating the other 16 pages onto it is later-
 * lane scope, logged in docs/design/handoff-2026-09-06/DEVIATION-LOG.md.
 *
 * MOBILE 390 (lane mobframe, 2026-09-07, mobile-390 spec, MASTHEAD): below
 * 768 the padding, VOL line, title and scope-line sizes shrink and the
 * command bar goes full width under the title — media queries inside this
 * ONE component (`.cl-masthead` below), never a second masthead.
 */

import type { ReactNode } from "react";
import { CommandBar } from "@/components/ui/CommandBar";

const EDITORIAL_VOLUME = "IV";

/** ISO 8601 week number (Mon-start, week 1 contains first Thursday) —
 *  mirrors EditorialMasthead's own helper (kept duplicated rather than
 *  imported: that file is a "use client" sibling with no shared export of
 *  just this helper, and the function is a pure 6-line date computation,
 *  not a vocabulary at risk of drifting). */
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export interface MastheadProps {
  title: string;
  /** "list" = 34px title (dashboard/list surfaces); "detail" = 28px. */
  size?: "list" | "detail";
  dek?: ReactNode;
  dateLabel: string;
  commandBar?: { itemCount: number; onSearch?: (q: string) => void; scope?: string; placeholder?: string };
  volNumber?: number;
  /**
   * Appended to the "VOL IV · No. N · <date>" line (additive extension,
   * admin/account/settings lane 2026-09-06 — README screens 13-15 append
   * "· Operator view" / "· Personal" to name whose view this is).
   */
  eyebrowSuffix?: string;
}

export function Masthead({ title, size = "list", dek, dateLabel, commandBar, volNumber, eyebrowSuffix }: MastheadProps) {
  const weekNo = volNumber ?? isoWeekNumber(new Date());
  return (
    <header
      className="cl-masthead"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: "18px 24px 20px",
      }}
    >
      {/* Mobile spec (MASTHEAD): padding 14px 16px 0, VOL line 9.5px/700,
          title 24px/line-height 1.08 margin-top 5px, scope line 12px, the
          command bar drops to full width under the title. Below 768
          (theme.css's documented --bp-mobile). */}
      <style>{`
        @media (max-width: 767px) {
          .cl-masthead { padding: 14px 16px 0 !important; }
          .cl-masthead .cl-masthead-eyebrow { font-size: 9.5px !important; font-weight: 700 !important; }
          .cl-masthead .cl-masthead-title { font-size: 24px !important; line-height: 1.08 !important; margin-top: 5px !important; }
          .cl-masthead .cl-masthead-dek { font-size: 12px !important; line-height: 1.45 !important; }
          .cl-masthead .cl-masthead-row { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
          .cl-masthead .cl-masthead-cmdbar { flex: 1 1 auto !important; min-width: 0 !important; width: 100% !important; }
        }
      `}</style>
      <p
        className="cl-masthead-eyebrow"
        style={{
          fontSize: "var(--fs-105)",
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          margin: "0 0 6px",
        }}
      >
        VOL {EDITORIAL_VOLUME} · No. {weekNo} · {dateLabel}
        {eyebrowSuffix ? ` · ${eyebrowSuffix}` : ""}
      </p>
      <div className="cl-masthead-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <h1
            data-guard-title
            className="cl-masthead-title"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontSize: size === "list" ? 34 : 28,
              lineHeight: 1.05,
              color: "var(--ink)",
              margin: 0,
              minWidth: 0,
              wordBreak: "break-word",
            }}
          >
            {title}
          </h1>
          {dek && (
            <div className="cl-masthead-dek" style={{ fontSize: "var(--fs-13)", color: "var(--ink-2)", margin: "8px 0 0" }}>{dek}</div>
          )}
        </div>
        {commandBar && (
          <div className="cl-masthead-cmdbar" style={{ flex: "0 1 420px", minWidth: 260 }}>
            <CommandBar
              itemCount={commandBar.itemCount}
              onSearch={commandBar.onSearch}
              scope={commandBar.scope}
              placeholder={commandBar.placeholder}
            />
          </div>
        )}
      </div>
    </header>
  );
}
