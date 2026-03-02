/**
 * Relationship clusters — resources that compound on the same shipment or workflow.
 * Extracted from freight_sustainability_dashboard.jsx
 */

export interface Cluster {
  id: string;
  name: string;
  desc: string;
  color: string;
  ids: string[];
}

export const CLUSTERS: Cluster[] = [
  {
    id: "cl1",
    name: "EU Ocean Shipment Stack",
    desc: "Regulations hitting the SAME vessel on SAME EU port call",
    color: "#0F4C81",
    ids: ["o1", "o2", "o3", "o4", "o5", "o6", "o13"],
  },
  {
    id: "cl2",
    name: "EU Air Cargo Stack",
    desc: "Combined cost layers on every EU airport uplift",
    color: "#2E86AB",
    ids: ["a1", "a2", "a3"],
  },
  {
    id: "cl3",
    name: "Client Data Request Chain",
    desc: "The pipeline from methodology \u2192 calculation \u2192 disclosure \u2192 scoring",
    color: "#0D9488",
    ids: ["c4", "c5", "c6", "c7", "c8", "c9", "c10", "g34"],
  },
  {
    id: "cl4",
    name: "EU Packaging & Materials",
    desc: "Packaging + deforestation + PFAS rules on every EU-bound shipment",
    color: "#DC2626",
    ids: ["g1", "g2", "g4", "g33"],
  },
  {
    id: "cl5",
    name: "US Drayage & Fleet",
    desc: "Converging US truck mandates affecting port access",
    color: "#E8871E",
    ids: ["l6", "l7", "l8", "g8"],
  },
  {
    id: "cl6",
    name: "Carbon Pricing Exposure",
    desc: "Carbon costs embedded in freight rates across jurisdictions",
    color: "#7C3AED",
    ids: ["t1", "t5", "t6", "o3", "a2", "o13"],
  },
  {
    id: "cl7",
    name: "Green Corridor Readiness",
    desc: "Infrastructure and fuel availability on key trade lanes",
    color: "#2563EB",
    ids: ["o7", "o8", "r30", "r31", "l3", "g17"],
  },
  {
    id: "cl8",
    name: "SAF Cost Cascade",
    desc: "SAF mandates compounding across jurisdictions",
    color: "#2E86AB",
    ids: ["a3", "a4", "a5", "a7"],
  },
  {
    id: "cl9",
    name: "EU Customs & Border Stack",
    desc: "CBAM + ICS2 + EUDR converging at EU border in 2026",
    color: "#DC2626",
    ids: ["t1", "g32", "g33"],
  },
  {
    id: "cl10",
    name: "Timber & Wood Packaging",
    desc: "EUDR + PPWR + ISPM 15 affecting crating for art, automotive, events",
    color: "#E8871E",
    ids: ["g33", "g2"],
  },
];
