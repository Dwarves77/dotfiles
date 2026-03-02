/**
 * Change log — what specifically changed per resource during audits.
 * Extracted from freight_sustainability_dashboard.jsx
 */

export interface ChangeEntry {
  field: string;
  prev: string;
  now: string;
  impact: string;
}

export type ChangeLog = Record<string, ChangeEntry[]>;

export const CHANGE_LOG: ChangeLog = {
  t1: [
    {
      field: "Timeline",
      prev: "CBAM transitional phase until Dec 2025",
      now: "Definitive phase active Jan 2026. Authorised declarant registration deadline extended to March 2026",
      impact:
        "HIGH — registration is now the immediate compliance action",
    },
    {
      field: "Scope",
      prev: "Scope limited to cement, iron, steel, aluminium, fertilisers, electricity, hydrogen",
      now: "Unchanged scope but EU Commission reviewing potential expansion to organic chemicals and polymers by 2028",
      impact: "MODERATE — expansion may affect packaging materials",
    },
    {
      field: "Dispute status",
      prev: "WTO challenge speculative",
      now: "Multiple WTO members (India, China, Brazil) have formally signaled objections. Implementation proceeding but legal challenge is active",
      impact: "HIGH — dispute may alter scope or enforcement timeline",
    },
  ],
  o1: [
    {
      field: "Priority",
      prev: "HIGH",
      now: "CRITICAL",
      impact:
        "Urgency increased — enforcement timelines are within planning horizon",
    },
    {
      field: "Key data",
      prev: "No specific packaging regulation link",
      now: "Added PPWR interaction — packaging compliance required for goods shipped on ocean routes to EU",
      impact:
        "MODERATE — packaging + ocean compliance now linked",
    },
    {
      field: "Timeline",
      prev: "ETS Phase 4 only",
      now: "Added IMO NZF interaction milestones for dual ocean compliance tracking",
      impact:
        "HIGH — two parallel compliance tracks now active for ocean freight",
    },
  ],
  o4: [
    {
      field: "Status",
      prev: "Draft proposal stage",
      now: "Regulation published in Official Journal, directly applicable in all EU member states",
      impact:
        "CRITICAL — no longer draft; immediate legal obligation",
    },
    {
      field: "Key data",
      prev: "Targets under negotiation",
      now: "All packaging recyclable by 2030, PFAS restrictions confirmed, single-use bans from 2030, recycled content minimums set",
      impact: "HIGH — concrete targets now enforceable",
    },
    {
      field: "Timeline",
      prev: "Estimated 2026 implementation",
      now: "Phased implementation confirmed: labelling 2026, reuse targets 2030, recycled content 2030",
      impact: "HIGH — phase dates now firm for planning",
    },
  ],
};
