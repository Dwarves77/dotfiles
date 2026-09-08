"use client";

/**
 * CardFoot — the foot strip at the bottom of a section card (UI system
 * handoff 2026-09-06): one muted line left, one right, on the page-tint
 * ground, separated from the rows by the header-weight divider.
 *
 * PROMOTED to the shared layer by lane comp-11 (2026-09-08), same reason as
 * `SectionHeading`: it was page-local inside `DashboardBrief.tsx`, and
 * artboard 11 (id="p11") carries the identical strip at the foot of its
 * Watched card ("Watch from any row's ⋯ menu or the Watch button on a detail
 * page." / "Browse regulations →"). One definition, both callers.
 *
 * VALUES, read off the artboard markup (dc.html p1 line 348 and p11 line 111,
 * which are byte-identical):
 *   display flex · justify space-between · align-items center · gap 12
 *   padding 10px 16px · border-top 1px solid rgba(0,0,0,.08) (--line-2)
 *   background #FAFAF8 (--page) · font-size 12px · muted text
 *
 * Three of those (the #FAFAF8 ground, the 12px size, centre alignment) were
 * absent from the page-local version this replaces; the artboards state all
 * three, so they are corrected here rather than carried forward.
 *
 * Either side may be a link: the artboards put the link left on the dashboard
 * ("All 14 immediate →") and right on the watchlist ("Browse regulations →"),
 * so this component takes two arbitrary nodes and imposes no role on either.
 *
 * DEFECT 5, lane opsclip (train 61, 2026-09-08). The two band-footer expanders
 * on the dashboard disagreed with each other on production: "All 14 immediate"
 * was a real anchor and "All 500 changes in the last 7 days" was a bare
 * <span>, `closest('a') === false`, `cursor: auto`, i.e. not a control at
 * all, while the artboard draws BOTH as links. The root cause was that the
 * link treatment lived at ONE call site inside DashboardBrief rather than
 * here, so the second foot could be written without it and nothing noticed.
 * `leftHref`/`rightHref` move that treatment into the shared part: a caller
 * that names a target gets the anchor, its law-2 padding and its underline,
 * identically on both sides, and cannot half-build one.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export interface CardFootProps {
  left: ReactNode;
  right: ReactNode;
  /** Navigation target for the left label. Additive: undefined renders the
   *  label as plain text, exactly as before. */
  leftHref?: string;
  /** Navigation target for the right label. Additive, same contract. */
  rightHref?: string;
}

/** The foot-strip link treatment, one definition for both sides. Law-2's 24px
 *  floor is met with real padding rather than a negative-margin hit area,
 *  because the surrounding Card clips overflow and would clip the hit area
 *  with it; the few extra px of footer height are logged in DEVIATION-LOG.md. */
function FootLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        color: "inherit",
        textDecoration: "underline",
        textUnderlineOffset: 2,
        display: "inline-block",
        padding: "8px 0",
      }}
    >
      {children}
    </Link>
  );
}

export function CardFoot({ left, right, leftHref, rightHref }: CardFootProps) {
  return (
    <div
      className="cl-card-foot"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        borderTop: "1px solid var(--line-2)",
        background: "var(--page)",
        fontSize: "var(--fs-12)",
        color: "var(--ink-3)",
      }}
    >
      <span>{leftHref ? <FootLink href={leftHref}>{left}</FootLink> : left}</span>
      <span style={{ whiteSpace: "nowrap" }}>{rightHref ? <FootLink href={rightHref}>{right}</FootLink> : right}</span>
    </div>
  );
}
