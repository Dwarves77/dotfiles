"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  TrendingUp, TrendingDown, Minus, BarChart3,
  ChevronDown, AlertTriangle, Globe, Ship, ExternalLink,
} from "lucide-react";

// ── Market Signal Categories ──

interface Indicator {
  name: string;
  what_it_measures: string;
  unit: string;
  update_frequency: string;
  source: string;
  source_url: string;
  trend: "up" | "down" | "stable" | "volatile";
  why_it_matters: string;
}

interface MarketSignal {
  id: string;
  category: string;
  label: string;
  description: string;
  indicators: Indicator[];
  active_risks: string[];
}

const MARKET_SIGNALS: MarketSignal[] = [
  {
    id: "crude-fuel",
    category: "Energy Prices",
    label: "Crude Oil & Jet Fuel",
    description: "Brent crude, WTI, and jet fuel spot prices by hub. Direct input to air and ocean freight surcharges.",
    indicators: [
      { name: "Brent crude", what_it_measures: "International crude oil benchmark price per barrel, used to set bunker fuel costs for ocean shipping globally", unit: "USD/barrel", update_frequency: "Daily", source: "US Energy Information Administration", source_url: "https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm", trend: "volatile", why_it_matters: "Directly determines bunker fuel surcharges on every ocean freight invoice. A $10/bbl move translates to roughly $15-25 per TEU on major trade lanes." },
      { name: "Jet fuel (Singapore)", what_it_measures: "Kerosene-type jet fuel spot price at Singapore hub — benchmark for Asia-Pacific air cargo fuel surcharges", unit: "USD/gallon", update_frequency: "Daily", source: "US Energy Information Administration", source_url: "https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm", trend: "volatile", why_it_matters: "Sets the fuel surcharge for all air cargo moving through Asia-Pacific. Singapore MOPS is the reference price for most Asian carriers." },
      { name: "Jet fuel (NWE)", what_it_measures: "Kerosene-type jet fuel spot price at Northwest Europe hub — benchmark for European air cargo fuel surcharges", unit: "USD/gallon", update_frequency: "Daily", source: "US Energy Information Administration", source_url: "https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm", trend: "volatile", why_it_matters: "Reference price for European carrier fuel surcharges. Transatlantic and intra-European air cargo rates index to this." },
      { name: "Jet fuel (US Gulf)", what_it_measures: "Kerosene-type jet fuel spot price at US Gulf Coast — benchmark for US domestic and Americas air cargo", unit: "USD/gallon", update_frequency: "Daily", source: "US Energy Information Administration", source_url: "https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm", trend: "volatile", why_it_matters: "Sets the fuel surcharge for US domestic air freight and Americas outbound cargo." },
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
      { name: "EU ETS (EUA)", what_it_measures: "Price per tonne of CO2 under the EU Emissions Trading System — the carbon cost carriers must surrender for EU maritime and aviation emissions", unit: "EUR/tCO2", update_frequency: "Quarterly (ICAP report), daily via exchanges", source: "ICAP Allowance Price Explorer", source_url: "https://icapcarbonaction.com/en/ets-prices", trend: "volatile", why_it_matters: "Maritime ETS: carriers surrender EUAs for EU port-to-port and 50% of inbound/outbound voyages. This cost is passed through as a carbon surcharge on every ocean shipment touching EU ports." },
      { name: "UK ETS (UKA)", what_it_measures: "Price per tonne of CO2 under the UK Emissions Trading System — separate from EU ETS post-Brexit", unit: "GBP/tCO2", update_frequency: "Quarterly", source: "ICAP Allowance Price Explorer", source_url: "https://icapcarbonaction.com/en/ets-prices", trend: "volatile", why_it_matters: "UK aviation and maritime carbon cost. Different price from EU ETS — creates split surcharge structures on UK vs EU routes." },
      { name: "California (CCA)", what_it_measures: "Price per tonne of CO2 under the California Cap-and-Trade Program — affects CARB-regulated trucking fleets", unit: "USD/tCO2", update_frequency: "Quarterly", source: "ICAP Allowance Price Explorer", source_url: "https://icapcarbonaction.com/en/ets-prices", trend: "up", why_it_matters: "Trucking operators in California and Section 177 states face carbon costs that flow through to drayage and last-mile delivery rates." },
      { name: "Korea ETS (KAU)", what_it_measures: "Price per tonne of CO2 under the Korean Emissions Trading Scheme — Asia's largest carbon market", unit: "KRW/tCO2", update_frequency: "Quarterly", source: "ICAP Allowance Price Explorer", source_url: "https://icapcarbonaction.com/en/ets-prices", trend: "stable", why_it_matters: "Affects carbon exposure on Korea trade lanes. Korean carriers may pass through costs as fleet decarbonization accelerates." },
      { name: "Singapore carbon tax", what_it_measures: "Fixed carbon tax per tonne of CO2 on facilities emitting 25,000+ tCO2/year — rising trajectory legislated", unit: "SGD/tCO2", update_frequency: "Annual (legislated schedule)", source: "Singapore Government", source_url: "https://www.greenplan.gov.sg/", trend: "up", why_it_matters: "Currently S$25/tCO2e, rising to S$50-80 by 2030. Affects warehouse and port facility costs in Singapore. Signal for broader ASEAN carbon pricing." },
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
      { name: "Dutch TTF", what_it_measures: "Title Transfer Facility natural gas price — Europe's benchmark gas price, drives EU electricity costs and energy policy urgency", unit: "EUR/MWh", update_frequency: "Daily", source: "US Energy Information Administration", source_url: "https://www.eia.gov/dnav/ng/ng_pri_fut_s1_d.htm", trend: "volatile", why_it_matters: "When TTF spikes, EU electricity costs rise, warehouse operating costs increase, and political pressure for energy transition accelerates — driving faster regulatory timelines." },
      { name: "JKM (Asia LNG)", what_it_measures: "Japan-Korea Marker — the LNG spot price benchmark for Asia-Pacific, the world's largest LNG import region", unit: "USD/MMBtu", update_frequency: "Daily", source: "US Energy Information Administration", source_url: "https://www.eia.gov/dnav/ng/ng_pri_fut_s1_d.htm", trend: "volatile", why_it_matters: "Drives energy costs across Asia-Pacific logistics operations. Also relevant for LNG-fueled vessels operating in the region." },
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
      { name: "Propylene", what_it_measures: "Feedstock price for polypropylene — used in strapping, containers, protective packaging, and pallet wrapping", unit: "USD/tonne", update_frequency: "Weekly (ICIS), quarterly averages", source: "ICIS / S&P Global Platts", source_url: "https://www.icis.com/explore/commodities/chemicals/propylene/", trend: "stable", why_it_matters: "When propylene rises, the cost of protective packaging, strapping, and plastic crating materials rises across all freight sectors." },
      { name: "Ethylene", what_it_measures: "Feedstock price for polyethylene — used in stretch film, bubble wrap, foam inserts, and poly bags", unit: "USD/tonne", update_frequency: "Weekly (ICIS), quarterly averages", source: "ICIS / S&P Global Platts", source_url: "https://www.icis.com/explore/commodities/chemicals/ethylene/", trend: "stable", why_it_matters: "PE film and foam are in virtually every shipment. Price moves affect packaging costs industry-wide." },
      { name: "Methanol", what_it_measures: "Price of methanol — both a marine fuel alternative (green methanol) and a feedstock for adhesives and coatings used in packaging", unit: "USD/tonne", update_frequency: "Weekly (ICIS), quarterly averages", source: "ICIS / S&P Global Platts", source_url: "https://www.icis.com/explore/commodities/chemicals/methanol/", trend: "up", why_it_matters: "Dual relevance: rising methanol demand for maritime fuel (green methanol vessels on order) AND packaging material input costs." },
    ],
    active_risks: [
      "EU PPWR recyclability requirements may shift material demand patterns",
    ],
  },
  {
    id: "critical-minerals",
    category: "Critical Minerals",
    label: "EV Supply Chain Minerals",
    description: "Lithium, cobalt, nickel, rare earths. EV and battery supply chain cost and availability indicators.",
    indicators: [
      { name: "Lithium carbonate", what_it_measures: "Price of battery-grade lithium carbonate — the primary cost driver for lithium-ion batteries used in EVs and energy storage", unit: "USD/tonne", update_frequency: "Weekly spot, quarterly contract", source: "IRENA / Bloomberg", source_url: "https://www.irena.org/Energy-Transition/Technology/Power-generation-costs", trend: "down", why_it_matters: "Lithium cost decline drives EV and BESS affordability. When battery costs drop, fleet electrification becomes viable sooner — affecting trucking fleet transition timelines." },
      { name: "Cobalt", what_it_measures: "Price of cobalt — used in NMC battery cathodes. Industry is shifting to cobalt-free LFP chemistry but cobalt remains in high-energy-density applications", unit: "USD/lb", update_frequency: "Daily (LME), quarterly averages", source: "IRENA / Bloomberg", source_url: "https://www.irena.org/Energy-Transition/Technology/Power-generation-costs", trend: "down", why_it_matters: "Cobalt price and supply concentration (60%+ from DRC) affect EV battery costs and create ethical sourcing pressure for fleet procurement." },
      { name: "Nickel", what_it_measures: "Price of Class 1 nickel — used in high-energy NMC batteries and stainless steel (container construction)", unit: "USD/tonne", update_frequency: "Daily (LME)", source: "IRENA / Bloomberg", source_url: "https://www.irena.org/Energy-Transition/Technology/Power-generation-costs", trend: "volatile", why_it_matters: "Dual impact: battery costs for EV transition AND stainless steel costs for container and equipment manufacturing." },
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
    description: "Strait of Hormuz, Suez Canal, Panama Canal — congestion and disruption monitoring for global trade lane routing.",
    indicators: [
      { name: "Strait of Hormuz", what_it_measures: "Daily tanker and cargo vessel transits through the 21-mile-wide strait between Iran and Oman — 20% of global oil supply passes through here", unit: "Vessels/day", update_frequency: "Real-time (AIS data)", source: "MarineTraffic", source_url: "https://www.marinetraffic.com", trend: "volatile", why_it_matters: "Any disruption here spikes oil prices within hours and reroutes Persian Gulf trade lanes around the Cape of Good Hope, adding 10-15 days transit time." },
      { name: "Suez Canal", what_it_measures: "Daily transits through the Suez Canal — the primary Asia-Europe shipping corridor handling 12-15% of global trade", unit: "Vessels/day", update_frequency: "Real-time (AIS data)", source: "MarineTraffic / Suez Canal Authority", source_url: "https://www.marinetraffic.com", trend: "stable", why_it_matters: "Disruption forces Cape of Good Hope routing: +7-10 days transit, +$1M fuel per voyage for large vessels. Directly affects Asia-Europe freight rates and schedules." },
      { name: "Panama Canal drafts", what_it_measures: "Maximum vessel draft allowed through Panama Canal locks — restricted during drought, affecting vessel capacity on Americas trade lanes", unit: "Feet (draft restriction)", update_frequency: "Daily (ACP announcements)", source: "Panama Canal Authority", source_url: "https://pancanal.com/en/", trend: "stable", why_it_matters: "Draft restrictions force vessels to lighten loads or reroute via Suez/Cape Horn. Affects US East Coast ↔ Asia capacity and rates. 2023-24 drought cut daily transits by 36%." },
    ],
    active_risks: [
      "Strait of Hormuz: active geopolitical tension — monitor for normalization",
      "Red Sea/Houthi disruption residual impact on routing and war risk insurance premiums",
    ],
  },
  {
    id: "trade-restrictions",
    category: "Trade Restrictions",
    label: "Trade & Industrial Policy",
    description: "Tariffs, subsidies, and trade-embedded climate instruments affecting freight routing and procurement.",
    indicators: [
      { name: "EU EV tariffs on China", what_it_measures: "EU countervailing duties on Chinese-manufactured electric vehicles and batteries — ranges from 7.8% to 35.3% depending on manufacturer", unit: "% tariff rate", update_frequency: "Ad hoc (EU Commission decisions)", source: "European Commission Press Corner", source_url: "https://ec.europa.eu/commission/presscorner/home/en", trend: "up", why_it_matters: "Changes EV and battery procurement economics for fleet electrification. May redirect supply chains through non-Chinese manufacturing to avoid tariffs." },
      { name: "US IRA domestic content", what_it_measures: "Domestic content requirements for Inflation Reduction Act clean energy tax credits — percentage of components that must be US-manufactured", unit: "% domestic content required", update_frequency: "Annual (IRS guidance updates)", source: "Federal Register", source_url: "https://www.federalregister.gov", trend: "stable", why_it_matters: "Affects sourcing for solar panels, batteries, and EV components used in warehouse and fleet projects. Non-compliant sourcing loses the tax credit." },
      { name: "EU CBAM", what_it_measures: "Carbon Border Adjustment Mechanism — requires importers to pay the equivalent of EU ETS carbon price on embedded emissions in steel, aluminium, cement, fertiliser, hydrogen, and electricity", unit: "EUR/tCO2 (linked to EUA price)", update_frequency: "Quarterly reporting (transitional), annual surrender (from 2026)", source: "EC CBAM Portal", source_url: "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en", trend: "up", why_it_matters: "From 2026, EU importers bear the full carbon cost. Freight forwarders handling covered goods must verify CBAM declarant registration and emissions data. Affects customs clearance workflows." },
    ],
    active_risks: [
      "CBAM full application 2026 — importers bear carbon cost, customs documentation changes",
      "US-China trade tension affecting logistics routing decisions across Pacific",
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
          <div className="pt-3 space-y-3">
            {signal.indicators.map((ind, i) => (
              <div
                key={i}
                className="p-3 rounded-lg space-y-2"
                style={{ backgroundColor: "var(--color-surface-raised)" }}
              >
                {/* Header: name + trend + unit */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {ind.name}
                    </span>
                    {trendIcon(ind.trend)}
                  </div>
                  <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
                    {ind.unit}
                  </span>
                </div>

                {/* What it measures */}
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                  {ind.what_it_measures}
                </p>

                {/* Why it matters to freight */}
                <div
                  className="p-2 rounded border-l-2"
                  style={{
                    borderLeftColor: "var(--color-primary)",
                    backgroundColor: "var(--color-active-bg)",
                  }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-primary)" }}>
                    Why this matters
                  </span>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-primary)" }}>
                    {ind.why_it_matters}
                  </p>
                </div>

                {/* Source + frequency */}
                <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  <a
                    href={ind.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline flex items-center gap-1"
                    style={{ color: "var(--color-primary)" }}
                  >
                    <ExternalLink size={9} />
                    {ind.source}
                  </a>
                  <span>Updates: {ind.update_frequency}</span>
                </div>
              </div>
            ))}
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
