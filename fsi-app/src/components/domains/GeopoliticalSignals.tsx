"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  TrendingUp, TrendingDown, Minus, BarChart3,
  ChevronDown, AlertTriangle, Globe, Ship,
} from "lucide-react";

// ── Market Signal Categories ──

interface MarketSignal {
  id: string;
  category: string;
  label: string;
  description: string;
  indicators: {
    name: string;
    value: string;
    source: string;
    trend: "up" | "down" | "stable" | "volatile";
    freight_impact: string;
  }[];
  active_risks: string[];
}

const MARKET_SIGNALS: MarketSignal[] = [
  {
    id: "crude-fuel",
    category: "Energy Prices",
    label: "Crude Oil & Jet Fuel",
    description: "Brent crude, WTI, and jet fuel spot prices by hub. Direct input to air and ocean freight surcharges.",
    indicators: [
      { name: "Brent crude", value: "Monitor via EIA", source: "US EIA", trend: "volatile", freight_impact: "Bunker fuel surcharges, carrier pricing" },
      { name: "Jet fuel (Singapore)", value: "Monitor via EIA", source: "US EIA", trend: "volatile", freight_impact: "Air cargo fuel surcharges" },
      { name: "Jet fuel (NWE)", value: "Monitor via EIA", source: "US EIA", trend: "volatile", freight_impact: "European air cargo rates" },
      { name: "Jet fuel (US Gulf)", value: "Monitor via EIA", source: "US EIA", trend: "volatile", freight_impact: "US domestic air freight" },
    ],
    active_risks: [
      "Strait of Hormuz tanker traffic disruption — active monitoring required",
      "OPEC+ production cuts affecting baseline prices",
    ],
  },
  {
    id: "carbon-markets",
    category: "Carbon Markets",
    label: "Carbon Allowance Prices",
    description: "ETS allowance prices across 38 systems worldwide. Direct cost input for EU maritime ETS, aviation ETS, and CBAM.",
    indicators: [
      { name: "EU ETS (EUA)", value: "Monitor via ICAP", source: "ICAP", trend: "volatile", freight_impact: "Maritime ETS surrender cost, CBAM reference price" },
      { name: "UK ETS (UKA)", value: "Monitor via ICAP", source: "ICAP", trend: "volatile", freight_impact: "UK aviation/maritime carbon cost" },
      { name: "California (CCA)", value: "Monitor via ICAP", source: "ICAP", trend: "up", freight_impact: "CARB compliance cost for trucking" },
      { name: "Korea ETS", value: "Monitor via ICAP", source: "ICAP", trend: "stable", freight_impact: "Asia trade lane carbon exposure" },
      { name: "Singapore carbon tax", value: "S$25/tCO2e (2024)", source: "Singapore Gov", trend: "up", freight_impact: "Rising to S$50-80 by 2030" },
    ],
    active_risks: [
      "EU ETS price volatility affecting carrier surcharge predictability",
      "CBAM full application from 2026 — import carbon cost pass-through",
    ],
  },
  {
    id: "lng-gas",
    category: "Natural Gas",
    label: "LNG & Natural Gas",
    description: "Dutch TTF and JKM prices. EU regulatory urgency driver — high gas prices accelerate decarbonization policy.",
    indicators: [
      { name: "Dutch TTF", value: "Monitor via EIA", source: "US EIA", trend: "volatile", freight_impact: "EU electricity costs → warehouse ops" },
      { name: "JKM (Asia LNG)", value: "Monitor via EIA", source: "US EIA", trend: "volatile", freight_impact: "Asia-Pacific energy costs" },
    ],
    active_risks: [
      "EU-Russia gas decoupling ongoing — price floor uncertainty",
      "LNG as transitional marine fuel — regulatory classification risk",
    ],
  },
  {
    id: "petrochemicals",
    category: "Petrochemicals",
    label: "Packaging Material Inputs",
    description: "Propylene, ethylene, methanol prices. Proxy for packaging material costs affecting crating and protective materials.",
    indicators: [
      { name: "Propylene", value: "Track quarterly", source: "ICIS/Platts", trend: "stable", freight_impact: "Plastic packaging and protective material costs" },
      { name: "Ethylene", value: "Track quarterly", source: "ICIS/Platts", trend: "stable", freight_impact: "PE film, bubble wrap, foam pricing" },
      { name: "Methanol", value: "Track quarterly", source: "ICIS/Platts", trend: "up", freight_impact: "Marine fuel alternative + packaging feedstock" },
    ],
    active_risks: [
      "EU PPWR recyclability requirements may shift material demand",
    ],
  },
  {
    id: "critical-minerals",
    category: "Critical Minerals",
    label: "EV Supply Chain Minerals",
    description: "Lithium, cobalt, nickel, rare earths. EV and battery supply chain cost and availability indicators.",
    indicators: [
      { name: "Lithium carbonate", value: "Track quarterly", source: "Bloomberg/IRENA", trend: "down", freight_impact: "Battery cost trajectory for EV fleet transition" },
      { name: "Cobalt", value: "Track quarterly", source: "Bloomberg/IRENA", trend: "down", freight_impact: "Battery chemistry shift (LFP vs NMC)" },
      { name: "Nickel", value: "Track quarterly", source: "Bloomberg/IRENA", trend: "volatile", freight_impact: "Battery and stainless steel costs" },
    ],
    active_risks: [
      "EU tariffs on Chinese EVs/batteries — supply chain cost impact",
      "US IRA domestic content rules — procurement implications",
      "DRC cobalt supply concentration — ethical sourcing risk",
    ],
  },
  {
    id: "shipping-chokepoints",
    category: "Shipping Chokepoints",
    label: "Maritime Chokepoints",
    description: "Strait of Hormuz, Suez Canal, Panama Canal, Malacca Strait — congestion and disruption monitoring.",
    indicators: [
      { name: "Strait of Hormuz transit", value: "Monitor via MarineTraffic", source: "MarineTraffic", trend: "volatile", freight_impact: "Oil tanker traffic; Persian Gulf trade lane risk" },
      { name: "Suez Canal traffic", value: "Monitor via MarineTraffic", source: "MarineTraffic", trend: "stable", freight_impact: "Asia-Europe trade lane transit time/cost" },
      { name: "Panama Canal drafts", value: "Monitor via ACP", source: "Panama Canal Authority", trend: "stable", freight_impact: "Americas trade lane capacity" },
    ],
    active_risks: [
      "Strait of Hormuz: active geopolitical tension — monitor for normalization",
      "Red Sea/Houthi disruption residual impact on routing",
    ],
  },
  {
    id: "trade-restrictions",
    category: "Trade Restrictions",
    label: "Trade & Industrial Policy",
    description: "EU tariffs on Chinese EVs/batteries, US IRA domestic content rules, and other trade-embedded climate instruments.",
    indicators: [
      { name: "EU EV tariffs on China", value: "Active", source: "EC Press", trend: "up", freight_impact: "Battery/EV procurement cost, supply chain routing" },
      { name: "US IRA domestic content", value: "Active", source: "Federal Register", trend: "stable", freight_impact: "Clean energy project sourcing requirements" },
      { name: "EU CBAM", value: "Transitional phase", source: "EC CBAM Portal", trend: "up", freight_impact: "Import carbon cost reporting and pass-through" },
    ],
    active_risks: [
      "CBAM full application 2026 — importers bear carbon cost",
      "US-China trade tension affecting logistics routing decisions",
    ],
  },
];

// ── Signal Card ──

function SignalCard({ signal }: { signal: MarketSignal }) {
  const [expanded, setExpanded] = useState(false);

  const trendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp size={10} style={{ color: "var(--color-error)" }} />;
      case "down": return <TrendingDown size={10} style={{ color: "var(--color-success)" }} />;
      case "stable": return <Minus size={10} style={{ color: "var(--color-text-muted)" }} />;
      case "volatile": return <BarChart3 size={10} style={{ color: "var(--color-warning)" }} />;
      default: return null;
    }
  };

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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md"
              style={{ color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-raised)", border: "1px solid var(--color-border)" }}>
              {signal.category}
            </span>
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {signal.label}
            </h3>
          </div>
          <p className="text-xs mt-1 line-clamp-1" style={{ color: "var(--color-text-secondary)" }}>
            {signal.description}
          </p>
        </div>
        {signal.active_risks.length > 0 && (
          <AlertTriangle size={14} style={{ color: "var(--color-warning)" }} />
        )}
        <ChevronDown
          size={14}
          className={cn("shrink-0 transition-transform duration-200", expanded && "rotate-180")}
          style={{ color: "var(--color-text-muted)" }}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: "var(--color-border-subtle)" }}>
          {/* Indicators */}
          <div className="pt-3 space-y-2">
            {signal.indicators.map((ind, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-lg"
                style={{ backgroundColor: "var(--color-surface-raised)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {ind.name}
                    </span>
                    {trendIcon(ind.trend)}
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    {ind.value}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                    {ind.source}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Freight impact */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              Freight Impact
            </span>
            <ul className="mt-1 space-y-1">
              {signal.indicators.map((ind, i) => (
                <li key={i} className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{ind.name}:</span>{" "}
                  {ind.freight_impact}
                </li>
              ))}
            </ul>
          </div>

          {/* Active Risks */}
          {signal.active_risks.length > 0 && (
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: "rgba(217, 119, 6, 0.06)",
                border: "1px solid rgba(217, 119, 6, 0.15)",
              }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-warning)" }}>
                <AlertTriangle size={10} className="inline mr-1" />
                Active Risks
              </span>
              <ul className="mt-1 space-y-1">
                {signal.active_risks.map((risk, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export function GeopoliticalSignals() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
          Geopolitical & Market Signals
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Commodity prices, carbon markets, trade restrictions, critical minerals, and shipping chokepoint monitoring.
        </p>
      </div>

      <div className="space-y-3">
        {MARKET_SIGNALS.map((signal) => (
          <SignalCard key={signal.id} signal={signal} />
        ))}
      </div>
    </div>
  );
}
