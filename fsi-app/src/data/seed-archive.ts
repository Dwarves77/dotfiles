/**
 * Archived seed items — regulations/resources that have been superseded or repealed.
 * Extracted from freight_sustainability_dashboard.jsx
 */

export interface ArchivedResource {
  id: string;
  title: string;
  cat: string;
  archivedDate: string;
  reason: "Superseded" | "Repealed" | string;
  note: string;
  replacement: string;
}

export const SEED_ARC: ArchivedResource[] = [
  {
    id: "arc1",
    title: "EU PPWD 94/62/EC",
    cat: "global",
    archivedDate: "2025-02-11",
    reason: "Superseded",
    note: "Replaced by PPWR 2025/40",
    replacement: "EU PPWR 2025/40",
  },
  {
    id: "arc2",
    title: "CSRD 250+ employee threshold",
    cat: "compliance",
    archivedDate: "2026-02-24",
    reason: "Superseded",
    note: "Omnibus raised to 1,000",
    replacement: "CSRD (Omnibus)",
  },
  {
    id: "arc3",
    title: "EPA 2009 Endangerment Finding",
    cat: "global",
    archivedDate: "2025-12-01",
    reason: "Repealed",
    note: "Federal GHG basis rescinded",
    replacement: "EPA SmartWay",
  },
  {
    id: "arc4",
    title: "IMO 2018 GHG Strategy",
    cat: "ocean",
    archivedDate: "2023-07-07",
    reason: "Superseded",
    note: "Replaced by 2023 Revised Strategy",
    replacement: "IMO GHG Strategy 2023",
  },
];
