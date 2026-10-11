import type { ImpactScores, TimelineEntry } from "@/types/resource";
import { bandFromPriority, type UrgencyBand } from "@/lib/urgency/bands";

interface ListRowFixtureRow {
  id: string;
  band: UrgencyBand;
  jurisdiction: string;
  title: string;
  meta: string;
  impact: ImpactScores | null;
  impactTotal: number | "unscored";
  due: { label: string; days: string } | null;
  timeline: TimelineEntry[];
  tier: number | null;
  itemGrade?: "record" | "brief";
}

// intelligence_items.id = 42b8bfee-92ea-4cde-bfe9-a25eb7cb49d9, priority HIGH, jurisdictions ["US"],
// effective_tier 1. N = 8 (2,2,2,2).
const CALIFORNIA_SB253: ListRowFixtureRow = {
  id: "42b8bfee-92ea-4cde-bfe9-a25eb7cb49d9",
  band: bandFromPriority("HIGH"),
  jurisdiction: "US",
  title: "California SB 253 — Climate Corporate Data Accountability Act",  // glyph:verbatim
  meta: "regulation · disclosure",
  impact: { cost: 2, compliance: 2, client: 2, operational: 2 },
  impactTotal: 8,
  due: { label: "Jan 1 2026", days: "0 days" },
  timeline: [
    { date: "2023-10-07", label: "SB 253 chaptered and effective", status: "past" },
    { date: "2025-01-01", label: "CARB implementing-regulations adoption deadline", status: "past" },
    { date: "2026-01-01", label: "2026 — Scope 1 and scope 2 first public disclosure (exact date set by CARB)", status: "current" },  // glyph:verbatim
  ],
  tier: 1,
  itemGrade: "brief",
};

// intelligence_items.id = 40c05a1e-f834-4a14-b2dd-a16707df703c, priority LOW, jurisdictions [],
// effective_tier 1. N = 12 (3,3,3,3).
const WEIGHTS_AND_DIMENSIONS: ListRowFixtureRow = {
  id: "40c05a1e-f834-4a14-b2dd-a16707df703c",
  band: bandFromPriority("LOW"),
  jurisdiction: "EU",
  title: "Revision of the Weights and Dimensions Directive (96/53/EC) — zero-emission HGV weight allowances",  // glyph:verbatim
  meta: "regulation · road",
  impact: { cost: 3, compliance: 3, client: 3, operational: 3 },
  impactTotal: 12,
  due: { label: "Dec 9 2025", days: "0 days" },
  timeline: [
    { date: "1996-07-25", label: "Council Directive 96/53/EC enters into force", status: "past" },
    { date: "2019-01-01", label: "2019 — Regulation (EU) 2019/1242 introduces ZEV measures", status: "past" },  // glyph:verbatim
    { date: "2025-12-09", label: "Trilogue negotiations begin", status: "current" },
  ],
  tier: 1,
  itemGrade: "brief",
};

// intelligence_items.id = 4547e8c5-a43f-4fb7-ac37-2b9547fb4a35, priority LOW, jurisdictions ["EU"],
// effective_tier 1. N = 4 (1,1,1,1).
const EU_TAXONOMY: ListRowFixtureRow = {
  id: "4547e8c5-a43f-4fb7-ac37-2b9547fb4a35",
  band: bandFromPriority("LOW"),
  jurisdiction: "EU",
  title: "EU Taxonomy",
  meta: "regulation · reporting",
  impact: { cost: 1, compliance: 1, client: 1, operational: 1 },
  impactTotal: 4,
  due: null,
  timeline: [],
  tier: 1,
  itemGrade: "brief",
};

// intelligence_items.id = 3e756291-f79e-487e-84d5-efc535cfef27, priority LOW, jurisdictions ["CN"],
// effective_tier 2. Unscored: impact omitted entirely (the meter's own dashed-outline state).
const CHINA_ETS: ListRowFixtureRow = {
  id: "3e756291-f79e-487e-84d5-efc535cfef27",
  band: bandFromPriority("LOW"),
  jurisdiction: "CN",
  title: "China's National Carbon Market: 2027 All-Major-Industrial-Sectors Expansion Roadmap",
  meta: "regulation · emissions",
  impact: null,
  impactTotal: "unscored",
  due: { label: "Jan 1 2027", days: "100 days" },
  timeline: [
    { date: "2021-07-01", label: "July 2021 — China's national ETS launched, covering the power sector only.", status: "past" },  // glyph:verbatim
    { date: "2024-01-01", label: "2024 — ETS coverage expanded to steel, cement, and aluminum; roughly 1,334 new entities added; national emissions coverage raised from about 40% to about 60%.", status: "past" },  // glyph:verbatim
    { date: "2027-01-01", label: "2027 — ETS target to encompass all major industrial sectors (forthcoming; implementing rules pending).", status: "future" },  // glyph:verbatim
  ],
  tier: 2,
  itemGrade: "brief",
};

/** The four rows, in the brief's own N order: 4, 8, 12, unscored. */
export const LIST_ROW_FIXTURE_ROWS: readonly ListRowFixtureRow[] = [
  EU_TAXONOMY,
  CALIFORNIA_SB253,
  WEIGHTS_AND_DIMENSIONS,
  CHINA_ETS,
];
