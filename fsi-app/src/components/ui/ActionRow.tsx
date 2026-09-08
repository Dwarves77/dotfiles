"use client";

/**
 * ActionRow — the detail action row (UI system handoff 2026-09-06, README
 * "Detail action row"; design ruling R5, 2026-09-07): Export brief
 * (primary, ink) · Share · Watch (star) · + Tag, always visible on every
 * detail header, never folded into a "..." menu.
 *
 * Lane uiactions (2026-09-07). Used by all four detail surfaces
 * (RegulationDetailSurface, MarketSignalDetailSurface,
 * ResearchFindingDetailSurface, OperationsDetailSurface) — one shared part
 * instead of the four byte-identical `ActionButton` + `shareCurrent`
 * copies that lived privately in each surface before this lane (CLAUDE.md
 * rule 13). `exportBriefAsMarkdown`'s per-surface meta rows and filename
 * prefix differ (jurisdiction vs. severity vs. region, etc.), so that part
 * stays a thin per-surface call into the shared `downloadMarkdownBrief`
 * builder below rather than a single hardcoded shape.
 *
 * + Tag is a trigger only: an optional `onTag` prop the workspace-tags
 * lane will supply (the popover itself, migration, and API are that
 * lane's write set — out of this lane's scope, "do not touch tags code").
 * Renders nothing when `onTag` is absent, so a detail surface with no tags
 * wiring yet shows exactly the three wired buttons, never a dead pill.
 *
 * Watch is NOT reimplemented here — the `watch` prop takes an already-
 * instantiated `<WatchButton variant="row" .../>` (WatchButton owns all
 * persistence/toggle logic; see that file's own header) so this component
 * never duplicates watch state management.
 */

import type { ReactNode } from "react";
import type { Resource } from "@/types/resource";

export interface ActionRowProps {
  /** Export brief — primary button. */
  onExport: () => void;
  /** Share — secondary button. */
  onShare: () => void;
  /** An instantiated `<WatchButton variant="row" .../>` — see file header. */
  watch: ReactNode;
  /**
   * + Tag trigger. Optional: the workspace-tags lane wires this to open
   * its popover. Absent here (this lane does not touch tags code) — the
   * pill renders nothing until that lane fills it in.
   */
  onTag?: () => void;
  exportDisabled?: boolean;
}

export function ActionRow({ onExport, onShare, watch, onTag, exportDisabled }: ActionRowProps) {
  return (
    <div className="cl-action-row" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {/* Mobile 390 build, lane mobdetail (2026-09-07, spec "DETAIL HEADER": "FOUR ACTIONS as a 2x2
          grid, gap 8px, each min-height 44px" below 768) — the same ActionRow, expressed as a grid
          at the smaller measure via a media query, never a page-local fork or a second component.
          All four actions stay visible; none moves into an overflow menu (ruling R5). */}
      <style>{`
        @media (max-width: 768px) {
          .cl-action-row { display: grid !important; grid-template-columns: 1fr 1fr; gap: 8px; }
          .cl-action-row > * { width: 100%; }
          /* MOBILE-60 (2026-09-08) [CONFIRMED, measured at 390]: the mobile 390 spec gives these
             four "Export brief (#5A5552 fill, #FFFFFF, 12.5px/700), Share, Watch, Tag, each 1px
             solid rgba(0,0,0,.25), 12.5px/600". Only the 2x2 geometry had been taken from that
             paragraph; the type was still the desktop 11.5px/800/700, so the buttons read a size
             and a weight the spec does not state. Desktop is untouched (this block is inside the
             <=768 query). */
          .cl-action-row > button { font-size: 12.5px !important; font-weight: 600 !important; }
          .cl-action-row > button:first-of-type { font-weight: 700 !important; }
        }
      `}</style>
      <ActionButton variant="primary" onClick={onExport} disabled={exportDisabled}>
        Export brief
      </ActionButton>
      <ActionButton variant="secondary" onClick={onShare}>
        Share
      </ActionButton>
      {watch}
      {onTag && (
        <ActionButton variant="dashed" onClick={onTag}>
          + Tag
        </ActionButton>
      )}
    </div>
  );
}

/** Shared button chrome for the row: 8px gap (caller), padding 8px 14px, radius 6.
 *  primary = ink #5A5552 fill / white text; secondary = white, border rgba(0,0,0,.25),
 *  hover #F5F2EE; dashed = the + Tag trigger's dashed-outline pill (same secondary
 *  chrome, dashed border). Exported so WatchButton's "row" variant can match exactly
 *  without re-deriving the same seven style properties a second time. */
export function ActionButton({
  children,
  variant = "secondary",
  onClick,
  disabled,
  ariaPressed,
  title,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "dashed";
  onClick?: () => void;
  disabled?: boolean;
  ariaPressed?: boolean;
  title?: string;
  /** Additive (audit item 3.5, 2026-09-07): WatchButton's "row" variant uses these to swap its
   *  label to "Unwatch" on hover/focus without re-deriving this chrome's own hover-background
   *  effect. Optional — every existing caller (Export brief/Share/+ Tag) passes none and behaves
   *  exactly as before. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const primary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ariaPressed}
      title={title}
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-115)",
        fontWeight: primary ? 800 : 700,
        padding: "8px 14px",
        minHeight: 44,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        borderRadius: "var(--radius-control)",
        border: primary ? "1px solid var(--brand)" : variant === "dashed" ? "1px dashed rgba(0,0,0,.25)" : "1px solid rgba(0,0,0,.25)",
        background: primary ? "var(--brand)" : "var(--card)",
        color: primary ? "#fff" : "var(--ink)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!primary && !disabled) (e.currentTarget as HTMLButtonElement).style.background = "#F5F2EE";
        onMouseEnter?.();
      }}
      onMouseLeave={(e) => {
        if (!primary) (e.currentTarget as HTMLButtonElement).style.background = "var(--card)";
        onMouseLeave?.();
      }}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {children}
    </button>
  );
}

// ── Shared Export / Share implementations ──────────────────────────────

/** Native share (falls back to clipboard copy) — byte-identical across all
 *  four detail surfaces before this lane; now the one implementation. */
export function shareResource(r: Pick<Resource, "title" | "note" | "whatIsIt">) {
  if (typeof window === "undefined") return;
  const href = typeof window.location !== "undefined" ? window.location.href : "";
  const shareData = { title: r.title, text: r.note || r.whatIsIt || r.title, url: href };
  const nav = window.navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    nav.share(shareData).catch(() => copyToClipboard(href));
    return;
  }
  copyToClipboard(href);
}

function copyToClipboard(text: string) {
  if (typeof window === "undefined" || !text) return;
  const nav = window.navigator as Navigator & { clipboard?: { writeText: (s: string) => Promise<void> } };
  if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
    nav.clipboard.writeText(text).catch(() => {});
  }
}

/** Export brief as a downloaded .md file. `metaRows` are the caller's own
 *  surface-specific label/value lines (jurisdiction for regulations,
 *  severity for market signals, etc.) — the download/blob/filename
 *  mechanics are the one shared part. */
export function downloadMarkdownBrief(
  r: Pick<Resource, "id" | "title" | "fullBrief" | "whatIsIt" | "whyMatters" | "note">,
  opts: { metaRows: Array<string | null>; filenamePrefix: string }
) {
  if (typeof window === "undefined") return;
  const titleLine = `# ${r.title}\n\n`;
  const meta = opts.metaRows.filter(Boolean).join("\n");
  const body = r.fullBrief || [r.whatIsIt, r.whyMatters].filter(Boolean).join("\n\n") || r.note || "(No briefing body recorded.)";
  const md = `${titleLine}${meta ? meta + "\n\n" : ""}${body}\n`;
  const slug = (r.id || opts.filenamePrefix).toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opts.filenamePrefix}-${slug || "brief"}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
