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
  key_metrics: { label: string; value: string; trend: "up" | "down" | "stable" }[];
  policy_signals: string[];
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
      { label: "Li-ion pack cost (2024)", value: "$115/kWh", trend: "down" },
      { label: "Class 8 EV range", value: "150-300 mi", trend: "up" },
      { label: "MCS chargers deployed", value: "~200 globally", trend: "up" },
      { label: "EV truck TCO parity", value: "2026-2028 est.", trend: "down" },
    ],
    policy_signals: [
      "EU CO2 standards for HDVs (2030/2040 targets)",
      "CARB Advanced Clean Trucks mandate",
      "UK ZEV mandate for trucks",
      "US IRA commercial vehicle credits",
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
      { label: "Global SAF production (2024)", value: "~0.5Mt", trend: "up" },
      { label: "SAF % of jet fuel", value: "<1%", trend: "up" },
      { label: "HEFA premium", value: "2-3x conv.", trend: "down" },
      { label: "ReFuelEU 2025 mandate", value: "2%", trend: "up" },
    ],
    policy_signals: [
      "ReFuelEU Aviation: 2% (2025) → 6% (2030) → 70% (2050)",
      "UK SAF mandate: 2% (2025) → 10% (2030) → 50% (2050)",
      "ICAO CORSIA eligible fuels list",
      "US IRA SAF tax credit ($1.25-1.75/gal)",
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
      { label: "Green H2 cost (2024)", value: "$4-6/kg", trend: "down" },
      { label: "Electrolyzer capacity (2024)", value: "~4 GW global", trend: "up" },
      { label: "H2 refueling stations", value: "~1,000 global", trend: "up" },
      { label: "H2 truck models available", value: "3-5 OEMs", trend: "up" },
    ],
    policy_signals: [
      "EU Hydrogen Strategy: 10Mt domestic + 10Mt import by 2030",
      "US DOE Hydrogen Shot: $1/kg target",
      "Japan Green Growth Strategy: hydrogen backbone",
      "IMO alternative fuels framework includes hydrogen carriers",
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
      { label: "Alt-fuel capable orders (2024)", value: "~45% of new tonnage", trend: "up" },
      { label: "Methanol-ready vessels", value: "~200 on order", trend: "up" },
      { label: "LNG bunker ports", value: "~200 globally", trend: "up" },
      { label: "Green methanol premium", value: "2-4x conv.", trend: "down" },
    ],
    policy_signals: [
      "FuelEU Maritime: GHG intensity limits from 2025",
      "IMO Net-Zero Framework fuel standard",
      "EU ETS maritime: phased surrender obligation",
      "Getting to Zero Coalition green corridors",
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
      { label: "Utility-scale solar LCOE", value: "$0.03-0.05/kWh", trend: "down" },
      { label: "BESS cost (2024)", value: "$150-200/kWh", trend: "down" },
      { label: "Commercial solar ROI", value: "4-7 years", trend: "down" },
      { label: "Global solar capacity added (2024)", value: "~440 GW", trend: "up" },
    ],
    policy_signals: [
      "DEWA Shams Dubai: commercial net metering (verify current status)",
      "EU Energy Performance of Buildings Directive",
      "US IRA Investment Tax Credit (30%)",
      "Various national feed-in tariffs and net metering programs",
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
      { label: "Autonomous truck permits (US)", value: "TX, NM, AZ active", trend: "up" },
      { label: "Commercial deployments", value: "3-5 operators", trend: "up" },
      { label: "EU regulatory framework", value: "In development", trend: "stable" },
      { label: "Driver cost share of trucking", value: "~35-40%", trend: "stable" },
    ],
    policy_signals: [
      "US state-by-state permit framework (no federal standard)",
      "EU Automated Vehicles Regulation (in progress)",
      "UK Automated Vehicles Act 2024",
      "China highway pilot programs",
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
            <div className="grid grid-cols-2 gap-2 mt-2">
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
            <ul className="mt-1 space-y-1">
              {category.policy_signals.map((signal, i) => (
                <li key={i} className="text-xs flex items-start gap-2" style={{ color: "var(--color-text-secondary)" }}>
                  <AlertCircle size={10} className="shrink-0 mt-0.5" style={{ color: "var(--color-primary)" }} />
                  {signal}
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
