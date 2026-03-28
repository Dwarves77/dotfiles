// ── Sub-jurisdiction and regulatory conflict tagging ──
// Applied on top of seed resources to add granular location + conflict data

export interface SubJurisdictionTag {
  subJurisdiction: string;
  subJurisdictionLabel: string;
}

export interface RegulatoryConflictTag {
  type: "federal-state" | "international" | "trade" | "supersession" | "divergence";
  summary: string;
  parties: string[];
  status: "active" | "pending" | "resolved";
}

// ── Sub-jurisdiction assignments ──
// Key = resource ID, value = sub-jurisdiction info

export const SUB_JURISDICTION_TAGS: Record<string, SubJurisdictionTag> = {
  // US sub-jurisdictions
  l7:  { subJurisdiction: "us-ca", subJurisdictionLabel: "California" },
  r31: { subJurisdiction: "us-ca", subJurisdictionLabel: "California" },
  r1:  { subJurisdiction: "us-ca", subJurisdictionLabel: "California" },  // Port of LA data

  // EU sub-jurisdictions
  o9:  { subJurisdiction: "eu-norway", subJurisdictionLabel: "Norway" },
  g7:  { subJurisdiction: "eu-germany", subJurisdictionLabel: "Germany" },

  // Latin America sub-jurisdictions
  g13: { subJurisdiction: "latam-brazil", subJurisdictionLabel: "Brazil" },
  g14: { subJurisdiction: "latam-mexico", subJurisdictionLabel: "Mexico" },
  g15: { subJurisdiction: "latam-colombia", subJurisdictionLabel: "Colombia" },

  // Asia sub-jurisdictions
  g17: { subJurisdiction: "asia-singapore", subJurisdictionLabel: "Singapore" },
  g18: { subJurisdiction: "asia-japan", subJurisdictionLabel: "Japan" },
  g19: { subJurisdiction: "asia-korea", subJurisdictionLabel: "South Korea" },
  g20: { subJurisdiction: "asia-singapore", subJurisdictionLabel: "Singapore" },
  g22: { subJurisdiction: "asia-china", subJurisdictionLabel: "China" },
  g23: { subJurisdiction: "asia-australia", subJurisdictionLabel: "Australia" },
  g21: { subJurisdiction: "asia-asean", subJurisdictionLabel: "ASEAN" },
  g24: { subJurisdiction: "asia-asean", subJurisdictionLabel: "ASEAN" },

  // MEAF sub-jurisdictions
  g25: { subJurisdiction: "meaf-uae", subJurisdictionLabel: "UAE" },
  g26: { subJurisdiction: "meaf-uae", subJurisdictionLabel: "UAE" },
};

// ── Regulatory conflict assignments ──
// Key = resource ID, value = conflict information

export const REGULATORY_CONFLICT_TAGS: Record<string, RegulatoryConflictTag> = {
  // CRITICAL: California vs EPA — state ZEV mandate overrides federal timelines
  l7: {
    type: "federal-state",
    summary: "California CARB Advanced Clean Trucks mandate (55% ZEV by 2035) directly conflicts with less aggressive EPA Phase 3 federal standards. 12 states have adopted California's rules, bypassing federal leadership.",
    parties: ["California CARB", "US EPA", "12 Section 177 states"],
    status: "active",
  },

  // EPA Phase 3 — the federal side of the CA conflict
  l6: {
    type: "federal-state",
    summary: "EPA Heavy-Duty Phase 3 GHG standards (MY2027-2032) are less aggressive than California's CARB mandate. Federal administration has signaled intent to weaken or delay enforcement.",
    parties: ["US EPA", "California CARB"],
    status: "active",
  },

  // IMO Net-Zero — US opposes
  o13: {
    type: "international",
    summary: "IMO Net-Zero Framework approved MEPC 83 (63-16-24) but US voted against. Global fuel standard + GHG pricing mechanism for ships >5,000 GT faces implementation resistance from major flag states.",
    parties: ["IMO", "United States", "Major flag states"],
    status: "active",
  },

  // EU CBAM — WTO trade disputes
  t1: {
    type: "trade",
    summary: "EU CBAM carbon border tax on imports faces WTO compatibility challenges. Multiple trading partners (China, India, Turkey) have threatened retaliatory measures. Omnibus simplified to ease trade friction.",
    parties: ["EU", "WTO", "China", "India", "Turkey"],
    status: "active",
  },

  // EU ETS for shipping — international enforcement challenges
  o3: {
    type: "international",
    summary: "EU unilateral extension of ETS to maritime emissions faces pushback from non-EU flag states who view it as extraterritorial. IMO has expressed concern about regional measures fragmenting global regulation.",
    parties: ["EU", "IMO", "Non-EU flag states"],
    status: "active",
  },

  // UK SAF — post-Brexit divergence from EU
  a4: {
    type: "divergence",
    summary: "UK SAF mandate (2% from 2025, 10% by 2030) diverges from EU ReFuelEU Aviation timelines post-Brexit. Creates dual compliance burden for carriers operating both UK and EU routes.",
    parties: ["UK DfT", "EU Commission"],
    status: "active",
  },

  // UK transport policy — post-Brexit divergence
  g6: {
    type: "divergence",
    summary: "UK post-Brexit transport decarbonisation establishes independent SAF mandate and ZEV targets that diverge from EU frameworks, creating compliance complexity for cross-Channel operations.",
    parties: ["UK DfT", "EU Commission"],
    status: "active",
  },

  // South Korea ETS — separate pricing signal
  g19: {
    type: "international",
    summary: "K-ETS includes shipping with separate carbon price from EU ETS and proposed IMO pricing. Multiple competing carbon prices create complexity for carriers on Asia-Europe routes.",
    parties: ["South Korea MOF", "EU ETS", "IMO"],
    status: "active",
  },

  // FuelEU Maritime — penalty mechanism
  o2: {
    type: "trade",
    summary: "FuelEU Maritime imposes €2,400/tonne penalties for non-compliance starting 2025. Non-EU carriers face financial exposure with limited compliance pathways in early years.",
    parties: ["EU", "Global shipping industry"],
    status: "active",
  },

  // EUDR — commodity sourcing conflicts
  g33: {
    type: "trade",
    summary: "EU Deforestation Regulation requires geolocation traceability for 7 commodities. Producer countries contest data requirements as trade barriers. Large operators deadline Dec 2026.",
    parties: ["EU", "Commodity-producing nations", "WTO"],
    status: "pending",
  },

  // CORSIA — aviation trade disputes
  a1: {
    type: "international",
    summary: "CORSIA mandatory phase from 2027 faces compliance challenges from states with limited offset market access. Potential trade disputes if CORSIA eligibility criteria exclude major offset programs.",
    parties: ["ICAO", "Developing states", "Offset market operators"],
    status: "pending",
  },
};
