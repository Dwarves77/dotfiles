/**
 * Pre-seeded disputes — information where sources conflict or status is uncertain.
 * Extracted from freight_sustainability_dashboard.jsx
 */

export interface Dispute {
  active: boolean;
  note: string;
  sources: string[];
}

export type DisputeMap = Record<string, Dispute>;

export const SEED_DISPUTES: DisputeMap = {
  l6: {
    active: true,
    note: "Regulatory survival uncertain. EPA Phase 3 under active political review — may be weakened, delayed, or rescinded. CARB standards (l7) remain independent but federal waiver also challenged. Sources conflict on timeline.",
    sources: ["EPA", "Industry groups", "Environmental Defense Fund"],
  },
  l7: {
    active: true,
    note: "Federal waiver for Section 177 states under legal challenge. 12+ states follow CARB rules, but if waiver is revoked, state-level mandates face uncertainty. Court ruling pending.",
    sources: ["CARB", "EPA", "State AG coalition"],
  },
  c1: {
    active: true,
    note: "CSRD Omnibus significantly changed scope in Feb 2026. Some sources still cite pre-Omnibus 250-employee threshold. Verify any CSRD reference uses post-Omnibus 1,000-employee threshold and delayed Wave 2 timeline.",
    sources: ["EU Commission", "Big 4 advisors"],
  },
  t1: {
    active: true,
    note: "WTO compatibility of CBAM is actively disputed. Multiple WTO members have filed or signaled objections. Implementation proceeding but legal challenge could alter scope.",
    sources: ["EU Commission", "WTO", "India/China trade ministries"],
  },
  g2: {
    active: true,
    note: "PPWR implementation guidance still being developed. Specific recyclability criteria and PFAS thresholds under delegated act development. Details may shift before Aug 2026 application date.",
    sources: ["EU Commission", "EUROPEN", "Plastics Europe"],
  },
  o13: {
    active: true,
    note: "US formally opposes IMO Net-Zero Framework as a 'global carbon tax'. US delegation walked out of MEPC 83 before vote. US State/Energy/Transport Secretaries issued joint ultimatum against countries voting yes at Oct 2025 adoption. Framework approved 63-16-24 but US enforcement non-participation creates compliance fragmentation on US-origin trade lanes.",
    sources: [
      "IMO",
      "US State Department",
      "Jones Walker LLP",
      "Maritime Carbon Intelligence",
    ],
  },
  g33: {
    active: true,
    note: "EUDR delayed twice (Dec 2024 \u2192 Dec 2025 \u2192 Dec 2026). Simplification review due Apr 2026 may further change requirements. IT platform readiness uncertain. Some stakeholders argue simplifications amount to deregulation. Core obligations remain but implementation details still shifting.",
    sources: ["EU Commission", "Mayer Brown", "Bird & Bird", "WRI"],
  },
};
