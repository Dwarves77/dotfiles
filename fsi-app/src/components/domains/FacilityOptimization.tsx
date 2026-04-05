"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  Building, Sun, Zap, Battery, Users, Award,
  ChevronDown, ExternalLink, Calculator,
} from "lucide-react";

// ── Facility Data Categories ──

interface FacilityCategory {
  id: string;
  label: string;
  icon: typeof Sun;
  description: string;
  data_points: { label: string; value: string; source: string; note?: string }[];
  tools: { name: string; url: string; description: string }[];
}

const FACILITY_CATEGORIES: FacilityCategory[] = [
  {
    id: "electricity",
    label: "Industrial Electricity Tariffs",
    icon: Zap,
    description: "Commercial and industrial electricity tariffs by country and zone. Free zone vs mainland tariffs may differ significantly.",
    data_points: [
      { label: "US (average)", value: "$0.08-0.20/kWh", source: "US EIA", note: "California highest (~$0.20), Texas/Southeast lowest (~$0.08)" },
      { label: "UK", value: "£0.25-0.35/kWh", source: "Ofgem", note: "Elevated post-energy crisis" },
      { label: "Germany", value: "€0.28-0.35/kWh", source: "IEA Energy Prices", note: "Highest in EU; network charges significant" },
      { label: "Netherlands", value: "€0.18-0.25/kWh", source: "IEA Energy Prices" },
      { label: "France", value: "€0.18-0.22/kWh", source: "IEA Energy Prices", note: "Nuclear base keeps costs lower" },
      { label: "Dubai/UAE", value: "AED 0.23-0.38/kWh", source: "DEWA", note: "Slab-based; free zone tariffs may differ" },
      { label: "Singapore", value: "S$0.25-0.30/kWh", source: "EMA", note: "Open market; carbon tax adds S$25/tCO2e" },
      { label: "Hong Kong", value: "HK$1.0-1.3/kWh", source: "CLP/HK Electric" },
    ],
    tools: [
      { name: "IEA Energy Prices Database", url: "https://www.iea.org/data-and-statistics/data-product/energy-prices", description: "Industrial tariffs for 130 countries" },
    ],
  },
  {
    id: "solar",
    label: "Rooftop Solar ROI",
    icon: Sun,
    description: "Solar irradiance data, permitting status, and ROI calculation inputs by jurisdiction. Commercial/industrial rooftop solar is permitted in most jurisdictions with varying incentive structures.",
    data_points: [
      { label: "Utility-scale solar LCOE", value: "$0.03-0.05/kWh", source: "IRENA", note: "Historic lows in 2024" },
      { label: "Commercial rooftop ROI", value: "4-7 years typical", source: "NREL/IRENA", note: "Varies by tariff, irradiance, incentives" },
      { label: "US IRA ITC", value: "30% tax credit", source: "IRS", note: "Available for commercial solar" },
      { label: "Dubai (DEWA Shams)", value: "Net metering permitted", source: "DEWA", note: "PROVISIONAL — verify current terms" },
      { label: "UK (SEG)", value: "Smart Export Guarantee", source: "Ofgem", note: "Replaced feed-in tariff" },
      { label: "Singapore", value: "Solar leasing models available", source: "EMA" },
    ],
    tools: [
      { name: "NREL PVWatts", url: "https://pvwatts.nrel.gov", description: "Solar energy production and cost estimates by location" },
      { name: "NREL SAM", url: "https://sam.nrel.gov", description: "Detailed system modeling with BESS integration" },
      { name: "Global Solar Atlas", url: "https://globalsolaratlas.info", description: "Solar irradiance data by city" },
      { name: "NREL NSRDB", url: "https://nsrdb.nrel.gov/", description: "Solar radiation data at 4km resolution" },
    ],
  },
  {
    id: "bess",
    label: "Battery Energy Storage",
    icon: Battery,
    description: "Commercial battery energy storage system pricing, technology trajectories, and warehouse application economics.",
    data_points: [
      { label: "Li-ion BESS cost (2024)", value: "$150-200/kWh", source: "BNEF/IRENA", note: "Declining 10-15% annually" },
      { label: "LFP pack cost", value: "~$100/kWh", source: "BNEF", note: "Approaching grid parity for peak shaving" },
      { label: "Commercial BESS payback", value: "5-8 years", source: "NREL", note: "Depends on demand charges and tariff structure" },
      { label: "Na-ion emergence", value: "2025-2027 commercial", source: "IRENA", note: "Cheaper but lower energy density" },
    ],
    tools: [
      { name: "NREL SAM", url: "https://sam.nrel.gov", description: "BESS sizing and economics modeling" },
      { name: "IRENA Cost Database", url: "https://www.irena.org/Energy-Transition/Technology/Power-generation-costs", description: "Annual BESS cost benchmarks" },
    ],
  },
  {
    id: "labor",
    label: "Labor Cost Benchmarks",
    icon: Users,
    description: "Warehouse and logistics role labor costs by country. Monitoring and facility management roles.",
    data_points: [
      { label: "US (warehouse)", value: "$35,000-55,000/year", source: "BLS", note: "CA/NY significantly higher" },
      { label: "UK (warehouse)", value: "£25,000-35,000/year", source: "ONS", note: "London premium ~15-20%" },
      { label: "EU (warehouse)", value: "€30,000-45,000/year", source: "Eurostat", note: "Germany/NL highest" },
      { label: "Dubai/UAE", value: "AED 3,000-5,000/month", source: "MOHRE", note: "Subject to visa/labor law" },
      { label: "Singapore", value: "S$2,500-4,000/month", source: "MOM", note: "Foreign worker levy applies" },
      { label: "Hong Kong", value: "HK$15,000-25,000/month", source: "Census & Statistics", note: "Statutory minimum HK$40/hr" },
    ],
    tools: [
      { name: "ILOSTAT", url: "https://ilostat.ilo.org/", description: "Global labor statistics across 200 countries" },
      { name: "ILO Global Wage Report", url: "https://www.ilo.org/resource/other/global-wage-report-series", description: "Annual wage benchmarks by region" },
    ],
  },
  {
    id: "green-building",
    label: "Green Building Certifications",
    icon: Award,
    description: "Green building certification requirements by jurisdiction. Increasingly required for institutional investment and large-tenant warehouse leases.",
    data_points: [
      { label: "LEED (US/Global)", value: "Voluntary (dominant US standard)", source: "USGBC" },
      { label: "BREEAM (UK/EU)", value: "Voluntary (dominant UK/EU standard)", source: "BRE Global" },
      { label: "DGNB (Germany)", value: "Voluntary (dominant DE standard)", source: "DGNB" },
      { label: "Estidama Pearl (Abu Dhabi)", value: "Mandatory for government buildings", source: "Abu Dhabi UPC" },
      { label: "BCA Green Mark (Singapore)", value: "Mandatory >5,000 sqm", source: "BCA Singapore" },
      { label: "BEAM Plus (Hong Kong)", value: "Voluntary (growing adoption)", source: "HKGBC" },
      { label: "HQE (France)", value: "Voluntary (dominant FR standard)", source: "Cerway" },
    ],
    tools: [
      { name: "USGBC Project Database", url: "https://www.usgbc.org/projects", description: "LEED projects by country and type" },
      { name: "BREEAM", url: "https://www.breeam.com", description: "UK/EU certification requirements" },
      { name: "BCA Green Mark", url: "https://www1.bca.gov.sg/buildsg/sustainability/green-mark-certification-scheme", description: "Singapore requirements" },
    ],
  },
];

// ── Category Card ──

function FacilityCategoryCard({ category }: { category: FacilityCategory }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = category.icon;

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
        <Icon size={16} style={{ color: "var(--color-primary)" }} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {category.label}
          </h3>
          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "var(--color-text-secondary)" }}>
            {category.description}
          </p>
        </div>
        <ChevronDown
          size={14}
          className={cn("shrink-0 transition-transform duration-200", expanded && "rotate-180")}
          style={{ color: "var(--color-text-muted)" }}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          <p className="text-xs pt-3" style={{ color: "var(--color-text-secondary)" }}>
            {category.description}
          </p>

          {/* Data Points */}
          <div className="space-y-1.5">
            {category.data_points.map((dp, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-2.5 rounded-lg"
                style={{ backgroundColor: "var(--color-surface-raised)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {dp.label}
                    </span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                      {dp.value}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      {dp.source}
                    </span>
                    {dp.note && (
                      <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                        — {dp.note}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tools */}
          {category.tools.length > 0 && (
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
                <Calculator size={10} className="inline mr-1" />
                Tools & Data Sources
              </span>
              <div className="mt-1.5 space-y-1.5">
                {category.tools.map((tool, i) => (
                  <a
                    key={i}
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--color-surface-raised)] transition-colors"
                  >
                    <ExternalLink size={10} style={{ color: "var(--color-primary)" }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium" style={{ color: "var(--color-primary)" }}>
                        {tool.name}
                      </span>
                      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                        {tool.description}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export function FacilityOptimization() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Warehouse & Facility Optimization
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Electricity tariffs, solar ROI, battery storage, labor benchmarks, and green building certifications by location.
        </p>
      </div>

      <div className="space-y-3">
        {FACILITY_CATEGORIES.map((cat) => (
          <FacilityCategoryCard key={cat.id} category={cat} />
        ))}
      </div>
    </div>
  );
}
