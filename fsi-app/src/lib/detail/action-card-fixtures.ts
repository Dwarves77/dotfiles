/**
 * action-card-fixtures: static data for the `/admin/parts/action-card` sign-off page (lane
 * W10-ActionCard-a, 2026-09-21, brief step 6). Hand-built, not a query: the ActionCard part takes
 * plain data (no database read, no fetch inside the part).
 *
 * The default fixture is the review's own worked example, verbatim: 7 milestones, 3 passed, next
 * "Transition deadline" 2026-09-29; meta "4 sources . T1 primary . regenerated Sep 18". The other
 * fixtures are the brief's named edge cases: no tags, an absent EXPOSURE cell, 9 milestones
 * (collapse), 1 milestone, all passed.
 */

import type { TimelineEntry } from "@/types/resource";
import { band } from "@/lib/urgency/bands";

export interface ActionCardFixture {
  id: string;
  title: string;
  note: string;
  band: ReturnType<typeof band>;
  kindLabel: string;
  tier: number;
  meta: string;
  tags: string[] | null;
  where: { value: string | null };
  whoPays: { value: string | null };
  yourLanes: { value: string | null };
  timeline: TimelineEntry[];
}

const DEFAULT_TIMELINE: TimelineEntry[] = [
  { date: "2023-06-05", label: "Directive entered into force", status: "past" },
  { date: "2023-12-31", label: "Member State transposition deadline", status: "past" },
  { date: "2024-01-01", label: "Maritime extension operative", status: "past" },
  { date: "2026-09-29", label: "Transition deadline", status: "current" },
  { date: "2027-01-01", label: "Offshore ships added to scope", status: "future" },
  { date: "2027-03-31", label: "MRV submission for 2026 reporting year", status: "future" },
  { date: "2027-09-30", label: "Surrender: 100% of 2026 reported emissions", status: "future" },
];

const NINE_MILESTONE_TIMELINE: TimelineEntry[] = [
  { date: "2023-01-01", label: "Milestone one", status: "past" },
  { date: "2023-06-01", label: "Milestone two", status: "past" },
  { date: "2023-12-01", label: "Milestone three", status: "past" },
  { date: "2024-06-01", label: "Milestone four", status: "past" },
  { date: "2026-09-29", label: "Transition deadline", status: "current" },
  { date: "2027-01-01", label: "Milestone six", status: "future" },
  { date: "2027-06-01", label: "Milestone seven", status: "future" },
  { date: "2027-12-01", label: "Milestone eight", status: "future" },
  { date: "2028-06-01", label: "Milestone nine", status: "future" },
];

const ALL_PASSED_TIMELINE: TimelineEntry[] = [
  { date: "1997-01-21", label: "Belgian measures notified", status: "past" },
  { date: "1999-09-15", label: "Decision adopted", status: "past" },
];

export const ACTION_CARD_FIXTURES: ActionCardFixture[] = [
  {
    id: "default",
    title: "Default, the review's own worked example",
    note: "7 milestones . 3 passed . next “Transition deadline” 2026-09-29; meta “4 sources . T1 primary . regenerated Sep 18”.",
    band: band("action"),
    kindLabel: "Regulation",
    tier: 1,
    meta: "4 sources · T1 primary · regenerated Sep 18",
    tags: ["High-value cargo", "Ocean"],
    where: { value: "Ocean freight · European EEA port call, feeder leg or transhipment" },
    whoPays: { value: "Vessel operator is obligated; forwarders and shippers receive it as carrier ETS" },
    yourLanes: { value: "Connect shipment data" },
    timeline: DEFAULT_TIMELINE,
  },
  {
    id: "no-tags",
    title: "No tags: the pill row carries no “workspace tags” label at all",
    note: "review item 1a",
    band: band("immediate"),
    kindLabel: "Directive",
    tier: 2,
    meta: "2 sources · T2 primary · regenerated Sep 12",
    tags: null,
    where: { value: "Belgium · packaging placed on the Belgian market" },
    whoPays: { value: "Economic operators, fillers and importers, directly or via an agreed body" },
    yourLanes: { value: "Connect shipment data" },
    timeline: ALL_PASSED_TIMELINE,
  },
  {
    id: "absent-exposure-cell",
    title: "An absent EXPOSURE cell: WHO PAYS renders the Absence convention",
    note: "review item 2, absence is the small-caps reason, never caps body text",
    band: band("monitor"),
    kindLabel: "Standard",
    tier: 3,
    meta: "1 source · T3 primary · regenerated Sep 4",
    tags: ["Fine art"],
    where: { value: "Global · cross-border art logistics" },
    whoPays: { value: null },
    yourLanes: { value: "Connect shipment data" },
    timeline: DEFAULT_TIMELINE.slice(0, 3),
  },
  {
    id: "nine-milestones",
    title: "9 milestones: collapses to the next-three plus “+N”",
    note: "review item 3",
    band: band("action"),
    kindLabel: "Regulation",
    tier: 1,
    meta: "9 sources · T1 primary · regenerated Sep 20",
    tags: ["Ocean", "Emissions"],
    where: { value: "Ocean freight · European EEA port call" },
    whoPays: { value: "Vessel operator" },
    yourLanes: { value: "Connect shipment data" },
    timeline: NINE_MILESTONE_TIMELINE,
  },
  {
    id: "one-milestone",
    title: "1 milestone: no collapse, track and callout still draw correctly",
    note: "review item 3, “two milestones still draw the track and both dates” (21b), extended to one",
    band: band("awareness"),
    kindLabel: "Guidance",
    tier: 4,
    meta: "1 source · T4 primary · regenerated Aug 30",
    tags: [],
    where: { value: "European Union" },
    whoPays: { value: "Not obligated directly" },
    yourLanes: { value: "Connect shipment data" },
    timeline: [{ date: "2027-06-30", label: "Guidance review date", status: "future" }],
  },
  {
    id: "all-passed",
    title: "All milestones passed: no “next”, callout reads “last milestone passed”",
    note: "artboard 21b's own Belgium example",
    band: band("awareness"),
    kindLabel: "Decision",
    tier: 1,
    meta: "1 source · T1 primary · brief regenerated Sep 12",
    tags: null,
    where: { value: "Belgium · packaging placed on the Belgian market, including packaging filled abroad" },
    whoPays: { value: "Economic operators, fillers and importers, directly or via an agreed body" },
    yourLanes: { value: "Connect shipment data" },
    timeline: ALL_PASSED_TIMELINE,
  },
];
