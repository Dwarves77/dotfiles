"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  Zap, Battery, Fuel, Wind, Sun, Truck, Ship,
  ChevronDown, ExternalLink, TrendingUp, AlertCircle,
} from "lucide-react";

// ── Technology Categories ──
// These are the category-level items Domain 2 tracks.
// Not individual companies — categories of technology.

interface TechCategory {
  id: string;
  label: string;
  icon: typeof Battery;
  description: string;
  modes: string[];
  trl_range: string;
  cost_trajectory: string;
  key_metrics: {
    label: string;
    value: string;
    trend: "up" | "down" | "stable";
    source: string;
    source_url: string;
    update_frequency: string;
  }[];
  policy_signals: { signal: string; source: string; source_url: string }[];
  freight_relevance: string;
}

const TECH_CATEGORIES: TechCategory[] = [
  {
    id: "battery-ev",
    label: "Battery & Electric Vehicles",
    icon: Battery,
    description: "Battery technology trajectories, EV commercial vehicles (Class 4-8), charging infrastructure including MCS (Megawatt Charging System), and range/payload economics by region.",
    modes: ["road"],
    trl_range: "TRL 7-9 (light duty deployed, heavy duty scaling)",
    cost_trajectory: "Battery pack costs declining — approaching $100/kWh for LFP. Solid-state commercial timelines 2027-2030.",
    key_metrics: [
      { label: "Li-ion pack cost (2024)", value: "$115/kWh", trend: "down", source: "BloombergNEF", source_url: "https://about.bnef.com/energy-storage/", update_frequency: "Annual (BNEF Battery Price Survey, December)" },
      { label: "Class 8 EV range", value: "150-300 mi", trend: "up", source: "ICCT / OEM specifications", source_url: "https://theicct.org/sector/freight/", update_frequency: "Continuous (as OEMs release specs)" },
      { label: "MCS chargers deployed", value: "~200 globally", trend: "up", source: "CharIN MCS Working Group", source_url: "https://www.charin.global/", update_frequency: "Quarterly deployment reports" },
      { label: "EV truck TCO parity", value: "2026-2028 est.", trend: "down", source: "ICCT / RMI", source_url: "https://theicct.org/sector/freight/", update_frequency: "Annual analysis updates" },
    ],
    policy_signals: [
      { signal: "EU CO2 standards for HDVs (2030/2040 targets)", source: "EUR-Lex", source_url: "https://eur-lex.europa.eu" },
      { signal: "CARB Advanced Clean Trucks mandate", source: "CARB", source_url: "https://ww2.arb.ca.gov/our-work/programs/advanced-clean-trucks" },
      { signal: "UK ZEV mandate for trucks", source: "UK DfT", source_url: "https://www.gov.uk/government/organisations/department-for-transport" },
      { signal: "US IRA commercial vehicle credits", source: "IRS / Federal Register", source_url: "https://www.federalregister.gov" },
    ],
    freight_relevance: "Direct impact on drayage and last-mile delivery fleet. MCS infrastructure determines viability of long-haul electric. Key for warehouse-to-port corridors.",
  },
  {
    id: "saf",
    label: "Sustainable Aviation Fuel",
    icon: Fuel,
    description: "SAF production capacity by feedstock pathway (HEFA, Fischer-Tropsch, alcohol-to-jet, e-fuels), cost premium by region, and mandate compliance timelines.",
    modes: ["air"],
    trl_range: "TRL 8-9 (HEFA deployed, PtL scaling)",
    cost_trajectory: "HEFA SAF at 2-3x conventional jet fuel. E-fuel/PtL at 5-8x but declining. Production capacity lagging mandate volumes.",
    key_metrics: [
      { label: "Global SAF production (2024)", value: "~0.5Mt", trend: "up", source: "IEA / ICAO", source_url: "https://www.iea.org/energy-system/transport/aviation", update_frequency: "Annual (IEA World Energy Outlook)" },
      { label: "SAF % of jet fuel", value: "<1%", trend: "up", source: "IATA", source_url: "https://www.iata.org/en/programs/environment/sustainable-aviation-fuels/", update_frequency: "Annual" },
      { label: "HEFA premium vs conventional", value: "2-3x", trend: "down", source: "ICCT", source_url: "https://theicct.org/sector/freight/", update_frequency: "Annual cost analysis" },
      { label: "ReFuelEU 2025 mandate", value: "2%", trend: "up", source: "EUR-Lex (Reg. 2023/2405)", source_url: "https://eur-lex.europa.eu/eli/reg/2023/2405/oj", update_frequency: "Fixed legislative schedule" },
    ],
    policy_signals: [
      { signal: "ReFuelEU Aviation: 2% (2025) → 6% (2030) → 70% (2050)", source: "EUR-Lex", source_url: "https://eur-lex.europa.eu/eli/reg/2023/2405/oj" },
      { signal: "UK SAF mandate: 2% (2025) → 10% (2030) → 50% (2050)", source: "UK DfT", source_url: "https://www.gov.uk/government/publications/sustainable-aviation-fuel-mandate" },
      { signal: "ICAO CORSIA eligible fuels list", source: "ICAO", source_url: "https://www.icao.int/CORSIA" },
      { signal: "US IRA SAF tax credit ($1.25-1.75/gal)", source: "IRS", source_url: "https://www.irs.gov/credits-deductions/businesses/sustainable-aviation-fuel-credit" },
    ],
    freight_relevance: "Air cargo rates directly affected by SAF blend mandates. Carriers pass through SAF costs as surcharges. Clients requesting SAF certificates for Scope 3 reporting.",
  },
  {
    id: "hydrogen",
    label: "Green Hydrogen",
    icon: Wind,
    description: "Green H2 cost curves by production pathway, refueling infrastructure by corridor, and application readiness for heavy transport and marine fuels.",
    modes: ["road", "ocean"],
    trl_range: "TRL 5-7 (production proven, distribution scaling)",
    cost_trajectory: "Green H2 at $4-6/kg (2024). Target <$2/kg by 2030 for transport competitiveness. Infrastructure is the bottleneck.",
    key_metrics: [
      { label: "Green H2 cost (2024)", value: "$4-6/kg", trend: "down", source: "IEA Global Hydrogen Review", source_url: "https://www.iea.org/reports/global-hydrogen-review-2025", update_frequency: "Annual (IEA flagship report)" },
      { label: "Electrolyzer capacity (2024)", value: "~4 GW global", trend: "up", source: "IEA Global Hydrogen Review", source_url: "https://www.iea.org/reports/global-hydrogen-review-2025", update_frequency: "Annual" },
      { label: "H2 refueling stations", value: "~1,000 global", trend: "up", source: "IEA / H2 Council", source_url: "https://hydrogencouncil.com/", update_frequency: "Annual deployment count" },
      { label: "H2 truck models available", value: "3-5 OEMs", trend: "up", source: "ICCT / OEM announcements", source_url: "https://theicct.org/sector/freight/", update_frequency: "Continuous" },
    ],
    policy_signals: [
      { signal: "EU Hydrogen Strategy: 10Mt domestic + 10Mt import by 2030", source: "European Commission", source_url: "https://ec.europa.eu/commission/presscorner/home/en" },
      { signal: "US DOE Hydrogen Shot: $1/kg target", source: "US DOE", source_url: "https://www.energy.gov/eere/fuelcells/hydrogen-shot" },
      { signal: "Japan Green Growth Strategy: hydrogen backbone", source: "METI", source_url: "https://www.meti.go.jp/english/" },
      { signal: "IMO alternative fuels framework includes hydrogen carriers", source: "IMO", source_url: "https://www.imo.org" },
    ],
    freight_relevance: "Long-haul trucking alternative where battery-electric range is insufficient. Marine fuel pathway via ammonia/methanol. Infrastructure corridor development determines route planning.",
  },
  {
    id: "marine-fuels",
    label: "Marine Alternative Fuels",
    icon: Ship,
    description: "Ammonia, methanol, biofuels, LNG — vessel order books, fuel availability by port, and FuelEU Maritime compliance pathways.",
    modes: ["ocean"],
    trl_range: "TRL 6-8 (LNG deployed, ammonia/methanol scaling)",
    cost_trajectory: "LNG established but transitional. Green methanol at 2-4x conventional. Ammonia infrastructure nascent. Dual-fuel vessels ordered at record pace.",
    key_metrics: [
      { label: "Alt-fuel capable orders (2024)", value: "~45% of new tonnage", trend: "up", source: "DNV Alternative Fuels Insight", source_url: "https://www.dnv.com/services/alternative-fuels-insight/", update_frequency: "Quarterly order book updates" },
      { label: "Methanol-ready vessels", value: "~200 on order", trend: "up", source: "DNV / Clarksons", source_url: "https://www.dnv.com/services/alternative-fuels-insight/", update_frequency: "Quarterly" },
      { label: "LNG bunker ports", value: "~200 globally", trend: "up", source: "SEA-LNG / DNV", source_url: "https://sea-lng.org/", update_frequency: "Quarterly" },
      { label: "Green methanol premium", value: "2-4x conv.", trend: "down", source: "IRENA / Methanol Institute", source_url: "https://www.irena.org/Publications", update_frequency: "Annual" },
    ],
    policy_signals: [
      { signal: "FuelEU Maritime: GHG intensity limits from 2025", source: "EUR-Lex (Reg. 2023/1805)", source_url: "https://eur-lex.europa.eu/eli/reg/2023/1805/oj" },
      { signal: "IMO Net-Zero Framework fuel standard", source: "IMO", source_url: "https://www.imo.org/en/ourwork/environment/pages/2023-imo-strategy-on-reduction-of-ghg-emissions-from-ships.aspx" },
      { signal: "EU ETS maritime: phased surrender obligation", source: "EC DG CLIMA", source_url: "https://climate.ec.europa.eu/eu-action/transport-decarbonisation/reducing-emissions-shipping-sector_en" },
      { signal: "Getting to Zero Coalition green corridors", source: "Global Maritime Forum", source_url: "https://www.getzerocoalition.org/" },
    ],
    freight_relevance: "Carrier fuel choices directly impact surcharge structures. Green corridor availability affects routing. FuelEU penalties passed through to shippers.",
  },
  {
    id: "solar-bess",
    label: "Rooftop Solar & Battery Storage",
    icon: Sun,
    description: "Commercial/industrial rooftop solar permitting, ROI by jurisdiction, and battery energy storage systems for warehouse and facility optimization.",
    modes: ["air", "road", "ocean"],
    trl_range: "TRL 9 (fully deployed)",
    cost_trajectory: "Solar PV LCOE at historic lows. BESS costs declining 10-15% annually. Warehouse rooftop solar ROI typically 4-7 years depending on jurisdiction.",
    key_metrics: [
      { label: "Utility-scale solar LCOE", value: "$0.03-0.05/kWh", trend: "down", source: "IRENA Renewable Power Generation Costs", source_url: "https://www.irena.org/Energy-Transition/Technology/Power-generation-costs", update_frequency: "Annual (July publication)" },
      { label: "BESS cost (2024)", value: "$150-200/kWh", trend: "down", source: "BloombergNEF", source_url: "https://about.bnef.com/energy-storage/", update_frequency: "Annual (December battery price survey)" },
      { label: "Commercial solar ROI", value: "4-7 years", trend: "down", source: "NREL / IRENA", source_url: "https://pvwatts.nrel.gov", update_frequency: "Continuous (model updates)" },
      { label: "Global solar capacity added (2024)", value: "~440 GW", trend: "up", source: "IRENA Data Portal", source_url: "https://www.irena.org/Data", update_frequency: "Annual (March capacity data)" },
    ],
    policy_signals: [
      { signal: "DEWA Shams Dubai: commercial net metering (verify current status)", source: "DEWA", source_url: "https://www.dewa.gov.ae/en/consumers/innovation/shams-dubai" },
      { signal: "EU Energy Performance of Buildings Directive (EPBD recast)", source: "EUR-Lex", source_url: "https://eur-lex.europa.eu" },
      { signal: "US IRA Investment Tax Credit (30%)", source: "US DOE", source_url: "https://www.energy.gov/eere/solar/federal-solar-tax-credits-businesses" },
      { signal: "Various national feed-in tariffs and net metering programs", source: "IEA Policies Database", source_url: "https://www.iea.org/policies/about" },
    ],
    freight_relevance: "Warehouse electricity cost reduction. On-site charging infrastructure for EV fleet. Client sustainability requirements for facility operations. Green building certifications.",
  },
  {
    id: "autonomous-freight",
    label: "Autonomous Freight",
    icon: Truck,
    description: "Regulatory status of autonomous trucking by jurisdiction, commercial deployment timelines, and infrastructure readiness.",
    modes: ["road"],
    trl_range: "TRL 6-7 (limited commercial deployment)",
    cost_trajectory: "Hub-to-hub autonomous trucking approaching commercial viability on select US corridors. Last-mile autonomy still 5+ years out.",
    key_metrics: [
      { label: "Autonomous truck permits (US)", value: "TX, NM, AZ active", trend: "up", source: "State DOTs / FMCSA", source_url: "https://www.fmcsa.dot.gov/", update_frequency: "Ad hoc (state permit announcements)" },
      { label: "Commercial deployments", value: "3-5 operators", trend: "up", source: "Industry announcements / FreightWaves", source_url: "https://www.freightwaves.com/news/category/autonomous", update_frequency: "Continuous" },
      { label: "EU regulatory framework", value: "In development", trend: "stable", source: "European Commission", source_url: "https://ec.europa.eu/commission/presscorner/home/en", update_frequency: "Ad hoc (legislative process)" },
      { label: "Driver cost share of trucking", value: "~35-40%", trend: "stable", source: "American Trucking Associations", source_url: "https://www.trucking.org/", update_frequency: "Annual cost analysis" },
    ],
    policy_signals: [
      { signal: "US state-by-state permit framework (no federal standard)", source: "FMCSA / State DOTs", source_url: "https://www.fmcsa.dot.gov/" },
      { signal: "EU Automated Vehicles Regulation (in progress)", source: "European Commission", source_url: "https://ec.europa.eu/commission/presscorner/home/en" },
      { signal: "UK Automated Vehicles Act 2024", source: "UK legislation.gov.uk", source_url: "https://www.legislation.gov.uk/" },
      { signal: "China highway pilot programs", source: "MIIT / MOT China", source_url: "https://www.miit.gov.cn/" },
    ],
    freight_relevance: "Long-term labor cost and capacity planning. Route planning for autonomous-capable corridors. Insurance and liability framework implications.",
  },
];

// ── Tech Category Card ──

function TechCategoryCard({ category }: { category: TechCategory }) {
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
        className="w-full flex items-start gap-4 p-4 text-left cursor-pointer hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: "var(--color-active-bg)" }}
        >
          <Icon size={20} style={{ color: "var(--color-primary)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {category.label}
            </h3>
            <ChevronDown
              size={14}
              className={cn("shrink-0 transition-transform duration-200", expanded && "rotate-180")}
              style={{ color: "var(--color-text-muted)" }}
            />
          </div>
          <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>
            {category.description}
          </p>
          <div className="flex items-center gap-2 mt-2">
            {category.modes.map((m) => (
              <span
                key={m}
                className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md"
                style={{
                  color: "var(--color-text-secondary)",
                  backgroundColor: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {m}
              </span>
            ))}
            <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              {category.trl_range}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          {/* Key Metrics */}
          <div className="pt-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Key Metrics
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {category.key_metrics.map((metric, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg"
                  style={{ backgroundColor: "var(--color-surface-raised)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                      {metric.label}
                    </span>
                    <TrendingUp
                      size={10}
                      style={{
                        color: metric.trend === "down" ? "var(--color-success)" : metric.trend === "up" ? "var(--color-primary)" : "var(--color-text-muted)",
                        transform: metric.trend === "down" ? "rotate(180deg)" : metric.trend === "stable" ? "rotate(0deg)" : undefined,
                      }}
                    />
                  </div>
                  <div className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: "var(--color-text-primary)" }}>
                    {metric.value}
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                    <a
                      href={metric.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {metric.source}
                    </a>
                    <span>{metric.update_frequency}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cost Trajectory */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Cost Trajectory
            </span>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
              {category.cost_trajectory}
            </p>
          </div>

          {/* Policy Signals */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Policy Acceleration Signals
            </span>
            <ul className="mt-1 space-y-1.5">
              {category.policy_signals.map((ps, i) => (
                <li key={i} className="text-xs flex items-start gap-2" style={{ color: "var(--color-text-secondary)" }}>
                  <AlertCircle size={10} className="shrink-0 mt-0.5" style={{ color: "var(--color-primary)" }} />
                  <div>
                    <span>{ps.signal}</span>
                    <a
                      href={ps.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1.5 text-[10px] hover:underline"
                      style={{ color: "var(--color-primary)" }}
                    >
                      ({ps.source})
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Freight Relevance */}
          <div
            className="p-3 rounded-lg border-l-3"
            style={{
              backgroundColor: "var(--color-active-bg)",
              borderLeftWidth: 3,
              borderLeftColor: "var(--color-primary)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>
              Freight Forwarding Relevance
            </span>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-primary)" }}>
              {category.freight_relevance}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export function TechnologyTracker() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Energy & Technology Innovation
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Category-level tracking across transport energy and technology. Cost curves, deployment status, and policy signals.
        </p>
      </div>

      <div className="space-y-3">
        {TECH_CATEGORIES.map((cat) => (
          <TechCategoryCard key={cat.id} category={cat} />
        ))}
      </div>
    </div>
  );
}
