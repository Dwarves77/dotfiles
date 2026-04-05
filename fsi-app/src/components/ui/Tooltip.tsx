"use client";

import { useState } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-[11px] leading-relaxed rounded-md shadow-lg whitespace-normal max-w-xs z-50"
          style={{
            backgroundColor: "var(--color-invert-bg)",
            color: "var(--color-invert-text)",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}

// ── Acronym glossary ──
const ACRONYMS: Record<string, string> = {
  PPWR: "Packaging and Packaging Waste Regulation — EU rules on recyclability, reuse targets, and packaging material restrictions",
  CBAM: "Carbon Border Adjustment Mechanism — EU import carbon tax on steel, aluminium, cement, fertilisers, hydrogen, electricity",
  CII: "Carbon Intensity Indicator — IMO ship efficiency rating (A-E) affecting vessel operational restrictions",
  ETS: "Emissions Trading System — cap-and-trade carbon market where emitters buy allowances per tonne CO2",
  SAF: "Sustainable Aviation Fuel — drop-in jet fuel from non-fossil sources (waste oils, biomass, synthetic)",
  HEFA: "Hydroprocessed Esters and Fatty Acids — most common SAF production pathway using waste cooking oil",
  TRL: "Technology Readiness Level — 1 (basic research) to 9 (commercially proven and deployed)",
  MCS: "Megawatt Charging System — 1MW+ charging standard for heavy-duty electric trucks",
  CORSIA: "Carbon Offsetting and Reduction Scheme for International Aviation — ICAO global aviation carbon programme",
  CSRD: "Corporate Sustainability Reporting Directive — EU mandatory sustainability disclosure for large companies",
  ESRS: "European Sustainability Reporting Standards — the reporting standards under CSRD",
  EUDR: "EU Deforestation Regulation — due diligence requirements for commodities linked to deforestation",
  AFIR: "Alternative Fuels Infrastructure Regulation — EU mandates for EV charging and H2 refueling along TEN-T",
  GLEC: "Global Logistics Emissions Council — framework for consistent transport emissions accounting",
  GHG: "Greenhouse Gas — carbon dioxide, methane, nitrous oxide, and fluorinated gases",
  ISSB: "International Sustainability Standards Board — sets IFRS sustainability disclosure standards (S1/S2)",
  SBTi: "Science Based Targets initiative — validates corporate emissions reduction targets against Paris Agreement",
  LFP: "Lithium Iron Phosphate — battery chemistry: lower cost, longer life, but lower energy density than NMC",
  NMC: "Nickel Manganese Cobalt — battery chemistry: higher energy density but more expensive than LFP",
  BESS: "Battery Energy Storage System — commercial battery installation for peak demand shaving and grid services",
  TCO: "Total Cost of Ownership — full lifecycle cost including purchase, fuel, maintenance, and disposal",
  LCOE: "Levelized Cost of Energy — total lifetime cost of electricity generation divided by total energy produced",
  TTF: "Title Transfer Facility — Dutch natural gas benchmark, Europe's primary gas price reference",
  JKM: "Japan-Korea Marker — Asia-Pacific LNG spot price benchmark",
  IMO: "International Maritime Organization — UN agency regulating international shipping",
  ICAO: "International Civil Aviation Organization — UN agency setting international aviation standards",
  MEPC: "Marine Environment Protection Committee — IMO committee that adopts environmental regulations for shipping",
  EPR: "Extended Producer Responsibility — producers pay for end-of-life management of their packaging/products",
  ZEV: "Zero Emission Vehicle — vehicle producing no tailpipe emissions (battery electric or hydrogen fuel cell)",
  CARB: "California Air Resources Board — California's air quality and vehicle emissions regulator",
  RLS: "Row Level Security — database access control ensuring users only see data they're authorized for",
  PPA: "Power Purchase Agreement — long-term contract to buy electricity from a specific generator at agreed price",
  FuelEU: "FuelEU Maritime — EU regulation setting GHG intensity limits for energy used on ships at EU ports",
};

export function AcronymTooltip({ text }: { text: string }) {
  const definition = ACRONYMS[text.toUpperCase()];
  if (!definition) return <span>{text}</span>;
  return (
    <Tooltip content={definition}>
      <span
        className="border-b border-dotted cursor-help"
        style={{ borderColor: "var(--color-text-muted)" }}
      >
        {text}
      </span>
    </Tooltip>
  );
}

export { ACRONYMS };
