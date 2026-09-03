/**
 * SurfacePulseCard — the shared shell for the Dashboard's five-surface rebalance
 * (Lane DASH, 2026-09-02; docs/specs/00-foundation-the-spine.md "five lenses on one spine";
 * docs/specs/07-page-walkthrough.md "HOW THE FIVE FIT TOGETHER").
 *
 * The register this lane started from: the home page was Regulations-only with one thin rail
 * widget (DashboardSurfaceCoverage — a count + link per surface) standing in for the other four
 * lenses. This component is the shared presentation for the four NEW first-class blocks
 * (MarketIntelPulse, ResearchPulse, OperationsPulse, CommunityPulse) added alongside it: each is
 * fed by its own live read (see each file's header for its data path), never a placeholder, and
 * each renders a real "N of TOTAL" count plus up to 3 real items with real priority/context, or the
 * honest-state frame (spec 00 §4) when its surface has nothing yet.
 *
 * Regulations is deliberately NOT given a fifth card here: HomeSurface's "This week" section (top
 * priority list + by-owner) already gives Regulations first-class, real-data treatment above this
 * section, and a fifth card would only re-slice the same capped dashboard row payload already
 * shown — no new signal, and duplicating an existing module is the thing the lane brief rules out.
 * See HomeSurface.tsx's SectionHeading for "Across your five surfaces" for the full placement note.
 *
 * Reuses DashboardRailCard / RailEmptyFrame (src/components/home/DashboardRailCard.tsx) rather than
 * inventing a second card shell — same titled-card chrome and honest-empty-state language the
 * existing Watchlist / By-owner rail cards use, so the five-surface grid reads as one system with
 * the rail beside it, not a competing visual language.
 */

import Link from "next/link";
import { DashboardRailCard, RailEmptyFrame } from "@/components/home/DashboardRailCard";

export interface SurfacePulseItem {
  id: string;
  href: string;
  title: string;
  /** Renders a priority-hued left rule when present; omitted (not defaulted) when the surface has
   *  no priority band of its own (e.g. Community threads, which are not intelligence_items rows). */
  priority?: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  /** One line of real, already-formatted context (source · date · price, etc.) — never fabricated;
   *  callers omit a piece rather than inventing a placeholder for it. */
  meta: string;
}

const PRIORITY_COLOR: Record<NonNullable<SurfacePulseItem["priority"]>, string> = {
  CRITICAL: "var(--reg-band-immediate)",
  HIGH: "var(--reg-band-action)",
  MODERATE: "var(--reg-band-monitor)",
  LOW: "var(--reg-band-awareness)",
};

export interface SurfacePulseCardProps {
  title: string;
  titleHref: string;
  /** e.g. "3 of 38" — real counts only; omitted count renders no badge rather than a fabricated one. */
  countLabel?: string;
  items: SurfacePulseItem[];
  emptyBody: string;
  emptyCtaLabel: string;
  emptyCtaHref: string;
}

export function SurfacePulseCard({
  title,
  titleHref,
  countLabel,
  items,
  emptyBody,
  emptyCtaLabel,
  emptyCtaHref,
}: SurfacePulseCardProps) {
  if (items.length === 0) {
    return (
      <DashboardRailCard title={title} titleHref={titleHref}>
        <RailEmptyFrame body={emptyBody} cta={{ label: emptyCtaLabel, href: emptyCtaHref }} />
      </DashboardRailCard>
    );
  }

  return (
    <DashboardRailCard title={title} titleHref={titleHref} count={countLabel}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={it.href}
              prefetch={false}
              style={{ display: "flex", gap: 9, textDecoration: "none", color: "inherit" }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 3,
                  borderRadius: 2,
                  alignSelf: "stretch",
                  flexShrink: 0,
                  background: it.priority ? PRIORITY_COLOR[it.priority] : "var(--color-border)",
                }}
              />
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    margin: 0,
                    lineHeight: 1.35,
                    overflowWrap: "anywhere",
                  }}
                >
                  {it.title}
                </p>
                {it.meta && (
                  <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "2px 0 0" }}>{it.meta}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardRailCard>
  );
}
