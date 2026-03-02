/**
 * Supersessions — regulations that have been replaced by newer versions.
 * Extracted from freight_sustainability_dashboard.jsx
 */

export interface TimelineMilestone {
  date: string;
  label: string;
}

export interface Supersession {
  id: string;
  oldTitle: string;
  oldUrl: string;
  newTitle: string;
  newId: string;
  severity: "major" | "minor" | "replacement";
  date: string;
  what: string;
  timeline: TimelineMilestone[];
}

export const SUPERSESSIONS: Supersession[] = [
  {
    id: "ss1",
    oldTitle: "EU PPWD 94/62/EC",
    oldUrl: "",
    newTitle: "EU PPWR 2025/40",
    newId: "g2",
    severity: "major",
    date: "2025-02",
    what: "Directive replaced by directly applicable Regulation. No national transposition needed. All packaging recyclable by 2030, PFAS restrictions, single-use limits. Dramatically expands scope for transport and event packaging.",
    timeline: [
      { date: "1994-12", label: "PPWD adopted" },
      { date: "2025-02", label: "PPWR in force" },
      { date: "2026-08", label: "PPWR applies" },
      { date: "2030-01", label: "All recyclable" },
    ],
  },
  {
    id: "ss2",
    oldTitle: "CSRD 250+ employees threshold",
    oldUrl: "",
    newTitle: "EU Omnibus CSRD 1,000+ employees",
    newId: "c1",
    severity: "major",
    date: "2026-02",
    what: "Omnibus raised company size threshold from 250 to 1,000 employees. Companies in scope dropped from ~50,000 to ~5,000. Wave 2 delayed by 2 years. Remaining companies face stricter data granularity requirements including supply chain logistics emissions.",
    timeline: [
      { date: "2024-01", label: "Wave 1 PIEs" },
      { date: "2026-02", label: "Omnibus adopted" },
      { date: "2028-01", label: "Wave 2 delayed" },
    ],
  },
  {
    id: "ss3",
    oldTitle: "EPA 2009 Endangerment Finding",
    oldUrl: "",
    newTitle: "EPA GHG Rescission (2025)",
    newId: "g8",
    severity: "minor",
    date: "2025-12",
    what: "Federal legal basis for ALL vehicle GHG regulation removed. Creates patchwork: California + 12 Section 177 states maintain independent standards. Federal rules collapse. Court challenges pending. Freight forwarders face divergent state-by-state compliance.",
    timeline: [
      { date: "2009-12", label: "Finding issued" },
      { date: "2025-06", label: "Rescission proposed" },
      { date: "2025-12", label: "Final rule" },
      { date: "2026-06", label: "Court challenges" },
    ],
  },
  {
    id: "ss4",
    oldTitle: "IMO 2018 GHG Strategy (50% by 2050)",
    oldUrl: "",
    newTitle: "IMO 2023 Revised Strategy (Net-zero ~2050)",
    newId: "o1",
    severity: "major",
    date: "2023-07",
    what: "Ambition doubled from 50% reduction to net-zero by ~2050. New interim checkpoints: 20% by 2030, 70% by 2040. GHG fuel intensity code and pricing mechanism under negotiation. Fundamentally reshapes carrier fleet investment timelines.",
    timeline: [
      { date: "2018-04", label: "Initial strategy" },
      { date: "2023-07", label: "Revised adopted" },
      { date: "2025-04", label: "MEPC 83" },
      { date: "2030-01", label: "20% checkpoint" },
      { date: "2040-01", label: "70% checkpoint" },
    ],
  },
  {
    id: "ss5",
    oldTitle: "Voluntary IMO GHG measures only",
    oldUrl: "",
    newTitle: "IMO Net-Zero Framework (binding fuel standard + pricing)",
    newId: "o13",
    severity: "major",
    date: "2025-04",
    what: "First binding market-based measure for shipping: mandatory fuel GHG intensity standard + global carbon pricing mechanism. Approved MEPC 83 by 63-16-24 vote. US walked out and formally opposes. Adoption at MEPC ES.2 Oct 2025, entry into force Mar 2027, enforcement 2028. Creates new carrier cost layer on every ocean shipment.",
    timeline: [
      { date: "2025-04", label: "MEPC 83 approved" },
      { date: "2025-10", label: "Adoption vote" },
      { date: "2027-03", label: "Entry into force" },
      { date: "2028-01", label: "Enforcement" },
    ],
  },
];
