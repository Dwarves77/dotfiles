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
import { SectionRule } from "@/components/ui/SectionRule";
import { nowFrom } from "@/lib/render-now";

const EDITORIAL_VOLUME = "IV";

/** ISO 8601 week number (Mon-start, week 1 contains first Thursday) —
 *  mirrors EditorialMasthead's own helper (kept duplicated rather than
 *  imported: that file is a "use client" sibling with no shared export of
 *  just this helper, and the function is a pure 6-line date computation,
 *  not a vocabulary at risk of drifting).
 *
 *  HYDRATION-59 (2026-09-07): reads the UTC field getters, not the local
 *  ones. The local getters made this function's output depend on the HOST's
 *  timezone — the server (UTC) and the viewer's browser resolve a different
 *  calendar date for part of every day, and when the two dates fall either
 *  side of a Monday they resolve a different ISO WEEK, so the "VOL IV · No.
 *  N" line rendered one number in the SSR HTML and another during hydration.
 *  See src/lib/render-now.ts for the two axes and why `nowIso` closes the
 *  second one. */
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
  /** The server's render instant (src/lib/render-now.ts `renderNowIso()`),
   *  threaded so the VOL line's week number is computed from an instant the
   *  SERVER chose rather than from each host's own clock — see that module
   *  for why a client component may not read its own clock in render. */
  nowIso?: string;
  /**
   * Appended to the "VOL IV · No. N · <date>" line (additive extension,
   * admin/account/settings lane 2026-09-06 — README screens 13-15 append
   * "· Operator view" / "· Personal" to name whose view this is).
   */
  eyebrowSuffix?: string;
  /**
   * An inline callout row inside the masthead card, directly below the
   * title/dek/command-bar row (additive, lane compose-other 2026-09-08 —
   * dc.html p15's own "Applies workspace-wide · changes here affect every
   * member, not just you" + "See audit log →" banner, `margin:0 16px
   * 14px;border-left:3px solid;background:#F5F2EE`). Optional: no existing
   * Masthead caller passes it, so every other page's masthead is
   * unaffected. Bold leading text + trailing right-aligned link, same
   * treatment as MembersPanel's own inline "Workspace" note.
   */
  notice?: { text: ReactNode; linkLabel?: string; linkHref?: string };
}

export function Masthead({ title, size = "list", dek, dateLabel, commandBar, volNumber, eyebrowSuffix, nowIso, notice }: MastheadProps) {
  const weekNo = volNumber ?? isoWeekNumber(nowFrom(nowIso));
  return (
    <header
      className="cl-masthead"
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      {/* Ruling 5.2 (2026-09-07): the masthead's own 3px rule is the dark grey gradation from 5.1,
          never the band-coloured rule (that stays confined to the nav card cap / mobile top bar /
          drawer). */}
      <SectionRule />
      <div className="cl-masthead-body" style={{ padding: "18px 24px 20px" }}>
      {/* Mobile spec (MASTHEAD): padding 14px 16px 0, VOL line 9.5px/700,
          title 24px/line-height 1.08 margin-top 5px, scope line 12px, the
          command bar drops to full width under the title. Below 768
          (theme.css's documented --bp-mobile). */}
      <style>{`
        /* D2 fix (operator report 2026-09-07): "the top text under Jason's Brief" — the scope
           line ("N items across N surfaces...") and the verticals line — wrapped with a one-word
           orphan (e.g. "...Automotive & Motorsport, Humanitarian & NGO" / "Cargo" alone on the
           next line). Greedy line-breaking packs every line but the last as full as possible,
           which is exactly what strands a short remainder word alone; \`text-wrap: balance\`
           distributes a block's own text evenly across its wrapped lines instead, so a multi-line
           scope/verticals line splits evenly with no orphan. \`text-wrap: pretty\` is the
           declared fallback for a browser that has \`pretty\` but not yet \`balance\` — the later
           \`balance\` declaration wins wherever it is supported; an unsupported value is ignored
           by the cascade, leaving \`pretty\` in effect. Applies to every page through this one
           shared Masthead part, not a dashboard-only override; DIRECT children of \`.cl-masthead-
           dek\` are each their own wrapped block (the scope line and the verticals line are two
           separate <div>s), so the rule targets them individually rather than the dek container. */
        .cl-masthead-dek > * {
          text-wrap: pretty;
          text-wrap: balance;
        }
        @media (max-width: 767px) {
          .cl-masthead-body { padding: 14px 16px 0 !important; }
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
      </div>
      {notice && (
        <div
          style={{
            margin: "0 16px 16px",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            alignItems: "center",
            padding: "9px 12px",
            borderLeft: "3px solid var(--ink-3)",
            background: "var(--color-surface-overlay)",
            borderRadius: "0 6px 6px 0",
          }}
        >
          <span style={{ fontSize: "12.5px" }}>{notice.text}</span>
          {notice.linkLabel && (
            <a href={notice.linkHref ?? "#"} style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
              {notice.linkLabel}
            </a>
          )}
        </div>
      )}
    </header>
  );
}
