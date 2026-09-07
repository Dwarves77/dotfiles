"use client";

/**
 * DetailShell — the ONE detail architecture (UI system handoff 2026-09-06,
 * README §0.5), shared by all four detail surfaces this lane owns
 * (regulations, market, research, operations). Nothing here is a shared
 * `ui/` part (those stay list/dashboard-scoped per the lane contract) —
 * this is scoped to the four detail routes this lane writes, so it lives
 * under components/detail/ rather than duplicating the shell four times
 * (CLAUDE.md rule 13).
 *
 * Shape (README §0.5, exact order):
 *   DetailMasthead (VOL/breadcrumb + title + dek + ONE scoped CommandBar)
 *   -> DetailHeader (band pill + tier + workspace tags + action row) -> full
 *   MilestoneTimeline with the next obligation as the callout -> StateNote
 *   -> sticky section index (S1 . S2 . S3 ...) -> sections of FactCards at
 *   <=72ch -> rail. Section names vary by surface; the shape, rail and
 *   index never do. No tabs, no per-tab ask bar, no "Complete brief" toggle.
 *
 * DEFECT-FIX (item 2.3, 2026-09-07): DetailHeader no longer mounts a second
 * `CommandBar` scoped to the item (the old `askPlaceholder`/`askScope`
 * props). "The CommandBar in the Masthead is the only search/ask surface" —
 * a per-item ask box living inside this header was a second ask surface on
 * every detail page, which the audit named directly.
 *
 * GAP G2 (2026-09-07, artboard 03, ruling R4): the above left detail pages
 * with NO command bar at all — this shell now mounts the shared `ui/Masthead`
 * (`DetailMasthead` below) at the top of every detail page, carrying the
 * item title (moved out of DetailHeader, which would otherwise duplicate
 * it — artboard 03 shows the title exactly once), the R4 breadcrumb format
 * in the VOL line, and the ONE scoped CommandBar ("Ask about this
 * regulation" / "this signal" / "this finding" / "this profile").
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { withListPosition } from "@/components/list-surface/list-surface-helpers";
import { BandChip, TierChip } from "@/components/ui/Chips";
import { MilestoneTimeline, classifyTimelineEntries } from "@/components/ui/MilestoneTimeline";
import { StateNote } from "@/components/ui/StateNote";
import { ImpactMeter } from "@/components/ui/ImpactMeter";
import { Absence } from "@/components/ui/Absence";
import { SectionRule } from "@/components/ui/SectionRule";
import { Masthead } from "@/components/ui/Masthead";
import { daysUntil, type UrgencyBand } from "@/lib/urgency/bands";
import type { ImpactScores, TimelineEntry } from "@/types/resource";

// ── Header ──────────────────────────────────────────────────────────────

export interface DetailHeaderProps {
  band: UrgencyBand;
  tier?: number | null;
  /**
   * Item title. GAP G2 (2026-09-07, artboard 03 + ruling R4): the visible
   * title now lives in `DetailMasthead` below, mounted once per detail
   * page above this header — rendering it a second time here would be
   * exactly the duplicate-title artboard 03 does not show. Kept as a
   * required prop (used only for this header's `aria-label`) so a screen
   * reader landmark still names the header even though no second <h1>
   * is drawn.
   */
  title: string;
  actions?: React.ReactNode;
  /**
   * Extension point (lane uidetails2, 2026-09-07): additional chips
   * rendered in the same row as the band/tier chips — item-type, topic,
   * mode chips, etc. Additive prop, never a fork of this component (README
   * §0.5 "extend the shared part additively" — used by market/research/
   * operations detail, which each carry more header chips than the
   * regulation detail's band+tier alone).
   */
  extraChips?: React.ReactNode;
  /**
   * Extension point (lane uitags, 2026-09-07, README "Workspace tags" /
   * ruling R6): the detail tag row, rendered directly under the title,
   * applied WorkspaceTagPills, then the + Tag trigger, then a muted
   * "workspace tags" label. Built by DetailTagRow (src/components/ui/) and
   * passed in by each of the four detail surfaces; undefined renders
   * nothing extra, so this stays additive for any other DetailHeader
   * caller.
   */
  tagRow?: React.ReactNode;
}

export function DetailHeader({ band, tier, title, actions, extraChips, tagRow }: DetailHeaderProps) {
  return (
    <header
      aria-label={title}
      style={{
        position: "relative",
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        marginBottom: 16,
        overflow: "hidden",
        /* dc.html #p3 (char 201809), the band-pill/action-row card: padding:16px 20px 18px. */
        padding: "16px 20px 18px",
      }}
    >
      {/* Ruling 5.2 (2026-09-07): every 3px rule on a detail header uses the dark grey gradation
          from 5.1, never the band-coloured rule (that stays confined to the nav card cap / mobile
          top bar / drawer). Positioned absolute so it spans the card's full width regardless of
          the header's own padding (the padding above is a real, measured card property; the rule
          is not indented by it). */}
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <SectionRule />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <BandChip band={band} />
            {typeof tier === "number" && <TierChip tier={tier} />}
            {extraChips}
          </div>
          {tagRow && <div style={{ marginTop: 10 }}>{tagRow}</div>}
        </div>
        {actions && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, maxWidth: "100%" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "100%" }}>{actions}</div>
          </div>
        )}
      </div>
    </header>
  );
}

// ── Masthead: page-level VOL/breadcrumb/title/dek/CommandBar for detail
// routes ─────────────────────────────────────────────────────────────────
//
// GAP G2 (2026-09-07 operator audit item 2.3, artboard 03, ruling R4): the
// audit's own text ("moves to the page's Masthead CommandBar") is now built
// literally — the shared `ui/Masthead` (previously list/dashboard-only) is
// mounted once at the top of every detail page, carrying the item title
// (size="detail", 28px), the breadcrumb in the VOL line itself
// ("VOL IV . NO. 36 . <Surface> / <Jurisdiction> / N of M in <Band>", R4's
// exact format — `dateLabel` doubles as the breadcrumb slot Masthead
// already renders, no second line invented), the optional dek, and ONE
// scoped CommandBar ("Ask about this regulation" / "this signal" / "this
// finding" / "this profile"). `DetailHeader` below it no longer renders a
// title or a meta line — see that component's own doc comment.

function DetailMastheadBreadcrumb({
  surface,
  jurisdiction,
  band,
  onLabel,
}: {
  surface: string;
  jurisdiction?: string;
  band: UrgencyBand;
  onLabel: (label: string) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const pos = searchParams.get("pos");
    const of = searchParams.get("of");
    const known = pos != null && of != null && Number.isFinite(Number(pos)) && Number.isFinite(Number(of));
    const base = [surface, jurisdiction].filter(Boolean).join(" / ");
    onLabel(known ? `${base} / ${pos} of ${of} in ${band.label}` : base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, surface, jurisdiction, band.label]);
  return null;
}

export interface DetailMastheadProps {
  title: string;
  band: UrgencyBand;
  /** Breadcrumb surface name, e.g. "Regulations". */
  surface: string;
  /** Breadcrumb jurisdiction segment, e.g. "European Union". Omitted renders no second segment (Absence-by-omission). */
  jurisdiction?: string;
  dek?: React.ReactNode;
  /** Scoped ask placeholder, e.g. "Ask about this regulation — e.g. when does the l...". */
  placeholder: string;
}

export function DetailMasthead({ title, band, surface, jurisdiction, dek, placeholder }: DetailMastheadProps) {
  const [breadcrumb, setBreadcrumb] = useState(() => [surface, jurisdiction].filter(Boolean).join(" / "));
  return (
    <>
      <Suspense fallback={null}>
        <DetailMastheadBreadcrumb surface={surface} jurisdiction={jurisdiction} band={band} onLabel={setBreadcrumb} />
      </Suspense>
      <div style={{ marginBottom: 16 }}>
        <Masthead title={title} size="detail" dateLabel={breadcrumb} dek={dek} commandBar={{ itemCount: 0, placeholder, scope: surface.toLowerCase() }} />
      </div>
    </>
  );
}

// ── Exposure grid (WHERE / WHO PAYS / YOUR LANES / TRAJECTORY) ──────────
//
// Extension (lane uidetails2, 2026-09-07, README §0.5 + the 05/07/09
// artboards' own top label: "identical architecture to the regulation
// detail: header + exposure + timeline -> index -> sections -> rail").
// Generic, prop-driven so each of the four detail surfaces supplies its
// own four columns without a page-local fork of the card chrome. The
// regulation detail (built by an earlier lane, before this component
// existed) does not yet call it — logged in DEVIATION-LOG.md as a gap for
// a future lane, out of this lane's stated scope (market/research/
// operations only).

export interface ExposureItem {
  label: string;
  value: React.ReactNode;
}

export function DetailExposure({ items }: { items: ExposureItem[] }) {
  if (items.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div style={{ padding: "16px 20px" }}>
      <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 12px" }}>
        Exposure
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0,1fr))`,
          gap: 18,
        }}
        className="cl-exposure-grid"
      >
        <style>{`
          @media (max-width: 900px) { .cl-exposure-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; } }
          @media (max-width: 520px) { .cl-exposure-grid { grid-template-columns: 1fr !important; } }
        `}</style>
        {items.map((it, i) => (
          <div key={i} style={{ minWidth: 0 }}>
            <p style={{ fontSize: "var(--fs-95)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 6px" }}>
              {it.label}
            </p>
            <div style={{ fontSize: "var(--fs-125)", lineHeight: 1.5, color: "var(--ink)", overflowWrap: "anywhere" }}>{it.value}</div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

// ── Full timeline + next-obligation callout ────────────────────────────

export interface DetailTimelineProps {
  entries?: TimelineEntry[] | null;
  band: UrgencyBand;
}

export function DetailTimeline({ entries, band }: DetailTimelineProps) {
  const list = entries ?? [];
  const next = list.find((e) => e.status === "current") ?? list.find((e) => e.status !== "past") ?? null;

  return (
    <div
      style={{
        position: "relative",
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        marginBottom: 16,
        overflow: "hidden",
        padding: "16px 20px",
      }}
    >
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <SectionRule />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-3)", margin: 0 }}>
          Timeline
        </p>
        <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)" }}>{list.length} milestones</span>
      </div>
      {list.length === 0 ? (
        <Absence reason="pending" />
      ) : (
        <>
          {/* Mobile 390 build, lane mobdetail (2026-09-07, spec "TIMELINE (vertical)"): below 768
              the desktop horizontal dot row + date strip is replaced by a 62/14/1fr vertical grid
              carrying the date, dot and label per row, with the next-obligation callout inline on
              the next row. Both blocks render; CSS decides which is visible — no client media-query
              JS, so this stays correct on first paint (same pattern as this file's own
              `.cl-detail-layout` / `.cl-exposure-grid` breakpoints). */}
          <style>{`
            @media (max-width: 768px) { .cl-timeline-desktop { display: none; } }
            @media (min-width: 769px) { .cl-timeline-mobile, .cl-timeline-next-note-mobile-hide { display: none; } }
          `}</style>
          <div className="cl-timeline-desktop">
            <MilestoneTimeline entries={list} bandHex={band.cssVar} variant="full" />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 8,
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {list.slice(0, 5).map((e, i) => (
                <span key={i} style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)", flex: "1 1 0", minWidth: 0, overflowWrap: "anywhere" }}>
                  {e.date}
                </span>
              ))}
            </div>
          </div>
          <div className="cl-timeline-mobile">
            <VerticalMilestoneStack list={list} band={band} />
          </div>
        </>
      )}
      {next && (
        <div className="cl-timeline-next-note-mobile-hide" style={{ marginTop: 14 }}>
          <StateNote band={band}>
            Next: {next.label} · {next.date}
          </StateNote>
        </div>
      )}
    </div>
  );
}

// ── Mobile vertical timeline stack (below 768) ──────────────────────────
//
// Mobile 390 build, lane mobdetail (2026-09-07, spec "TIMELINE (vertical)"):
// grid 62px date gutter / 14px dot column / 1fr label column. Dot state
// (passed/next/ahead) reuses MilestoneTimeline's own `classifyTimelineEntries`
// (CLAUDE.md rule 13 — one classifier, not a second one derived here). The
// track is a single vertical bar behind the dots, green from the top down
// to the "next" row and rgba(0,0,0,.12) beyond, per spec. The next row's
// day count reuses the SAME "Next: <label> · <date>" wording the desktop
// StateNote callout already renders (README + coordinator note: the design
// artboard's literal "Next obligation - N days" is not copy this build
// invents from scratch; keep the desktop phrasing, add the day count),
// logged in DEVIATION-LOG.md.

function VerticalMilestoneStack({ list, band }: { list: TimelineEntry[]; band: UrgencyBand }) {
  const rows = classifyTimelineEntries(list.slice(0, 5));
  const todayIndex = rows.findIndex((r) => r.state === "next");
  const trackTodayPct = rows.length <= 1 ? 100 : todayIndex < 0 ? 100 : (todayIndex / (rows.length - 1)) * 100;

  return (
    <div style={{ position: "relative" }}>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 69,
          top: 10,
          bottom: 10,
          width: 2,
          background: `linear-gradient(to bottom, var(--awareness) 0%, var(--awareness) ${trackTodayPct}%, rgba(0,0,0,.12) ${trackTodayPct}%, rgba(0,0,0,.12) 100%)`,
        }}
      />
      {rows.map(({ entry, state }, i) => {
        const isNext = state === "next";
        const days = isNext ? daysUntil(entry.date) : null;
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "62px 14px 1fr",
              alignItems: "start",
              paddingBottom: 14,
            }}
          >
            <span
              style={{
                textAlign: "right",
                paddingRight: 8,
                fontSize: "var(--fs-11)",
                fontWeight: isNext ? 800 : 600,
                color: "var(--ink-3)",
              }}
            >
              {entry.date}
            </span>
            <span style={{ display: "flex", justifyContent: "center" }}>
              {state === "passed" && (
                <span
                  aria-hidden="true"
                  style={{ position: "relative", zIndex: 1, width: 10, height: 10, borderRadius: "50%", background: "var(--awareness)" }}
                />
              )}
              {state === "next" && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "relative",
                    zIndex: 1,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: band.cssVar,
                    boxShadow: `0 0 0 3px color-mix(in srgb, ${band.cssVar} 25%, transparent)`,
                  }}
                />
              )}
              {state === "ahead" && (
                <span
                  aria-hidden="true"
                  style={{ position: "relative", zIndex: 1, width: 10, height: 10, borderRadius: "50%", background: "var(--card)", border: "2px solid var(--ink-3)" }}
                />
              )}
            </span>
            <span
              style={{
                paddingLeft: 8,
                minWidth: 0,
                fontSize: "var(--fs-12)",
                fontWeight: isNext ? 700 : 400,
                color: "var(--ink)",
                overflowWrap: "anywhere",
              }}
            >
              {entry.label}
              {isNext && days !== null && (
                <span style={{ display: "block", marginTop: 2, fontSize: "var(--fs-11)", fontWeight: 400, color: "var(--ink-3)" }}>
                  Next: {entry.date} · {days} day{days === 1 ? "" : "s"}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sticky section index (S1 . S2 . S3 …) ──────────────────────────────

export interface SectionIndexEntry {
  id: string;
  label: string;
}

export function SectionIndex({
  sections,
  trailing,
}: {
  sections: SectionIndexEntry[];
  /**
   * Right-aligned control rendered in the same sticky row as the S1 S2 S3 …
   * pill group — additive slot (lane uiactions, 2026-09-07) for the detail
   * architecture's Summary | Full brief depth switch (see
   * `SummaryDepthSwitch` below). Optional: omitted, the row renders exactly
   * as before (index links only).
   */
  trailing?: React.ReactNode;
}) {
  // Restructured, fix lane fix58-detail (2026-09-07, sectionindex.json): dc.html #p3 "sticky
  // index" block is a bordered PILL GROUP (white, 1px border, 8px radius, 4px padding), whose
  // current-section item is a FILLED dark pill ("S1 Summary", no separator dot) and whose other
  // items are plain 6px-radius links ("S2 Obligations") — not the previous bare flex row of
  // middot-separated underline-free links. `active` tracks the section currently in view via
  // IntersectionObserver, so the filled pill is a real scroll-spy state, not a static "first item
  // always filled" fake.
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (sections.length === 0) return;
    const els = sections.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el != null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const idx = els.indexOf(visible[0].target as HTMLElement);
          if (idx >= 0) setActive(idx);
        }
      },
      { rootMargin: "-64px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.map((s) => s.id).join("|")]);

  if (sections.length === 0) return null;
  return (
    <nav
      aria-label="Section index"
      className="cl-section-index"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--page)",
        padding: "6px 0",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        maxWidth: "100%",
      }}
    >
      {/* Mobile 390 build, lane mobdetail (2026-09-07, spec "SECTION INDEX": "sticky at the top of
          main.overflow-y-auto, scrolls sideways, chips min-height 36") — the index already sticks
          and scrolls sideways at every width; below 768 the link's hit target drops from the 44px
          floor to the spec's explicit 36px. */}
      <style>{`
        @media (max-width: 768px) {
          .cl-section-index-link { min-height: 36px !important; }
        }
      `}</style>
      <div
        data-guard-strip
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "var(--card)",
          border: "1px solid var(--line-1)",
          borderRadius: 8,
          padding: 4,
          fontSize: "12.5px",
          overflowX: "auto",
          whiteSpace: "nowrap",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        {sections.map((s, i) => {
          const isActive = i === active;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="cl-section-index-link"
              aria-current={isActive ? "true" : undefined}
              style={{
                fontSize: "12.5px",
                fontWeight: isActive ? 700 : 600,
                color: isActive ? "#FFFFFF" : "var(--ink-2)",
                background: isActive ? "var(--brand)" : "transparent",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                borderRadius: 6,
                padding: "6px 12px",
              }}
            >
              S{i + 1} {s.label}
            </a>
          );
        })}
      </div>
      {trailing && <div style={{ flexShrink: 0 }}>{trailing}</div>}
    </nav>
  );
}

// ── Summary depth switch: "Summary | Full brief" ────────────────────────
//
// Lane uiactions (2026-09-07, README §0.5 + design ruling R3): the ONLY
// summary depth control in this architecture — two states, not the old
// three-state summary-depth toggle README §0.5 names as removed pre-existing
// (confirmed by this file's own npmtest.mjs asserting that dead control's
// exact former label is gone from the code). Wired, not decorative: a
// detail surface passes `depth` +
// `onChange` from its own useState and reads `depth` when deciding whether
// to also render the item's full brief markdown in the Summary section.
export type SummaryDepth = "summary" | "full";

export function SummaryDepthSwitch({ depth, onChange }: { depth: SummaryDepth; onChange: (d: SummaryDepth) => void }) {
  const opt = (value: SummaryDepth, label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={depth === value}
      onClick={() => onChange(value)}
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-105)",
        fontWeight: 700,
        padding: "6px 14px",
        minHeight: 44,
        display: "inline-flex",
        alignItems: "center",
        border: "none",
        borderRadius: 5,
        background: depth === value ? "var(--brand)" : "transparent",
        color: depth === value ? "#fff" : "var(--ink-2)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Summary depth"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-control)",
        background: "var(--card)",
      }}
    >
      {opt("summary", "Summary")}
      {opt("full", "Full brief")}
    </div>
  );
}

// ── Sections of fact cards, <=72ch ──────────────────────────────────────

export function DetailSection({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      id={id}
      style={{
        position: "relative",
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        marginBottom: 16,
        scrollMarginTop: 56,
        overflow: "hidden",
        padding: "16px 20px",
      }}
    >
      {/* Absolute so the rule spans the card's full width regardless of the section's own padding
          (the padding is a real, measured card property; the rule is not indented by it). */}
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <SectionRule />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            /* README §0.4 type scale: card titles 20px (artboard p3 section header, "Summary"). */
            fontSize: 20,
            margin: 0,
            color: "var(--ink)",
          }}
        >
          {title}
        </h2>
        {aside && <span style={{ fontSize: "var(--fs-105)", color: "var(--ink-3)" }}>{aside}</span>}
      </div>
      <div style={{ maxWidth: "72ch" }}>{children}</div>
    </section>
  );
}

// ── Page wrapper: the ONE outer frame (max-width + responsive side padding)
// shared by header/timeline/index/layout, so a detail surface never re-declares its own copy of the
// --cl-detail-pad-x breakpoint (globals.css, lane MOBILE-2 precedent). One instance per page.

export function DetailPageWrapper({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 var(--cl-detail-pad-x) 40px" }}>{children}</div>;
}

// ── Layout: content column + rail (no padding/max-width of its own — lives inside DetailPageWrapper) ──

export function DetailLayout({ children, rail }: { children: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div
      className="cl-detail-layout"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 300px",
        gap: 24,
        alignItems: "start",
      }}
    >
      <style>{`
        @media (max-width: 1280px) {
          .cl-detail-layout { grid-template-columns: minmax(0,1fr) !important; }
        }
      `}</style>
      <div style={{ minWidth: 0 }}>{children}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>{rail}</div>
    </div>
  );
}

// ── Rail: "At a glance" key/value card ──────────────────────────────────
//
// Extension (lane uidetails2, 2026-09-07): the first rail card on every
// 05/07/09 artboard — band/type/jurisdiction/topic/source/published/
// re-check date as plain label:value rows. Generic so each surface
// supplies its own real rows (never a fabricated field — a row a surface
// has no data for is simply omitted by its caller, matching the rest of
// this architecture's Absence convention).

export interface AtAGlanceRow {
  label: string;
  value: React.ReactNode;
}

export function AtAGlanceCard({ rows }: { rows: AtAGlanceRow[] }) {
  const present = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== "");
  if (present.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div style={{ padding: "14px 16px" }}>
      <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 10px" }}>
        At a glance
      </p>
      {/* dc.html #p3 "At a glance" card: grid-template-columns:96px 1fr;gap:7px 12px (row-gap 7,
          column-gap 12) — a fixed label column, not `auto`. */}
      <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: "7px 12px", fontSize: "var(--fs-12)" }}>
        {present.map((r, i) => (
          <>
            <span key={`${i}-k`} style={{ color: "var(--ink-3)", fontWeight: 600 }}>
              {r.label}
            </span>
            <span key={`${i}-v`} style={{ color: "var(--ink)", fontWeight: 600, overflowWrap: "anywhere" }}>
              {r.value}
            </span>
          </>
        ))}
      </div>
      </div>
    </div>
  );
}

// ── Rail: legend card (Impact / Timeline / Source tier) ─────────────────
//
// Extension (lane uidetails2, 2026-09-07): static legend text repeated
// verbatim on every 05/07/09 artboard's rail. One shared copy rather than
// three page-local strings (CLAUDE.md rule 13, no duplication).

export function RailLegend() {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div style={{ padding: "14px 16px" }}>
      <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 10px" }}>
        Legend
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "var(--fs-11)", color: "var(--ink-2)", lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}>
          <strong style={{ color: "var(--ink)" }}>Impact</strong> — four scored dimensions, sorted low to
          high: green left, red right. Height is the score, 1-3; the number is the sum, /12.
        </p>
        <p style={{ margin: 0 }}>
          <strong style={{ color: "var(--ink)" }}>Timeline</strong> — passed · next · ahead.
        </p>
        <p style={{ margin: 0 }}>
          <strong style={{ color: "var(--ink)" }}>Source tier</strong> — T1 binding law through T6
          commentary.
        </p>
      </div>
      </div>
    </div>
  );
}

// ── Rail: full impact meter card ────────────────────────────────────────

export function ImpactRailCard({ scores }: { scores?: ImpactScores | null }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <SectionRule />
      <div style={{ padding: "14px 16px" }}>
      <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 12px" }}>
        Impact assessment
      </p>
      <ImpactMeter scores={scores} variant="full" />
      </div>
    </div>
  );
}

// ── Rail: "In this list · N of M" ────────────────────────────────────────
//
// AlphaSense behaviour (README §0.5): opening an item from a list keeps
// the reader's place. The list-position contract IS now documented — the
// lists lane's `withListPosition` (src/components/list-surface/
// list-surface-helpers.ts, lane uilists-2026-09-06, logged in that lane's
// own DEVIATION-LOG.md entry) appends `?list=<surface>&pos=<n>&of=<m>` to
// every row href. Lane uidetails2 (2026-09-07) reads all three params —
// `pos`/`of` for the "N of M" line (this shell already read those as a
// provisional contract; now confirmed against the shipped one) and `list`
// so a caller can label which filtered set the position was computed
// against (see DEVIATION-LOG.md's list-position row for this lane's own
// entry recording the regulation detail's adoption of the same contract).
// Reading searchParams is a Dynamic API under classical rendering
// (PERF-10, this repo's own precedent — see RegulationsLedger.tsx's
// SearchParamsFilterBridge), so this is resolved CLIENT-SIDE inside a
// small Suspense-wrapped bridge, never on the server page, so the four
// detail routes' static generation (generateStaticParams) is unaffected.

function InThisListBridge({
  onParams,
}: {
  onParams: (pos: string | null, of: string | null, list: string | null) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    onParams(searchParams.get("pos"), searchParams.get("of"), searchParams.get("list"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

// FOLD-56 (F7): reads the same `prev`/`next` slugs `withListPosition`'s row href now carries
// (list-surface-helpers.ts), alongside pos/of/list. A second bridge rather than widening
// InThisListBridge above — InThisListBridge's existing callers (BreadcrumbListPosition) have no
// use for neighbour slugs, so this keeps that read minimal and additive.
function InThisListNeighborsBridge({
  onParams,
}: {
  onParams: (prev: string | null, next: string | null) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    onParams(searchParams.get("prev"), searchParams.get("next"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

// ── Header: breadcrumb's last segment ("1 of 9 in Action") ──────────────
//
// GAP G2 (2026-09-07): this segment now renders inside `DetailMastheadBreadcrumb`
// above (the Masthead's own VOL/breadcrumb line, ruling R4) rather than inside
// DetailHeader's meta line — DetailHeader no longer has a meta line at all
// (see its own doc comment). The prior `BreadcrumbListPosition` component
// that rendered it there was removed as dead code once its only caller was
// removed (CLAUDE.md rule 13); `InThisListBridge` (the shared pos/of/list
// reader) is unchanged and still feeds `InThisListStat` below.

export function InThisListStat({
  backHref,
  backLabel,
  band,
}: {
  backHref: string;
  backLabel: string;
  /**
   * Mobile 390 build, lane mobdetail (2026-09-07, spec "RAIL": place-keeping
   * card reads "In this list, 4 of 13 in Action"). Optional so a caller
   * that has not passed a band keeps this card's pre-existing wording
   * (Absence-by-omission, same convention the rest of this file uses).
   */
  band?: UrgencyBand;
}) {
  const [params, setParams] = useState<{ pos: string | null; of: string | null; list: string | null } | null>(null);
  const [neighbors, setNeighbors] = useState<{ prev: string | null; next: string | null } | null>(null);
  const pathname = usePathname();

  const pos = params?.pos ? Number(params.pos) : null;
  const of = params?.of ? Number(params.of) : null;
  const known = pos != null && of != null && Number.isFinite(pos) && Number.isFinite(of);

  // FOLD-56 (F7): reconstruct each neighbour's own detail href from what this page already knows
  // (its own `list`/`of`, pos-1/pos+1) plus the neighbour's slug — the row href only ever carried
  // the bare slug (bounded, no second list/pos/of per neighbour; see list-surface-helpers.ts). The
  // neighbour's own path is this page's own pathname with its last segment (the current slug)
  // swapped for the neighbour's.
  const basePath = pathname ? pathname.replace(/\/[^/]*$/, "") : null;
  const prevHref =
    known && basePath && neighbors?.prev
      ? withListPosition(`${basePath}/${encodeURIComponent(neighbors.prev)}`, params?.list ?? "", (pos as number) - 1, of as number)
      : null;
  const nextHref =
    known && basePath && neighbors?.next
      ? withListPosition(`${basePath}/${encodeURIComponent(neighbors.next)}`, params?.list ?? "", (pos as number) + 1, of as number)
      : null;

  return (
    <div
      style={{
        position: "relative",
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
        padding: "14px 16px",
      }}
    >
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <SectionRule />
      </div>
      <Suspense fallback={null}>
        <InThisListBridge onParams={(p, o, l) => setParams({ pos: p, of: o, list: l })} />
      </Suspense>
      <Suspense fallback={null}>
        <InThisListNeighborsBridge onParams={(p, n) => setNeighbors({ prev: p, next: n })} />
      </Suspense>
      <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>
        In this list{params?.list ? ` · ${params.list}` : ""}
      </p>
      <p style={{ fontSize: "var(--fs-13)", color: "var(--ink)", margin: "0 0 8px" }}>
        {known ? `${pos} of ${of}${band ? ` in ${band.label}` : ""}` : <Absence reason="not in primary source" />}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Link
          href={backHref}
          prefetch={false}
          style={{
            fontSize: "var(--fs-11)",
            fontWeight: 700,
            color: "var(--ink)",
            textDecoration: "underline",
            textDecorationColor: "var(--link-line)",
            minHeight: 24,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {backLabel}
        </Link>
        {/* Mobile 390 spec "SECTION INDEX AND RAIL": prev/next links, 12px/600. Omitted (not
            rendered) when there is no such neighbour — first row has no prev, last has no next. */}
        {(prevHref || nextHref) && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            {prevHref && (
              <Link href={prevHref} prefetch={false} style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", minHeight: 24, display: "inline-flex", alignItems: "center" }}>
                {"‹ prev"}
              </Link>
            )}
            {nextHref && (
              <Link href={nextHref} prefetch={false} style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", minHeight: 24, display: "inline-flex", alignItems: "center" }}>
                {"next ›"}
              </Link>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
