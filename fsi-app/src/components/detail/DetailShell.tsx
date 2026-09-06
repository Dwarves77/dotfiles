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
 *   Header (band pill + tier + title + meta) -> full MilestoneTimeline
 *   with the next obligation as the callout -> StateNote -> sticky section
 *   index (S1 . S2 . S3 ...) -> sections of FactCards at <=72ch -> rail.
 *   Section names vary by surface; the shape, rail and index never do.
 *   No tabs, no per-tab ask bar, no "Complete brief" toggle.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BandChip, TierChip } from "@/components/ui/Chips";
import { MilestoneTimeline } from "@/components/ui/MilestoneTimeline";
import { StateNote } from "@/components/ui/StateNote";
import { ImpactMeter } from "@/components/ui/ImpactMeter";
import { Absence } from "@/components/ui/Absence";
import type { UrgencyBand } from "@/lib/urgency/bands";
import type { ImpactScores, TimelineEntry } from "@/types/resource";

// ── Header ──────────────────────────────────────────────────────────────

export interface DetailHeaderProps {
  band: UrgencyBand;
  tier?: number | null;
  title: string;
  /** Breadcrumb-style meta line, e.g. "Regulations · European Union". */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

export function DetailHeader({ band, tier, title, meta, actions }: DetailHeaderProps) {
  return (
    <header
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: "18px 24px 20px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          {meta && (
            <p style={{ fontSize: "var(--fs-11)", color: "var(--ink-2)", margin: "0 0 8px", overflowWrap: "anywhere" }}>
              {meta}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <BandChip band={band} />
            {typeof tier === "number" && <TierChip tier={tier} />}
          </div>
          <h1
            data-guard-title
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              fontSize: 28,
              lineHeight: 1.12,
              color: "var(--ink)",
              margin: 0,
              overflowWrap: "break-word",
            }}
          >
            {title}
          </h1>
        </div>
        {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>{actions}</div>}
      </div>
    </header>
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
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: "16px 20px",
        marginBottom: 16,
      }}
    >
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
        </>
      )}
      {next && (
        <div style={{ marginTop: 14 }}>
          <StateNote band={band}>
            Next: {next.label} · {next.date}
          </StateNote>
        </div>
      )}
    </div>
  );
}

// ── Sticky section index (S1 . S2 . S3 …) ──────────────────────────────

export interface SectionIndexEntry {
  id: string;
  label: string;
}

export function SectionIndex({ sections }: { sections: SectionIndexEntry[] }) {
  if (sections.length === 0) return null;
  return (
    <nav
      aria-label="Section index"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--page)",
        borderBottom: "1px solid var(--line-2)",
        padding: "10px 0",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 10,
        overflowX: "auto",
        whiteSpace: "nowrap",
      }}
    >
      {sections.map((s, i) => (
        <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {i > 0 && <span style={{ color: "var(--ink-3)" }} aria-hidden="true">·</span>}
          <a
            href={`#${s.id}`}
            style={{
              fontSize: "var(--fs-105)",
              fontWeight: 700,
              color: "var(--ink-2)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              padding: "0 2px",
            }}
          >
            S{i + 1} · {s.label}
          </a>
        </span>
      ))}
    </nav>
  );
}

// ── Sections of fact cards, <=72ch ──────────────────────────────────────

export function DetailSection({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      id={id}
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: "16px 20px",
        marginBottom: 16,
        scrollMarginTop: 56,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            fontSize: 16,
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

// ── Layout: content column + rail ───────────────────────────────────────

export function DetailLayout({ children, rail }: { children: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div
      className="cl-detail-layout"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 300px",
        gap: 24,
        alignItems: "start",
        maxWidth: 1440,
        margin: "0 auto",
        padding: "0 40px 40px",
      }}
    >
      <style>{`
        @media (max-width: 1280px) {
          .cl-detail-layout { grid-template-columns: minmax(0,1fr) !important; }
        }
      `}</style>
      <div style={{ minWidth: 0 }}>{children}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{rail}</div>
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
        padding: "14px 16px",
      }}
    >
      <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 12px" }}>
        Impact assessment
      </p>
      <ImpactMeter scores={scores} variant="full" />
    </div>
  );
}

// ── Rail: "In this list · N of M" ────────────────────────────────────────
//
// AlphaSense behaviour (README §0.5): opening an item from a list keeps
// the reader's place. The list-position contract (which URL params carry
// it) is not yet documented by the lists lane in DEVIATION-LOG as of this
// lane's build (2026-09-06) — this reads `pos`/`of` as the provisional
// contract and logs it there (see DEVIATION-LOG.md). Reading searchParams
// is a Dynamic API under classical rendering (PERF-10, this repo's own
// precedent — see RegulationsLedger.tsx's SearchParamsFilterBridge), so
// this is resolved CLIENT-SIDE inside a small Suspense-wrapped bridge,
// never on the server page, so the four detail routes' static generation
// (generateStaticParams) is unaffected.

function InThisListBridge({ onParams }: { onParams: (pos: string | null, of: string | null) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    onParams(searchParams.get("pos"), searchParams.get("of"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  return null;
}

export function InThisListStat({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  const [params, setParams] = useState<{ pos: string | null; of: string | null } | null>(null);

  const pos = params?.pos ? Number(params.pos) : null;
  const of = params?.of ? Number(params.of) : null;
  const known = pos != null && of != null && Number.isFinite(pos) && Number.isFinite(of);

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: "14px 16px",
      }}
    >
      <Suspense fallback={null}>
        <InThisListBridge onParams={(p, o) => setParams({ pos: p, of: o })} />
      </Suspense>
      <p style={{ fontSize: "var(--fs-105)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", margin: "0 0 8px" }}>
        In this list
      </p>
      <p style={{ fontSize: "var(--fs-13)", color: "var(--ink)", margin: "0 0 8px" }}>
        {known ? `${pos} of ${of}` : <Absence reason="not in primary source" />}
      </p>
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
    </div>
  );
}
