/**
 * Cross-reference pairs — directed links between resources.
 * Each tuple is [source, target] meaning "source references/depends on target".
 * Extracted from freight_sustainability_dashboard.jsx
 */

export type XrefPair = [source: string, target: string];

export const XREF_PAIRS: XrefPair[] = [
  // IMO GHG Strategy is the root — everything in ocean references it
  ["o2", "o1"],
  ["o3", "o1"],
  ["o4", "o1"],
  ["o7", "o1"],
  // EU ETS Shipping depends on MRV data
  ["o3", "o6"],
  // Fit for 55 is parent package — child regulations reference it
  ["o2", "g1"],
  ["o3", "g1"],
  ["a2", "g1"],
  ["a3", "g1"],
  ["l1", "g1"],
  ["l3", "g1"],
  ["t1", "g1"],
  ["g2", "g1"],
  // CORSIA references ICAO calculator methodology
  ["a1", "a6"],
  // UK SAF references EU ReFuelEU as benchmark
  ["a4", "a3"],
  // GLEC aligned with ISO 14083
  ["c5", "c4"],
  ["a7", "c4"],
  // GHG Protocol is foundation — SBTi, CDP, CSRD build on it
  ["c7", "c6"],
  ["c9", "c6"],
  ["c1", "c6"],
  // CSRD references Taxonomy + GRI + ISSB
  ["c1", "c2"],
  ["c1", "c3"],
  ["c1", "c8"],
  // ISSB interoperates with GRI
  ["c8", "c3"],
  // EcoVadis uses CDP-like methodology
  ["c10", "c9"],
  // CBAM linked to ETS pricing
  ["t1", "o3"],
  ["t1", "t5"],
  // World Bank tracks ICAP data
  ["t5", "t6"],
  // CARB references EPA as federal baseline
  ["l7", "l6"],
  // IPCC is scientific basis for IMO + Fit for 55
  ["o1", "g28"],
  ["g1", "g28"],
  // Getting to Zero corridors directory references coalition
  ["r30", "o7"],
  // Port of LA references CARB rules
  ["r31", "l7"],
  // Singapore Green Plan references MPA
  ["g20", "g17"],
  // PPWR replaces PPWD (tracked in supersessions, reinforced here)
  ["g2", "g1"],
  // SBTi transport pathway references ISO 14083
  ["c7", "c4"],
  // IEA tracks OECD carbon pricing
  ["g29", "t3"],
  // ITF is OECD transport arm
  ["g31", "t3"],
  // IMO NZF references IMO GHG Strategy and is linked to EU ETS/FuelEU
  ["o13", "o1"],
  ["o13", "o2"],
  ["o13", "o3"],
  // CountEmissions references ISO 14083 and GLEC
  ["g34", "c4"],
  ["g34", "c5"],
  // EUDR references Fit for 55 package
  ["g33", "g1"],
  // ICS2 links to CBAM customs integration
  ["g32", "t1"],
  // FIATA provides CBAM guidance
  ["r34", "t1"],
  // ICCT referenced by EU truck + maritime standards
  ["l1", "r35"],
  ["o1", "r35"],
  // Maritime Carbon Intelligence covers NZF + ETS
  ["r36", "o13"],
  ["r36", "o3"],
];
