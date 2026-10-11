import type { SearchResultRow } from "@/app/api/search/logic";

export const SEARCH_FIXTURE_QUERY = "carbon";
export const SEARCH_FIXTURE_DATE = "2026-09-23";
export const SEARCH_FIXTURE_PROJECT = "kwrsbpiseruzbfwjpvsp";
/** verified_count from the frozen SELECT above, 2026-09-23. */
export const SEARCH_FIXTURE_VERIFIED_COUNT = 1440;

export const SEARCH_FIXTURE_RESULTS: SearchResultRow[] = [
  {
    id: "69d5dacb-b0a0-4b27-9784-4967e5759c1f",
    title: "California AB 1305 — Voluntary Carbon Market Disclosures Act",  // glyph:verbatim
    item_type: "regulation",
    domain: 1,
    priority: "CRITICAL",
    jurisdictions: ["US"],
    transport_modes: ["road", "ocean", "air", "rail"],
    topic: "reporting",
  },
  {
    id: "c26f4ac6-cd91-4bc8-b0c2-84766f9072f6",
    title: "Carbon Allowance Price Intelligence",
    item_type: "market_signal",
    domain: 4,
    priority: "HIGH",
    jurisdictions: [],
    transport_modes: ["ocean", "air", "road"],
    topic: "emissions",
  },
  {
    id: "0e6e82cb-84fc-49ab-8078-c6500e13ee82",
    title: "Carbon Trust",
    item_type: "research_finding",
    domain: 7,
    priority: "LOW",
    jurisdictions: ["GB"],
    transport_modes: ["air", "ocean", "road"],
    topic: "research",
  },
  {
    id: "538c2774-e271-4e8f-b03d-2385b705b862",
    title: "Carbon Trust: Global Organization Overview and Net Zero Transition Services",
    item_type: "market_signal",
    domain: 2,
    priority: "LOW",
    jurisdictions: ["CN", "GLOBAL"],
    transport_modes: [],
    topic: "reporting",
  },
  {
    id: "1d7a6706-f7df-4708-b0b7-529a63d3deac",
    title: "The Carbon Accounting Regulations 2009",
    item_type: "regulation",
    domain: 1,
    priority: "LOW",
    jurisdictions: [],
    transport_modes: [],
    topic: null,
  },
];
