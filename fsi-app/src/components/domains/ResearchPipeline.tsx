"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  GraduationCap, ChevronDown, ExternalLink,
  Calendar, Users, BookOpen,
} from "lucide-react";

// ── Research Partner ──

interface ResearchPartner {
  id: string;
  name: string;
  url: string;
  description: string;
  focus_areas: string[];
  current_projects: { title: string; status: string; date: string; relevance: string }[];
  transport_modes: string[];
  jurisdictions: string[];
  partnership_type: "research_partner" | "data_contributor" | "monitoring";
}

const RESEARCH_PARTNERS: ResearchPartner[] = [
  {
    id: "mit-cm",
    name: "MIT ClimateMachine",
    url: "https://climatemachine.mit.edu",
    description: "MIT Environmental Solutions Initiative. Phase 1 published December 11, 2025: Assessment Report of the Media and Entertainment Industry and Climate Change — Live Music, UK and US.",
    focus_areas: ["Live music emissions", "Air freight modal shift", "Event logistics carbon footprint"],
    current_projects: [
      {
        title: "Phase 1: Live Music UK and US",
        status: "Published",
        date: "2025-12-11",
        relevance: "Baseline data: UK 4.0 MtCO2e, US 14.3 MtCO2e. Air freight 35.4% of UK non-fan emissions. Modal shift potential 50-95%.",
      },
      {
        title: "Phase 2: Expanded scope",
        status: "Forthcoming",
        date: "TBD",
        relevance: "Expected to expand beyond live music to broader entertainment industry logistics.",
      },
    ],
    transport_modes: ["air", "road"],
    jurisdictions: ["us", "uk"],
    partnership_type: "research_partner",
  },
  {
    id: "mit-ctl",
    name: "MIT Center for Transportation and Logistics",
    url: "https://ctl.mit.edu",
    description: "Sustainable freight research, trucking consortium publications, and supply chain decarbonization.",
    focus_areas: ["Sustainable trucking", "Supply chain decarbonization", "Freight optimization"],
    current_projects: [
      {
        title: "Sustainable Trucking Consortium",
        status: "Active (2025)",
        date: "2025",
        relevance: "Zero-emission HGV pathways and fleet transition economics.",
      },
    ],
    transport_modes: ["air", "road", "ocean"],
    jurisdictions: ["global"],
    partnership_type: "monitoring",
  },
  {
    id: "tyndall",
    name: "Tyndall Centre for Climate Research",
    url: "https://www.tyndall.ac.uk",
    description: "ACT 1.5 low-carbon concert roadmap. Massive Attack concert case study. Live events decarbonization pathway research.",
    focus_areas: ["Live events decarbonization", "Low-carbon concert model", "Music industry roadmap"],
    current_projects: [
      {
        title: "ACT 1.5 Report",
        status: "Published 2025",
        date: "2025",
        relevance: "Low-carbon concert roadmap with Massive Attack case study. Defines feasible emissions reduction for touring.",
      },
    ],
    transport_modes: ["air", "road"],
    jurisdictions: ["uk", "global"],
    partnership_type: "monitoring",
  },
  {
    id: "chalmers",
    name: "Chalmers University — Marine Environment",
    url: "https://www.chalmers.se/en/departments/m2/",
    description: "Marine decarbonization research: alternative fuel readiness for shipping, LNG, methanol, ammonia pathways.",
    focus_areas: ["Marine fuel pathways", "Ammonia safety", "Methanol infrastructure"],
    current_projects: [
      {
        title: "Alternative Marine Fuel Readiness",
        status: "Ongoing",
        date: "2024-2026",
        relevance: "Fuel pathway analysis directly relevant to ocean freight procurement decisions.",
      },
    ],
    transport_modes: ["ocean"],
    jurisdictions: ["global"],
    partnership_type: "monitoring",
  },
  {
    id: "csrf",
    name: "Centre for Sustainable Road Freight",
    url: "https://www.csrf.ac.uk",
    description: "Heriot-Watt / Cambridge collaboration. UK road freight decarbonization, zero-emission HGV pathways, charging infrastructure for logistics.",
    focus_areas: ["Zero-emission HGVs", "Charging infrastructure", "UK freight decarbonization"],
    current_projects: [
      {
        title: "UK Road Freight Zero-Emission Pathways",
        status: "Ongoing",
        date: "2024-2026",
        relevance: "Infrastructure readiness assessment for UK logistics operations.",
      },
    ],
    transport_modes: ["road"],
    jurisdictions: ["uk"],
    partnership_type: "monitoring",
  },
  {
    id: "julies-bicycle",
    name: "Julie's Bicycle",
    url: "https://juliesbicycle.com",
    description: "Creative Climate Tools. Arts and entertainment sustainability guides. Industry benchmark reports for the cultural sector.",
    focus_areas: ["Arts sustainability", "Creative Climate Tools", "Cultural sector benchmarks"],
    current_projects: [
      {
        title: "Creative Climate Tools Updates",
        status: "Annual",
        date: "Ongoing",
        relevance: "Practical sustainability tools for cultural organizations and events. Directly relevant to fine art and live events verticals.",
      },
    ],
    transport_modes: ["road", "air"],
    jurisdictions: ["uk", "global"],
    partnership_type: "monitoring",
  },
  {
    id: "reverb",
    name: "REVERB",
    url: "https://reverb.org",
    description: "Annual Music on a Mission tour impact reports. Festival sustainability data. Vendor and supplier recommendations.",
    focus_areas: ["Tour impact measurement", "Festival sustainability", "Music industry benchmarks"],
    current_projects: [
      {
        title: "Annual Tour Impact Reports",
        status: "Annual",
        date: "Ongoing",
        relevance: "US live events benchmarking data. Vendor recommendations for sustainable touring.",
      },
    ],
    transport_modes: ["road", "air"],
    jurisdictions: ["us"],
    partnership_type: "monitoring",
  },
];

// ── MIT Baseline Data ──

const MIT_BASELINES = {
  title: "MIT ClimateMachine Phase 1 — Verified Baselines",
  citation: "Climate Machine (2025). Assessment Report of the Media and Entertainment Industry and Climate Change — Phase 1: Live Music, UK and US. Environmental Solutions Initiative, Massachusetts Institute of Technology.",
  note: "Verified benchmark data from the MIT Environmental Solutions Initiative.",
  data: [
    { metric: "UK live music total emissions (2023)", value: "4.0 MtCO2e", confidence: "confirmed" },
    { metric: "US live music total emissions (2023)", value: "14.3 MtCO2e", confidence: "confirmed" },
    { metric: "Air freight share — UK non-fan emissions", value: "35.4% (331,084 tCO2e)", confidence: "confirmed" },
    { metric: "Air freight share — US non-fan emissions", value: "6.1%", confidence: "confirmed" },
    { metric: "Trucking share — UK", value: "3.0%", confidence: "confirmed" },
    { metric: "Trucking share — US", value: "14.1%", confidence: "confirmed" },
    { metric: "Modal shift potential (air → ocean)", value: "50-95% reduction", confidence: "confirmed" },
    { metric: "Generator utilization at festivals", value: "3-8% of capacity", confidence: "confirmed" },
  ],
};

// ── Partner Card ──

function PartnerCard({ partner }: { partner: ResearchPartner }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border rounded-lg overflow-hidden transition-all duration-200"
      style={{
        borderColor: expanded ? "var(--color-border-strong)" : "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
      >
        <GraduationCap size={16} style={{ color: "var(--color-primary)" }} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {partner.name}
          </h3>
          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "var(--color-text-secondary)" }}>
            {partner.focus_areas.join(" · ")}
          </p>
        </div>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0"
          style={{
            color: partner.partnership_type === "research_partner" ? "var(--color-primary)" : "var(--color-text-secondary)",
            backgroundColor: partner.partnership_type === "research_partner" ? "var(--color-active-bg)" : "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
          }}
        >
          {partner.partnership_type === "research_partner" ? "Partner" : "Monitoring"}
        </span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 transition-transform duration-200", expanded && "rotate-180")}
          style={{ color: "var(--color-text-muted)" }}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          <p className="text-xs pt-3" style={{ color: "var(--color-text-secondary)" }}>
            {partner.description}
          </p>
          <a
            href={partner.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: "var(--color-primary)" }}
          >
            <ExternalLink size={10} /> {partner.url}
          </a>

          {/* Current Projects */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Current Projects
            </span>
            <div className="mt-1 space-y-2">
              {partner.current_projects.map((proj, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg"
                  style={{ backgroundColor: "var(--color-surface-raised)" }}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen size={10} style={{ color: "var(--color-primary)" }} />
                    <span className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {proj.title}
                    </span>
                    <span className="text-[10px] ml-auto" style={{ color: "var(--color-text-muted)" }}>
                      {proj.status}
                    </span>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    {proj.relevance}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export function ResearchPipeline() {
  const [showBaselines, setShowBaselines] = useState(true);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          University & Research Pipeline
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Academic research relevant to freight and logistics sustainability.
        </p>
      </div>

      {/* MIT Baseline Data */}
      <div
        className="border rounded-lg"
        style={{
          borderColor: "var(--color-primary)",
          backgroundColor: "var(--color-active-bg)",
        }}
      >
        <button
          onClick={() => setShowBaselines(!showBaselines)}
          className="w-full flex items-center gap-3 p-4 text-left cursor-pointer"
        >
          <div className="flex-1">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {MIT_BASELINES.title}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              Verified benchmark data — MIT Environmental Solutions Initiative
            </p>
          </div>
          <ChevronDown
            size={14}
            className={cn("shrink-0 transition-transform duration-200", showBaselines && "rotate-180")}
            style={{ color: "var(--color-text-muted)" }}
          />
        </button>
        {showBaselines && (
          <div className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MIT_BASELINES.data.map((d, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg"
                  style={{ backgroundColor: "var(--color-surface)" }}
                >
                  <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    {d.metric}
                  </span>
                  <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                    {d.value}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] italic" style={{ color: "var(--color-text-muted)" }}>
              {MIT_BASELINES.citation}
            </p>
          </div>
        )}
      </div>

      {/* Research Partners */}
      <div className="space-y-3">
        {RESEARCH_PARTNERS.map((partner) => (
          <PartnerCard key={partner.id} partner={partner} />
        ))}
      </div>
    </div>
  );
}
