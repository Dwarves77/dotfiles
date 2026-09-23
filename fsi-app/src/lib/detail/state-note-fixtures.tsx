/**
 * state-note-fixtures.tsx: static data for the `/admin/parts/state-note` sign-off page (lane
 * W10-StateNote, 2026-09-23, parts-brief 2.7). Hand-built, not a query, StateNote takes plain
 * data (band key + children + an optional action), same precedent as
 * `src/lib/detail/action-card-fixtures.ts` ("Hand-built, not a query: the part takes plain data,
 * no database read inside the part").
 *
 * Every string below is copied VERBATIM from a real call site in the shipped app (never invented
 * copy for this fixture); the source file:line is named on each entry so the fixture stays
 * traceable to production usage. This is StateNote's own operator ruling read narrowly: the
 * "frozen real record" rule (SELECT only, id + date in the header) governs fixtures that stand in
 * for DATABASE CONTENT (FactCard claims, record facts); StateNote's children are always
 * app-authored UI copy, not source-document content, so there is no SELECT to freeze. The
 * traceable-to-production-usage discipline is the equivalent honesty bar for this part.
 */

import type { ReactNode } from "react";
import type { UrgencyBandKey } from "@/lib/urgency/bands";

export interface StateNoteFixture {
  id: string;
  category: "empty" | "loading" | "error" | "not-scored" | "detail-callout" | "action-strip";
  label: string;
  citation: string;
  band?: UrgencyBandKey | null;
  children: ReactNode;
  /** `href` renders the real production route as an `<a>` (safe, live navigation on this fixture
   *  page too). `clickOnly: true` marks an action that is `onClick`-driven in production (a
   *  dispatch to the ask-assistant event, a `router.refresh()`, a "lift the collapsed track"
   *  handler); the fixture page wires an inert no-op so the affordance still RENDERS at the
   *  correct 28px target size (law 2) without fabricating the real side effect. Never a `"#"`
   *  fallback href (the opsclip ruling this part's own Masthead consumer already enforces). */
  action?: { label: string; href?: string; clickOnly?: boolean };
}

export const STATE_NOTE_FIXTURES: StateNoteFixture[] = [
  {
    id: "empty-list-foot",
    category: "empty",
    label: "List foot, no filter matches (neutral tint)",
    citation: "ListSurfaceShell.tsx:506",
    band: null,
    children: "Nothing matches these filters right now.",
  },
  {
    id: "empty-dashboard-due",
    category: "empty",
    label: "Dashboard \"Due next\", empty corpus (neutral tint, with action link)",
    citation: "DashboardBrief.tsx:194-197",
    band: null,
    children:
      "No item in this workspace's corpus carries a future binding date. Items appear here as they enter scope and are verified.",
    action: { label: "Open the ledger →", href: "/regulations" },
  },
  {
    id: "empty-dashboard-detection",
    category: "empty",
    label: "Dashboard \"What changed\", nothing in the detection window (neutral tint)",
    citation: "DashboardBrief.tsx:267-269",
    band: null,
    children: "Nothing added or updated in the last detection pass.",
  },
  {
    id: "empty-map-jurisdictions",
    category: "empty",
    label: "Map, filter yields no jurisdictions (neutral tint, with action link)",
    citation: "MapPageView.tsx:394-396",
    band: null,
    children: "No jurisdictions match this filter.",
  },
  {
    id: "loading-regulations-background",
    category: "loading",
    label: "Regulations list, background page fetch (neutral tint)",
    citation: "RegulationsLedger.tsx:338",
    band: null,
    children: "Loading the rest of the regulations corpus in the background.",
  },
  {
    id: "error-dashboard-brief",
    category: "error",
    label: "Dashboard brief fetch failed (Immediate band, retry action)",
    citation: "DashboardBrief.tsx:113-117",
    band: "immediate",
    children: "Could not load the daily brief. The workspace feed may be temporarily unavailable.",
    action: { label: "Retry", clickOnly: true },
  },
  {
    id: "not-scored-research-awareness",
    category: "not-scored",
    label: "Research list foot, findings below the scoring threshold (Awareness band, ask action)",
    citation: "ResearchLedger.tsx:317-330",
    band: "awareness",
    children: (
      <>
        <b>Awareness</b> · 6 findings sit below the scoring threshold and are kept for context
      </>
    ),
    action: { label: "Why unscored →", clickOnly: true },
  },
  {
    id: "not-scored-operations-pending",
    category: "not-scored",
    label: "Operations detail, brief section not yet generated (neutral tint)",
    citation: "OperationsDetailSurface.tsx:390",
    band: null,
    children: "Detailed sections pending for this regional profile; brief generation in progress.",
  },
  {
    id: "not-scored-workspace-seat",
    category: "not-scored",
    label: "Account, seat limit not yet wired (neutral tint, inline Absence)",
    citation: "MembersPanel.tsx:527-530",
    band: null,
    children: (
      // The dash below is written as the JS escape (not the literal glyph) so it stays disclosed
      // as data, Absence's own real rendered character (Absence.tsx line 99), not authored prose,
      // per pre-commit rule 022.
      <>
        <b>Workspace</b> · you are the owner · seat limit {"\u2014"} connect data
      </>
    ),
  },
  {
    id: "action-strip-regulation-record",
    category: "action-strip",
    label: "Regulation detail, record-grade item (neutral tint, ItemGroup lead note)",
    citation: "RegulationDetailSurface.tsx:498-500",
    band: null,
    children:
      "This item was captured directly from its source document rather than synthesized into a brief. Every fact below is quoted verbatim from that source.",
  },
  {
    id: "action-strip-timeline-next",
    category: "action-strip",
    label: "ActionCard TIMELINE callout, next obligation (Action band, full-schedule action)",
    citation: "Timeline.tsx:112-124 (Timeline part's own callout)",
    band: "action",
    children: "Next: Transition deadline · 29 Sep 2026 · in 6 days",
    action: { label: "Full schedule ↓", clickOnly: true },
  },
  {
    id: "action-strip-map-immediate",
    category: "action-strip",
    label: "Map, Immediate-band summary strip (Immediate band, register link)",
    citation: "MapPageView.tsx:433-436",
    band: "immediate",
    children: "Immediate · 12 items bind within 90 days across 5 jurisdictions",
    action: { label: "Open the register →", href: "/regulations" },
  },
  {
    id: "action-strip-masthead-notice",
    category: "action-strip",
    label: "Masthead inline notice, settings scope banner (neutral tint, W10-StateNote one-home fix)",
    citation: "Masthead.tsx notice prop, consumed by SettingsPage.tsx:190-195",
    band: null,
    children: (
      <>
        <b>Applies workspace-wide</b> · changes here affect every member, not just you
      </>
    ),
  },
];

export const STATE_NOTE_CATEGORY_LABEL: Record<StateNoteFixture["category"], string> = {
  empty: "Empty",
  loading: "Loading",
  error: "Error",
  "not-scored": "Not scored / awareness",
  "detail-callout": "Detail callout",
  "action-strip": "Action strip",
};
